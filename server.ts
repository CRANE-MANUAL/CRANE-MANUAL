import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Request, Response } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(configPath, 'utf-8'),
);

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        projectId: firebaseConfig.projectId,
      });

const BOOTSTRAPPED_ADMIN_EMAIL = 'quvoaicode@gmail.com';
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function getCloudinaryConfig(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  missing: string[];
} {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

  const missing: string[] = [];
  if (!cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');

  return { cloudName, apiKey, apiSecret, missing };
}

function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const serialized = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto
    .createHash('sha1')
    .update(`${serialized}${apiSecret}`)
    .digest('hex');
}

interface FirestoreRestValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
  arrayValue?: { values?: FirestoreRestValue[] };
}

function parseFirestoreValue(val: FirestoreRestValue | undefined): unknown {
  if (!val) return undefined;
  if (typeof val.stringValue === 'string') return val.stringValue;
  if (typeof val.booleanValue === 'boolean') return val.booleanValue;
  if (typeof val.integerValue === 'string') return Number(val.integerValue);
  if (typeof val.timestampValue === 'string') return val.timestampValue;
  if (val.arrayValue) {
    return (val.arrayValue.values || []).map((v) => parseFirestoreValue(v));
  }
  return undefined;
}

async function fetchFirestoreDocWithCallerToken(
  docPath: string,
  idToken: string,
): Promise<Record<string, unknown> | null> {
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId,
  )}/databases/${encodeURIComponent(dbId)}/documents/${docPath}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`Firestore REST error: ${resp.status}`);
  }

  const json = (await resp.json()) as {
    fields?: Record<string, FirestoreRestValue>;
  };
  const out: Record<string, unknown> = {};
  if (json.fields) {
    for (const [k, v] of Object.entries(json.fields)) {
      out[k] = parseFirestoreValue(v);
    }
  }
  return out;
}

interface VerifiedCaller {
  uid: string;
  email: string;
  idToken: string;
}

async function verifyCaller(req: Request): Promise<VerifiedCaller> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, '認証トークンが見つかりません。ログインしてください。');
  }
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    throw new HttpError(401, '認証トークンが無効です。');
  }

  let decoded;
  try {
    decoded = await getAuth(adminApp).verifyIdToken(idToken);
  } catch {
    throw new HttpError(401, 'ログインセッションの検証に失敗しました。再ログインしてください。');
  }

  if (!decoded.email_verified) {
    throw new HttpError(403, 'メールアドレスの認証を完了してから操作してください。');
  }

  return {
    uid: decoded.uid,
    email: decoded.email || '',
    idToken,
  };
}

class HttpError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

async function getCallerPermissions(caller: VerifiedCaller): Promise<{
  isAdmin: boolean;
  canPost: boolean;
}> {
  if (caller.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return { isAdmin: true, canPost: true };
  }

  const userDoc = await fetchFirestoreDocWithCallerToken(
    `users/${encodeURIComponent(caller.uid)}`,
    caller.idToken,
  );
  if (!userDoc) {
    return { isAdmin: false, canPost: true };
  }

  const status = String(userDoc.status || 'active');
  const suspensionIndefinite =
    typeof userDoc.suspensionIndefinite === 'boolean'
      ? userDoc.suspensionIndefinite
      : status === 'suspended';
  const suspendedUntilRaw = String(userDoc.suspendedUntil || '');
  const suspendedUntilMs = suspendedUntilRaw ? Date.parse(suspendedUntilRaw) : 0;
  const isSuspActive =
    status === 'suspended' &&
    (suspensionIndefinite || (!Number.isNaN(suspendedUntilMs) && suspendedUntilMs > Date.now()));

  const role = String(userDoc.role || 'user');
  const isAdmin = role === 'admin' && !isSuspActive;

  if (!isSuspActive) {
    return { isAdmin, canPost: true };
  }

  const scope = String(userDoc.suspensionScope || 'all');
  const features = Array.isArray(userDoc.suspendedFeatures)
    ? userDoc.suspendedFeatures.map((x) => String(x))
    : [];
  const canPost = scope === 'partial' && !features.includes('post');

  return { isAdmin, canPost };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/cloudinary/status', (_req: Request, res: Response) => {
    const { missing } = getCloudinaryConfig();
    res.json({
      configured: missing.length === 0,
      missing,
    });
  });

  app.post('/api/cloudinary/sign', async (req: Request, res: Response) => {
    try {
      const caller = await verifyCaller(req);
      const { canPost } = await getCallerPermissions(caller);
      if (!canPost) {
        res.status(403).json({ error: '現在このアカウントでは画像の投稿・アップロードが制限されています。' });
        return;
      }

      const cfg = getCloudinaryConfig();
      if (cfg.missing.length > 0) {
        res.status(503).json({
          error: 'Cloudinaryの環境変数が未設定です。',
          missingEnvVars: cfg.missing,
        });
        return;
      }

      const body = (req.body || {}) as { mimeType?: unknown; fileSize?: unknown };
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
      const fileSize = typeof body.fileSize === 'number' ? body.fileSize : Number(body.fileSize);

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        res.status(400).json({
          error: 'JPEG / PNG / WebP 形式の画像ファイルのみアップロードできます。',
        });
        return;
      }

      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
        res.status(400).json({
          error: 'ファイルサイズは1ファイル最大10MBまでです。',
        });
        return;
      }

      const safeUid = caller.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
      if (!safeUid) {
        res.status(400).json({ error: 'ユーザーIDの検証に失敗しました。' });
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const folder = `crane_manual/${safeUid}`;
      const publicId = `cm_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
      const allowedFormats = 'jpg,jpeg,png,webp';

      const signature = signCloudinaryParams(
        {
          allowed_formats: allowedFormats,
          folder,
          public_id: publicId,
          timestamp,
        },
        cfg.apiSecret,
      );

      res.json({
        cloudName: cfg.cloudName,
        apiKey: cfg.apiKey,
        timestamp,
        signature,
        folder,
        publicId,
        allowedFormats,
        uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/upload`,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
        return;
      }
      console.error('Cloudinary sign error:', err);
      res.status(500).json({ error: 'アップロード署名の生成に失敗しました。' });
    }
  });

  app.post('/api/cloudinary/delete', async (req: Request, res: Response) => {
    try {
      const caller = await verifyCaller(req);
      const body = (req.body || {}) as { publicId?: unknown; imageId?: unknown };
      const publicId = typeof body.publicId === 'string' ? body.publicId.trim() : '';
      const imageId = typeof body.imageId === 'string' ? body.imageId.trim() : '';

      if (!publicId) {
        res.json({ ok: true, skipped: true });
        return;
      }

      if (
        publicId.length > 300 ||
        publicId.includes('..') ||
        !/^[a-zA-Z0-9_/\-]+$/.test(publicId)
      ) {
        res.status(400).json({ error: '無効な画像ID（public_id）が指定されました。' });
        return;
      }

      const { isAdmin, canPost } = await getCallerPermissions(caller);
      const safeUid = caller.uid.replace(/[^a-zA-Z0-9_-]/g, '');
      const isOwnedByFolder = Boolean(safeUid && publicId.startsWith(`crane_manual/${safeUid}/`));

      let authorized = isAdmin;
      if (!authorized && canPost) {
        if (isOwnedByFolder) {
          authorized = true;
        } else if (imageId && /^[a-zA-Z0-9_-]{1,128}$/.test(imageId)) {
          const imgDoc = await fetchFirestoreDocWithCallerToken(
            `postImages/${encodeURIComponent(imageId)}`,
            caller.idToken,
          );
          if (
            imgDoc &&
            String(imgDoc.authorId || '') === caller.uid &&
            String(imgDoc.publicId || '') === publicId
          ) {
            authorized = true;
          }
        }
      }

      if (!authorized) {
        res.status(403).json({ error: 'この画像を削除する権限がありません。' });
        return;
      }

      const cfg = getCloudinaryConfig();
      if (cfg.missing.length > 0) {
        res.status(503).json({
          error: 'Cloudinaryの環境変数が未設定のため、画像を削除できません。',
          missingEnvVars: cfg.missing,
        });
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signCloudinaryParams(
        {
          invalidate: 'true',
          public_id: publicId,
          timestamp,
        },
        cfg.apiSecret,
      );

      const form = new URLSearchParams();
      form.set('public_id', publicId);
      form.set('timestamp', String(timestamp));
      form.set('invalidate', 'true');
      form.set('api_key', cfg.apiKey);
      form.set('signature', signature);

      const destroyResp = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/destroy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        },
      );

      const destroyJson = (await destroyResp.json()) as {
        result?: string;
        error?: { message?: string };
      };

      if (!destroyResp.ok) {
        res.status(502).json({
          error: destroyJson.error?.message || 'Cloudinary上の画像削除に失敗しました。',
        });
        return;
      }

      if (destroyJson.result !== 'ok' && destroyJson.result !== 'not found') {
        res.status(502).json({
          error: `Cloudinary画像削除に失敗しました (${destroyJson.result || 'unknown'})`,
        });
        return;
      }

      res.json({ ok: true, result: destroyJson.result });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
        return;
      }
      console.error('Cloudinary delete error:', err);
      res.status(500).json({ error: '画像の削除処理に失敗しました。' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CRANE MANUAL server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
