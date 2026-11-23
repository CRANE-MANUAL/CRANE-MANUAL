import React, { useEffect, useState } from 'react';
import { deleteUser } from 'firebase/auth';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Edit3,
  FileText,
  HelpCircle,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Settings,
  ShieldAlert,
  Sun,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { isValidHttpUrl } from '../lib/firebase';
import {
  deletePostCascade,
  deleteUserAccountData,
  fetchAuthorPosts,
  markAllNotificationsRead,
  markNotificationRead,
  updateUserProfile,
} from '../lib/firestoreService';
import {
  Post,
  SUSPENDABLE_FEATURE_LABELS,
  VALIDATION_LIMITS,
} from '../types';
import { SafeImage } from './BrandLogo';
import { SupportChatPanel } from './SupportChatPanel';

type InfoDocType = 'terms' | 'privacy' | 'contact' | null;

export function MyPageView() {
  const {
    authUser,
    userProfile,
    isAdmin,
    needsEmailVerification,
    activeSuspension,
    isFeatureSuspended,
    suspensionExpiryLabel,
    isDarkMode,
    toggleDarkMode,
    notifications,
    unreadNotificationCount,
    setShowAuthModal,
    openCreatePost,
    openEditPost,
    openPostDetail,
    openAdminView,
    logoutUser,
    posts,
    draftPosts,
    refreshAllData,
    refreshUserSessionData,
    showToast,
  } = useApp();

  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [loadingMyPosts, setLoadingMyPosts] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [username, setUsername] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [bio, setBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [activeDoc, setActiveDoc] = useState<InfoDocType>(null);

  const [deleteTargetPost, setDeleteTargetPost] = useState<Post | null>(null);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setUsername(userProfile.username);
      setProfileImageUrl(userProfile.profileImageUrl);
      setBio(userProfile.bio);
    }
  }, [userProfile]);

  const loadMyPosts = async () => {
    if (!authUser || !authUser.emailVerified) {
      setMyPosts([]);
      return;
    }
    setLoadingMyPosts(true);
    try {
      const list = await fetchAuthorPosts(authUser.uid);
      setMyPosts(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMyPosts(false);
    }
  };

  useEffect(() => {
    void loadMyPosts();
  }, [authUser, needsEmailVerification, posts.length, draftPosts.length]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !userProfile) return;
    if (isFeatureSuspended('profile')) {
      const suffix = suspensionExpiryLabel ? `（${suspensionExpiryLabel}）` : '';
      showToast(`現在プロフィール編集機能が制限されています${suffix}。`, 'error');
      return;
    }
    if (!username.trim()) {
      showToast('ユーザー名を入力してください。', 'error');
      return;
    }
    if (profileImageUrl.trim() && !isValidHttpUrl(profileImageUrl)) {
      showToast(
        'プロフィール画像URLは http:// または https:// で始まるURLを入力してください。',
        'error',
      );
      return;
    }
    setSavingProfile(true);
    try {
      await updateUserProfile(authUser.uid, {
        username: username.trim(),
        profileImageUrl: profileImageUrl.trim(),
        bio: bio.trim(),
        email: authUser.email || userProfile.email,
      });
      await refreshUserSessionData();
      setEditingProfile(false);
      showToast('プロフィールを更新しました。', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'プロフィールの更新に失敗しました。',
        'error',
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteMyPost = async () => {
    if (!deleteTargetPost) return;
    if (!isAdmin && isFeatureSuspended('post')) {
      const suffix = suspensionExpiryLabel ? `（${suspensionExpiryLabel}）` : '';
      showToast(`現在投稿の削除機能が制限されています${suffix}。`, 'error');
      setDeleteTargetPost(null);
      return;
    }
    try {
      const idToken = await authUser?.getIdToken();
      await deletePostCascade(deleteTargetPost.postId, isAdmin, idToken);
      setDeleteTargetPost(null);
      showToast('投稿を削除しました。', 'success');
      await Promise.all([loadMyPosts(), refreshAllData()]);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '削除に失敗しました。',
        'error',
      );
    }
  };

  const handleDeleteAccount = async () => {
    if (!authUser) return;
    setDeletingAccount(true);
    try {
      await deleteUserAccountData(authUser.uid);
      await deleteUser(authUser);
      setShowDeleteAccountModal(false);
      showToast('アカウントと関連データを削除しました。', 'info');
      await refreshAllData();
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/requires-recent-login') {
        showToast(
          'セキュリティ保護のため、一度ログアウトして再ログインした後にアカウント削除を実行してください。',
          'error',
        );
      } else {
        showToast(
          err instanceof Error ? err.message : 'アカウント削除に失敗しました。',
          'error',
        );
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  const statusLabel = (status: Post['status']) => {
    if (status === 'draft') return '下書き';
    if (status === 'approved') return '公開中';
    if (status === 'rejected') return '却下';
    return '審査待ち';
  };

  return (
    <div className="space-y-6 pb-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        マイページ
      </h1>

      {/* Auth / Profile Card */}
      {!authUser || needsEmailVerification ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {needsEmailVerification
                ? 'メールアドレスの確認が必要です'
                : 'アカウントにログイン'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {needsEmailVerification
                ? '確認メールのリンクをクリックして認証を完了してください。'
                : '設定の投稿、審査状況の確認、いいね・お気に入り・通知機能が利用できます。'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <LogIn className="w-4 h-4" />
            <span>
              {needsEmailVerification ? 'メール認証を確認する' : 'ログイン / 新規登録'}
            </span>
          </button>
        </section>
      ) : (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                {userProfile?.profileImageUrl ? (
                  <SafeImage
                    src={userProfile.profileImageUrl}
                    alt={userProfile.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-7 h-7 text-slate-400" />
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                    {userProfile?.username || authUser.displayName || 'ユーザー'}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {authUser.email}
                </p>
                {userProfile?.bio && (
                  <p className="text-sm text-slate-700 dark:text-slate-300 pt-1">
                    {userProfile.bio}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isFeatureSuspended('profile')) {
                    const suffix = suspensionExpiryLabel ? `（${suspensionExpiryLabel}）` : '';
                    showToast(`現在プロフィール編集機能が制限されています${suffix}。`, 'error');
                    return;
                  }
                  setEditingProfile((v) => !v);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <Edit3 className="w-4 h-4" />
                <span>{editingProfile ? '編集を閉じる' : 'プロフィール編集'}</span>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={openAdminView}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0B1F3B] hover:bg-blue-900 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Settings className="w-4 h-4 text-sky-300" />
                  <span>システム設定</span>
                </button>
              )}
            </div>
          </div>

          {activeSuspension && userProfile && userProfile.suspensionScope === 'partial' && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-4 space-y-2 text-xs sm:text-sm">
              <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>一部機能の利用が制限されています（{suspensionExpiryLabel}）</span>
              </div>
              {userProfile.suspendedFeatures.length > 0 && (
                <p className="text-amber-800 dark:text-amber-300">
                  制限中の機能:{' '}
                  {userProfile.suspendedFeatures
                    .map((f) => SUSPENDABLE_FEATURE_LABELS[f])
                    .join('、')}
                </p>
              )}
              {userProfile.suspensionReason && (
                <p className="text-amber-800 dark:text-amber-300">
                  理由: {userProfile.suspensionReason}
                </p>
              )}
              <button
                type="button"
                onClick={() => setActiveDoc('contact')}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-amber-900/10 dark:bg-amber-400/15 font-semibold text-amber-900 dark:text-amber-200 hover:underline"
              >
                お問い合わせチャットを開く
              </button>
            </div>
          )}

          {editingProfile && (
            <form
              onSubmit={(e) => void handleSaveProfile(e)}
              className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ユーザー名
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={VALIDATION_LIMITS.usernameMax}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    プロフィール画像URL（任意・URL方式）
                  </label>
                  <input
                    type="url"
                    maxLength={VALIDATION_LIMITS.urlMax}
                    value={profileImageUrl}
                    onChange={(e) => setProfileImageUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  自己紹介（任意）
                </label>
                <textarea
                  rows={3}
                  maxLength={VALIDATION_LIMITS.bioMax}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="得意な設定やゲームセンターの担当経験などを記載できます"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProfile(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {savingProfile ? '保存中...' : 'プロフィールを保存'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Notifications List (when logged in) */}
      {authUser && !needsEmailVerification && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-700 dark:text-sky-400" />
              <span>通知一覧</span>
              {unreadNotificationCount > 0 && (
                <span className="text-xs font-mono-num text-blue-700 dark:text-sky-400">
                  （未読 {unreadNotificationCount} 件）
                </span>
              )}
            </h2>
            {unreadNotificationCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await markAllNotificationsRead(notifications);
                  await refreshUserSessionData();
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-blue-950/50 inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>すべて既読にする</span>
              </button>
            )}
          </div>

          {notifications.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.slice(0, 15).map((n) => (
                <div
                  key={n.notificationId}
                  className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    n.isRead ? 'opacity-70' : ''
                  }`}
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {!n.isRead && (
                        <span className="text-blue-700 dark:text-sky-400 mr-1.5">
                          [未読]
                        </span>
                      )}
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {n.message}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {n.postId && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!n.isRead) {
                            await markNotificationRead(n.notificationId);
                            void refreshUserSessionData();
                          }
                          openPostDetail(n.postId);
                        }}
                        className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-blue-700 dark:text-sky-400"
                      >
                        投稿を見る
                      </button>
                    )}
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={async () => {
                          await markNotificationRead(n.notificationId);
                          await refreshUserSessionData();
                        }}
                        className="min-h-[36px] px-3 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        既読
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              現在、通知はありません。
            </p>
          )}
        </section>
      )}

      {/* My Posts & Moderation Status */}
      {authUser && !needsEmailVerification && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                自分の投稿一覧
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                投稿した設定の確認や編集・削除を行えます。
              </p>
            </div>
            <button
              type="button"
              onClick={openCreatePost}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>新規投稿</span>
            </button>
          </div>

          {loadingMyPosts ? (
            <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : myPosts.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {myPosts.map((p) => (
                <div
                  key={p.postId}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span
                        className={
                          p.status === 'draft'
                            ? 'text-blue-700 dark:text-sky-400'
                            : p.status === 'approved'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : p.status === 'rejected'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                        }
                      >
                        [{statusLabel(p.status)}]
                      </span>
                      {p.clawType && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span className="text-blue-700 dark:text-sky-400">
                            {p.clawType}
                          </span>
                        </>
                      )}
                      {p.playType && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {p.playType}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        p.status === 'draft' ? openEditPost(p) : openPostDetail(p.postId)
                      }
                      className="text-left text-sm font-bold text-slate-900 dark:text-white hover:text-blue-700 dark:hover:text-sky-400 line-clamp-1"
                    >
                      {p.title.trim() || '（無題の下書き）'}
                    </button>
                    {p.status === 'rejected' && p.rejectionReason && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        却下理由: {p.rejectionReason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {p.status !== 'draft' && (
                      <button
                        type="button"
                        onClick={() => openPostDetail(p.postId)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        詳細
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditPost(p)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 ${
                        p.status === 'draft'
                          ? 'bg-blue-700 hover:bg-blue-800 text-white'
                          : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{p.status === 'draft' ? '編集して再開' : '編集'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetPost(p)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold text-red-600 dark:text-red-400 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>削除</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              まだ投稿した設定はありません。
            </p>
          )}
        </section>
      )}

      {/* Settings & Legal Links */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        <button
          type="button"
          onClick={toggleDarkMode}
          className="w-full min-h-[56px] px-5 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="inline-flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {isDarkMode ? (
              <Moon className="w-4 h-4 text-sky-400" />
            ) : (
              <Sun className="w-4 h-4 text-blue-700" />
            )}
            <span>表示テーマ（ダークモード切り替え）</span>
          </span>
          <span className="text-xs font-semibold text-blue-700 dark:text-sky-400">
            {isDarkMode ? 'ダーク' : 'ライト'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDoc('terms')}
          className="w-full min-h-[56px] px-5 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="inline-flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <FileText className="w-4 h-4 text-slate-500" />
            <span>利用規約</span>
          </span>
          <span className="text-xs text-slate-400">確認</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDoc('privacy')}
          className="w-full min-h-[56px] px-5 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="inline-flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <ShieldAlert className="w-4 h-4 text-slate-500" />
            <span>プライバシーポリシー</span>
          </span>
          <span className="text-xs text-slate-400">確認</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDoc('contact')}
          className="w-full min-h-[56px] px-5 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="inline-flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <HelpCircle className="w-4 h-4 text-slate-500" />
            <span>お問い合わせ（チャット）</span>
          </span>
          <span className="text-xs text-slate-400">チャットを開く</span>
        </button>

        {authUser && (
          <>
            <button
              type="button"
              onClick={() => void logoutUser()}
              className="w-full min-h-[56px] px-5 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            >
              <span className="inline-flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <LogOut className="w-4 h-4 text-slate-500" />
                <span>ログアウト</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteAccountModal(true)}
              className="w-full min-h-[56px] px-5 py-3 flex items-center justify-between text-left hover:bg-red-50/70 dark:hover:bg-red-950/30 transition-colors"
            >
              <span className="inline-flex items-center gap-3 text-sm font-semibold text-red-600 dark:text-red-400">
                <Trash2 className="w-4 h-4" />
                <span>アカウント削除</span>
              </span>
            </button>
          </>
        )}
      </section>

      {/* Info / Legal / Contact Modal */}
      {activeDoc && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {activeDoc === 'terms'
                  ? 'CRANE MANUAL 利用規約'
                  : activeDoc === 'privacy'
                    ? 'プライバシーポリシー'
                    : 'サポートチャット（お問い合わせ）'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveDoc(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeDoc === 'terms' && (
              <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-3 leading-relaxed">
                <p>
                  1. CRANE MANUALは、クレーンゲームの設定方法・景品配置に関するノウハウを共有するための専門サービスです。
                </p>
                <p>
                  2. 投稿者は第三者の著作権・肖像権・営業秘密を侵害しない情報のみを投稿してください。画像をアップロードする場合は、ご自身で撮影した写真または利用許諾を得た画像のみを使用し、無断転載を行わないでください。
                </p>
                <p>
                  3. 投稿内容はガイドラインに基づき公開されます。虚偽情報や不適切な内容が含まれる場合、非公開または削除されることがあります。
                </p>
                <p>
                  4. 本サービスの掲載情報を利用した結果について、CRANE MANUALは一切の責任を負いません。
                </p>
              </div>
            )}

            {activeDoc === 'privacy' && (
              <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-3 leading-relaxed">
                <p>
                  1. CRANE MANUALは、アカウント認証およびサービス提供のためにメールアドレス、ユーザー名、プロフィール情報を取り扱います。
                </p>
                <p>
                  2. メールアドレス等の個人情報は非公開データとして厳重に管理され、他の一般ユーザーに公開されることはありません。
                </p>
                <p>
                  3. お気に入り登録情報は登録者本人のみが閲覧できる設定となっており、第三者へ開示されません。
                </p>
                <p>
                  4. ユーザーはマイページの「アカウント削除」からいつでも自身のアカウントおよび投稿データを削除できます。
                </p>
              </div>
            )}

            {activeDoc === 'contact' && <SupportChatPanel />}
          </div>
        </div>
      )}

      {/* Delete Own Post Confirm */}
      {deleteTargetPost && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-sm w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              投稿を削除しますか？
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              「{deleteTargetPost.title}」を削除します。この操作は取り消せません。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetPost(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteMyPost()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirm */}
      {showDeleteAccountModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-sm w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-red-600 dark:text-red-400">
              アカウントを削除しますか？
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              アカウントを削除すると、あなたのプロフィール、投稿、お気に入り、通知データがすべて削除され、元に戻せません。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteAccountModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => void handleDeleteAccount()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {deletingAccount ? '削除中...' : '完全に削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
