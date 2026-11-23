import {
  CLOUDINARY_ALLOWED_MIME_TYPES,
  CLOUDINARY_MAX_FILE_BYTES,
} from '../types';

export interface CloudinaryStatusResponse {
  configured: boolean;
  missing: string[];
}

interface CloudinarySignResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  allowedFormats: string;
  uploadUrl: string;
  error?: string;
  missingEnvVars?: string[];
}

export function validateImageFile(file: File): string | null {
  const mime = (file.type || '').toLowerCase();
  if (!CLOUDINARY_ALLOWED_MIME_TYPES.includes(mime as (typeof CLOUDINARY_ALLOWED_MIME_TYPES)[number])) {
    return `「${file.name}」は対応していない形式です。JPEG / PNG / WebP の画像ファイルを選択してください。`;
  }
  if (file.size <= 0) {
    return `「${file.name}」のファイルサイズが0バイトです。`;
  }
  if (file.size > CLOUDINARY_MAX_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `「${file.name}」(${mb}MB) は上限の10MBを超えています。10MB以下の画像を選択してください。`;
  }
  return null;
}

export async function checkCloudinaryStatus(): Promise<CloudinaryStatusResponse> {
  try {
    const resp = await fetch('/api/cloudinary/status');
    if (!resp.ok) {
      return {
        configured: false,
        missing: [
          'CLOUDINARY_CLOUD_NAME',
          'CLOUDINARY_API_KEY',
          'CLOUDINARY_API_SECRET',
        ],
      };
    }
    return (await resp.json()) as CloudinaryStatusResponse;
  } catch {
    return {
      configured: false,
      missing: [
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
      ],
    };
  }
}

export async function uploadImageToCloudinary(
  file: File,
  idToken: string,
  onProgress: (percent: number) => void,
): Promise<{ imageUrl: string; publicId: string }> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  onProgress(3);

  const signResp = await fetch('/api/cloudinary/sign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      mimeType: file.type,
      fileSize: file.size,
    }),
  });

  const signData = (await signResp.json().catch(() => ({}))) as Partial<CloudinarySignResponse>;
  if (!signResp.ok || !signData.uploadUrl || !signData.signature || !signData.apiKey) {
    throw new Error(
      signData.error || 'アップロード署名の取得に失敗しました。環境変数設定やログイン状態を確認してください。',
    );
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signData.apiKey);
  formData.append('timestamp', String(signData.timestamp));
  formData.append('signature', signData.signature);
  formData.append('folder', signData.folder || '');
  formData.append('public_id', signData.publicId || '');
  formData.append('allowed_formats', signData.allowedFormats || 'jpg,jpeg,png,webp');

  return new Promise<{ imageUrl: string; publicId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', signData.uploadUrl!);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        const pct = Math.min(98, Math.max(5, Math.round((evt.loaded / evt.total) * 95)));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          secure_url?: string;
          public_id?: string;
          error?: { message?: string };
        };

        if (xhr.status >= 200 && xhr.status < 300 && parsed.secure_url && parsed.public_id) {
          if (!parsed.secure_url.startsWith('https://')) {
            reject(new Error('Cloudinaryから安全なHTTPS URLが返却されませんでした。'));
            return;
          }
          onProgress(100);
          resolve({
            imageUrl: parsed.secure_url,
            publicId: parsed.public_id,
          });
        } else {
          reject(
            new Error(
              parsed.error?.message || `画像のアップロードに失敗しました (HTTP ${xhr.status})`,
            ),
          );
        }
      } catch {
        reject(new Error('アップロード応答の解析に失敗しました。'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('ネットワークエラーにより画像をアップロードできませんでした。'));
    };

    xhr.onabort = () => {
      reject(new Error('アップロードが中断されました。'));
    };

    xhr.send(formData);
  });
}

export async function deleteCloudinaryImage(
  publicId: string,
  idToken: string,
  imageId?: string,
): Promise<void> {
  if (!publicId || !publicId.trim()) return;

  const resp = await fetch('/api/cloudinary/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      publicId: publicId.trim(),
      imageId: imageId?.trim() || undefined,
    }),
  });

  const json = (await resp.json().catch(() => ({}))) as { error?: string };
  if (!resp.ok) {
    throw new Error(json.error || 'Cloudinary上の画像削除に失敗しました。');
  }
}
