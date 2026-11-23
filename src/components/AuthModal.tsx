import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  CheckCircle2,
  KeyRound,
  LogIn,
  Mail,
  RefreshCw,
  UserPlus,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { auth, googleProvider } from '../lib/firebase';
import { BrandWordmark } from './BrandLogo';

type AuthMode = 'login' | 'register' | 'reset';

function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'メール認証プロバイダが未有効です。Googleログインをご利用いただくか、システム設定（Firebase Authentication）をご確認ください。';
    case 'auth/email-already-in-use':
      return 'このメールアドレスはすでに登録されています。ログインをお試しください。';
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません。';
    case 'auth/weak-password':
      return 'パスワードは6文字以上で設定してください。';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'メールアドレスまたはパスワードが正しくありません。';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく時間をおいてから再度お試しください。';
    case 'auth/popup-closed-by-user':
      return 'Googleログインのポップアップが閉じられました。';
    default:
      return err instanceof Error ? err.message : '認証処理に失敗しました。';
  }
}

export function AuthModal() {
  const {
    showAuthModal,
    setShowAuthModal,
    authUser,
    needsEmailVerification,
    refreshEmailVerification,
    resendVerificationEmail,
    logoutUser,
    showToast,
  } = useApp();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  if (!showAuthModal) return null;

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Googleアカウントでログインしました。', 'success');
      setShowAuthModal(false);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('メールアドレスを入力してください。');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        if (!password) {
          setErrorMsg('パスワードを入力してください。');
          setLoading(false);
          return;
        }
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        if (!cred.user.emailVerified) {
          setInfoMsg(
            'メールアドレスの確認が完了していません。確認メールのリンクをクリックした後、「確認状態を更新」を押してください。',
          );
        } else {
          showToast('ログインしました。', 'success');
          setShowAuthModal(false);
        }
      } else if (mode === 'register') {
        if (!username.trim()) {
          setErrorMsg('ユーザー名を入力してください。');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setErrorMsg('パスワードは6文字以上で入力してください。');
          setLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: username.trim().slice(0, 40) });
        await sendEmailVerification(cred.user);
        setInfoMsg(
          '仮登録が完了し、確認メールを送信しました。メール内のリンクをクリックした後、下の「確認状態を更新」を押してください。',
        );
      } else {
        await sendPasswordResetEmail(auth, cleanEmail);
        setInfoMsg('パスワード再設定用のメールを送信しました。受信トレイをご確認ください。');
      }
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="ログイン・会員登録"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 space-y-5 relative">
        <button
          type="button"
          onClick={() => setShowAuthModal(false)}
          aria-label="閉じる"
          className="absolute top-4 right-4 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-2">
          <BrandWordmark />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white pt-1">
            {needsEmailVerification
              ? 'メールアドレスの確認'
              : mode === 'login'
                ? 'ログイン'
                : mode === 'register'
                  ? '新規会員登録'
                  : 'パスワード再設定'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            設定情報の投稿、いいね、お気に入り登録にはアカウント認証が必要です。
          </p>
        </div>

        {needsEmailVerification && authUser ? (
          <div className="space-y-4 bg-sky-50 dark:bg-blue-950/40 border border-sky-200 dark:border-blue-900 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-700 dark:text-sky-400 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-700 dark:text-slate-200 space-y-1">
                <p className="font-semibold">
                  {authUser.email} 宛に確認メールを送信しました。
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  メール内のリンクを開いて認証を完了したあと、下のボタンを押してください。
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={async () => {
                  const ok = await refreshEmailVerification();
                  if (ok) setShowAuthModal(false);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>確認状態を更新して続行</span>
              </button>
              <button
                type="button"
                onClick={() => void resendVerificationEmail()}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-white dark:hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>確認メールを再送信</span>
              </button>
              <button
                type="button"
                onClick={() => void logoutUser()}
                className="w-full min-h-[40px] text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                別のアカウントでログインし直す
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleGoogleLogin()}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>Googleでログイン</span>
            </button>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span>またはメールアドレスで</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg('');
                  setInfoMsg('');
                }}
                className={`min-h-[40px] px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                ログイン
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg('');
                  setInfoMsg('');
                }}
                className={`min-h-[40px] px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                新規登録
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setErrorMsg('');
                  setInfoMsg('');
                }}
                className={`min-h-[40px] px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  mode === 'reset'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                パスワード再設定
              </button>
            </div>

            <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3.5">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ユーザー名
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="例：クレーン攻略マン"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  メールアドレス
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {mode !== 'reset' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    パスワード（6文字以上）
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 leading-relaxed">
                  {errorMsg}
                </div>
              )}

              {infoMsg && (
                <div className="p-3 rounded-xl bg-sky-50 dark:bg-blue-950/50 border border-sky-200 dark:border-blue-900 text-xs text-blue-800 dark:text-sky-300 leading-relaxed">
                  {infoMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {mode === 'login' ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'ログイン中...' : 'メールアドレスでログイン'}</span>
                  </>
                ) : mode === 'register' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>{loading ? '登録中...' : '新規アカウントを作成'}</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>{loading ? '送信中...' : '再設定メールを送信'}</span>
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
