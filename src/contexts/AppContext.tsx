import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signOut,
  User,
} from 'firebase/auth';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL } from '../lib/firebase';
import {
  ensureUserProfile,
  fetchActiveRecommendations,
  fetchApprovedPosts,
  fetchAuthorDrafts,
  fetchCategories,
  fetchNotifications,
  fetchUserFavorites,
  fetchUserLikes,
  toggleFavorite,
  toggleLike,
} from '../lib/firestoreService';
import {
  CategoryItem,
  DEFAULT_CLAW_TYPES,
  DEFAULT_PLAY_TYPES,
  NavTab,
  NotificationItem,
  Post,
  Recommendation,
  SearchFilters,
  SUSPENDABLE_FEATURE_LABELS,
  SuspendableFeature,
  UserProfile,
} from '../types';

export interface ToastMessage {
  id: string;
  text: string;
  variant: 'success' | 'error' | 'info';
}

interface AppContextValue {
  authUser: User | null;
  userProfile: UserProfile | null;
  authReady: boolean;
  isAdmin: boolean;
  needsEmailVerification: boolean;
  activeSuspension: boolean;
  isFullySuspended: boolean;
  isFeatureSuspended: (feature: SuspendableFeature) => boolean;
  suspensionExpiryLabel: string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  selectedPostId: string | null;
  openPostDetail: (postId: string) => void;
  closePostDetail: () => void;
  showAdminView: boolean;
  openAdminView: () => void;
  closeAdminView: () => void;
  showAuthModal: boolean;
  setShowAuthModal: (open: boolean) => void;
  showPostFormModal: boolean;
  editingPost: Post | null;
  openCreatePost: () => void;
  openEditPost: (post: Post) => void;
  closePostForm: () => void;
  searchFilters: SearchFilters;
  setSearchFilters: React.Dispatch<React.SetStateAction<SearchFilters>>;
  navigateToSearch: (partial?: Partial<SearchFilters>) => void;
  posts: Post[];
  draftPosts: Post[];
  loadingPosts: boolean;
  categories: CategoryItem[];
  clawTypes: string[];
  playTypes: string[];
  recommendations: Recommendation[];
  likedPostIds: Set<string>;
  favoritedPostIds: Set<string>;
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  recentlyViewedIds: string[];
  refreshAllData: () => Promise<void>;
  refreshUserSessionData: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
  resendVerificationEmail: () => Promise<void>;
  logoutUser: () => Promise<void>;
  handleToggleLike: (post: Post) => Promise<void>;
  handleToggleFavorite: (post: Post) => Promise<void>;
  toasts: ToastMessage[];
  showToast: (text: string, variant?: ToastMessage['variant']) => void;
  dismissToast: (id: string) => void;
}

const DEFAULT_FILTERS: SearchFilters = {
  keyword: '',
  scope: 'all',
  clawType: '',
  playType: '',
  difficulty: '',
  sort: 'newest',
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

const RECENT_KEY = 'crane_manual_recent_posts_v1';
const THEME_KEY = 'crane_manual_theme_v1';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const [activeTab, setActiveTabState] = useState<NavTab>('home');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showAdminView, setShowAdminView] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPostFormModal, setShowPostFormModal] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [posts, setPosts] = useState<Post[]>([]);
  const [draftPosts, setDraftPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [favoritedPostIds, setFavoritedPostIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
    } catch {
      return [];
    }
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (text: string, variant: ToastMessage['variant'] = 'info') => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, text, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    window.localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  const needsEmailVerification = Boolean(authUser && !authUser.emailVerified);

  const activeSuspension = useMemo(() => {
    if (!userProfile || userProfile.status !== 'suspended') return false;
    if (userProfile.suspensionIndefinite) return true;
    const until = new Date(userProfile.suspendedUntil).getTime();
    return !Number.isNaN(until) && until > nowMs;
  }, [userProfile, nowMs]);

  const isBootstrappedAdmin = useMemo(
    () =>
      Boolean(
        authUser?.emailVerified &&
          authUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase(),
      ),
    [authUser],
  );

  const isAdmin = useMemo(() => {
    if (!authUser || !authUser.emailVerified) return false;
    if (isBootstrappedAdmin) return true;
    return userProfile?.role === 'admin' && !activeSuspension;
  }, [authUser, isBootstrappedAdmin, userProfile, activeSuspension]);

  const isFullySuspended = useMemo(
    () =>
      Boolean(
        activeSuspension &&
          !isBootstrappedAdmin &&
          userProfile?.suspensionScope !== 'partial',
      ),
    [activeSuspension, isBootstrappedAdmin, userProfile],
  );

  const isFeatureSuspended = useCallback(
    (feature: SuspendableFeature): boolean => {
      if (!activeSuspension || isBootstrappedAdmin || !userProfile) return false;
      if (userProfile.suspensionScope === 'all') return true;
      if (userProfile.suspensionScope === 'partial') {
        return userProfile.suspendedFeatures.includes(feature);
      }
      return false;
    },
    [activeSuspension, isBootstrappedAdmin, userProfile],
  );

  const suspensionExpiryLabel = useMemo(() => {
    if (!activeSuspension || !userProfile) return '';
    if (userProfile.suspensionIndefinite) return '無期限';
    try {
      return `${new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(userProfile.suspendedUntil))} まで`;
    } catch {
      return '';
    }
  }, [activeSuspension, userProfile]);

  const refreshPublicData = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const [approvedPosts, activeRecs, activeCats] = await Promise.all([
        fetchApprovedPosts(),
        fetchActiveRecommendations(),
        fetchCategories(false),
      ]);
      setPosts(approvedPosts);
      setRecommendations(activeRecs);
      setCategories(activeCats);
    } catch (err) {
      console.error('Failed loading public data:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  const refreshUserData = useCallback(async (user: User | null) => {
    if (!user || !user.emailVerified) {
      setUserProfile(null);
      setLikedPostIds(new Set());
      setFavoritedPostIds(new Set());
      setNotifications([]);
      setDraftPosts([]);
      return;
    }
    try {
      const profile = await ensureUserProfile(user);
      setUserProfile(profile);
      const [likes, favs, notifs, drafts] = await Promise.all([
        fetchUserLikes(user.uid),
        fetchUserFavorites(user.uid),
        fetchNotifications(user.uid),
        fetchAuthorDrafts(user.uid),
      ]);
      setLikedPostIds(likes);
      setFavoritedPostIds(favs);
      setNotifications(notifs);
      setDraftPosts(drafts);
    } catch (err) {
      console.error('Failed loading user data:', err);
    }
  }, []);

  useEffect(() => {
    void refreshPublicData();
  }, [refreshPublicData]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      await refreshUserData(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, [refreshUserData]);

  useEffect(() => {
    const checkConsoleRoute = () => {
      if (
        isAdmin &&
        (window.location.pathname === '/console' || window.location.hash === '#console')
      ) {
        setShowAdminView(true);
      } else if (!isAdmin) {
        setShowAdminView(false);
      }
    };
    checkConsoleRoute();
    window.addEventListener('popstate', checkConsoleRoute);
    window.addEventListener('hashchange', checkConsoleRoute);
    return () => {
      window.removeEventListener('popstate', checkConsoleRoute);
      window.removeEventListener('hashchange', checkConsoleRoute);
    };
  }, [isAdmin]);

  const refreshAllData = useCallback(async () => {
    await Promise.all([refreshPublicData(), refreshUserData(auth.currentUser)]);
  }, [refreshPublicData, refreshUserData]);

  const refreshUserSessionData = useCallback(async () => {
    await refreshUserData(auth.currentUser);
  }, [refreshUserData]);

  const refreshEmailVerification = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    const updated = auth.currentUser;
    setAuthUser(updated);
    if (updated?.emailVerified) {
      await refreshUserData(updated);
      showToast('メールアドレスの確認が完了しました。', 'success');
      return true;
    }
    showToast('まだメール認証が完了していません。メール内のリンクをご確認ください。', 'info');
    return false;
  }, [refreshUserData, showToast]);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
    showToast('確認メールを再送信しました。受信トレイをご確認ください。', 'success');
  }, [showToast]);

  const logoutUser = useCallback(async () => {
    await signOut(auth);
    setUserProfile(null);
    setLikedPostIds(new Set());
    setFavoritedPostIds(new Set());
    setNotifications([]);
    setDraftPosts([]);
    setShowAdminView(false);
    showToast('ログアウトしました。', 'info');
  }, [showToast]);

  const setActiveTab = useCallback((tab: NavTab) => {
    setActiveTabState(tab);
    setSelectedPostId(null);
    setShowAdminView(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openPostDetail = useCallback((postId: string) => {
    setSelectedPostId(postId);
    setShowAdminView(false);
    setRecentlyViewedIds((prev) => {
      const next = [postId, ...prev.filter((id) => id !== postId)].slice(0, 10);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const closePostDetail = useCallback(() => {
    setSelectedPostId(null);
  }, []);

  const openAdminView = useCallback(() => {
    if (!isAdmin) return;
    setSelectedPostId(null);
    setShowAdminView(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isAdmin]);

  const closeAdminView = useCallback(() => {
    setShowAdminView(false);
    if (window.location.hash === '#console' || window.location.pathname === '/console') {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  const notifyFeatureSuspended = useCallback(
    (feature: SuspendableFeature) => {
      const label = SUSPENDABLE_FEATURE_LABELS[feature];
      const suffix = suspensionExpiryLabel ? `（${suspensionExpiryLabel}）` : '';
      showToast(`現在このアカウントでは「${label}」機能が停止されています${suffix}。`, 'error');
    },
    [suspensionExpiryLabel, showToast],
  );

  const openCreatePost = useCallback(() => {
    if (!authUser) {
      setShowAuthModal(true);
      showToast('設定を投稿するにはログインが必要です。', 'info');
      return;
    }
    if (!authUser.emailVerified) {
      setShowAuthModal(true);
      showToast('メールアドレスの認証を完了してください。', 'info');
      return;
    }
    if (isFeatureSuspended('post')) {
      notifyFeatureSuspended('post');
      return;
    }
    setEditingPost(null);
    setShowPostFormModal(true);
  }, [authUser, isFeatureSuspended, notifyFeatureSuspended, showToast]);

  const openEditPost = useCallback(
    (post: Post) => {
      if (!authUser || !authUser.emailVerified) {
        setShowAuthModal(true);
        return;
      }
      if (post.authorId !== authUser.uid && !isAdmin) {
        showToast('他人の投稿は編集できません。', 'error');
        return;
      }
      if (!isAdmin && isFeatureSuspended('post')) {
        notifyFeatureSuspended('post');
        return;
      }
      setEditingPost(post);
      setShowPostFormModal(true);
    },
    [authUser, isAdmin, isFeatureSuspended, notifyFeatureSuspended, showToast],
  );

  const closePostForm = useCallback(() => {
    setShowPostFormModal(false);
    setEditingPost(null);
  }, []);

  const navigateToSearch = useCallback((partial?: Partial<SearchFilters>) => {
    if (partial) {
      setSearchFilters((prev) => ({ ...prev, ...partial }));
    }
    setSelectedPostId(null);
    setShowAdminView(false);
    setActiveTabState('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleToggleLike = useCallback(
    async (post: Post) => {
      if (!authUser) {
        setShowAuthModal(true);
        showToast('いいねするにはログインが必要です。', 'info');
        return;
      }
      if (!authUser.emailVerified) {
        setShowAuthModal(true);
        return;
      }
      if (isFeatureSuspended('like')) {
        notifyFeatureSuspended('like');
        return;
      }
      const currentlyLiked = likedPostIds.has(post.postId);
      try {
        const nextLiked = await toggleLike(
          authUser.uid,
          userProfile?.username || authUser.displayName || 'ユーザー',
          post,
          currentlyLiked,
        );
        setLikedPostIds((prev) => {
          const next = new Set(prev);
          if (nextLiked) next.add(post.postId);
          else next.delete(post.postId);
          return next;
        });
        setPosts((prev) =>
          prev.map((p) =>
            p.postId === post.postId
              ? { ...p, likesCount: Math.max(0, p.likesCount + (nextLiked ? 1 : -1)) }
              : p,
          ),
        );
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'いいねの更新に失敗しました。',
          'error',
        );
      }
    },
    [authUser, likedPostIds, userProfile, isFeatureSuspended, notifyFeatureSuspended, showToast],
  );

  const handleToggleFavorite = useCallback(
    async (post: Post) => {
      if (!authUser) {
        setShowAuthModal(true);
        showToast('お気に入り登録にはログインが必要です。', 'info');
        return;
      }
      if (!authUser.emailVerified) {
        setShowAuthModal(true);
        return;
      }
      if (isFeatureSuspended('favorite')) {
        notifyFeatureSuspended('favorite');
        return;
      }
      const currentlyFav = favoritedPostIds.has(post.postId);
      try {
        const nextFav = await toggleFavorite(authUser.uid, post, currentlyFav);
        setFavoritedPostIds((prev) => {
          const next = new Set(prev);
          if (nextFav) next.add(post.postId);
          else next.delete(post.postId);
          return next;
        });
        setPosts((prev) =>
          prev.map((p) =>
            p.postId === post.postId
              ? {
                  ...p,
                  favoritesCount: Math.max(0, p.favoritesCount + (nextFav ? 1 : -1)),
                }
              : p,
          ),
        );
        showToast(
          nextFav ? 'お気に入りに登録しました。' : 'お気に入りを解除しました。',
          'success',
        );
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'お気に入りの更新に失敗しました。',
          'error',
        );
      }
    },
    [authUser, favoritedPostIds, isFeatureSuspended, notifyFeatureSuspended, showToast],
  );

  const clawTypes = useMemo(() => {
    const active = categories
      .filter((c) => c.kind === 'claw' && c.isActive)
      .map((c) => c.name);
    return active.length > 0 ? active : DEFAULT_CLAW_TYPES;
  }, [categories]);

  const playTypes = useMemo(() => {
    const active = categories
      .filter((c) => c.kind === 'play' && c.isActive)
      .map((c) => c.name);
    return active.length > 0 ? active : DEFAULT_PLAY_TYPES;
  }, [categories]);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const value: AppContextValue = {
    authUser,
    userProfile,
    authReady,
    isAdmin,
    needsEmailVerification,
    activeSuspension,
    isFullySuspended,
    isFeatureSuspended,
    suspensionExpiryLabel,
    isDarkMode,
    toggleDarkMode,
    activeTab,
    setActiveTab,
    selectedPostId,
    openPostDetail,
    closePostDetail,
    showAdminView,
    openAdminView,
    closeAdminView,
    showAuthModal,
    setShowAuthModal,
    showPostFormModal,
    editingPost,
    openCreatePost,
    openEditPost,
    closePostForm,
    searchFilters,
    setSearchFilters,
    navigateToSearch,
    posts,
    draftPosts,
    loadingPosts,
    categories,
    clawTypes,
    playTypes,
    recommendations,
    likedPostIds,
    favoritedPostIds,
    notifications,
    unreadNotificationCount,
    recentlyViewedIds,
    refreshAllData,
    refreshUserSessionData,
    refreshEmailVerification,
    resendVerificationEmail,
    logoutUser,
    handleToggleLike,
    handleToggleFavorite,
    toasts,
    showToast,
    dismissToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
