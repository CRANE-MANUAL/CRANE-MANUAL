import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Award,
  BarChart3,
  Check,
  Clock,
  Database,
  Edit3,
  Flag,
  FolderCog,
  Image as ImageIcon,
  MessageCircle,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Sliders,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  adminModeratePost,
  deleteCategory,
  deletePostCascade,
  deleteRecommendation,
  deleteSinglePostImage,
  fetchAllPostImagesAdmin,
  fetchAllPostsAdmin,
  fetchAllRecommendationsAdmin,
  fetchAllUsersAdmin,
  fetchCategories,
  fetchReportsAdmin,
  seedDefaultCategoriesAndSamples,
  sendAdminAnnouncement,
  sendInquiryMessage,
  subscribeAllInquiriesAdmin,
  subscribeInquiryMessages,
  updateInquiryStatus,
  updateReportStatus,
  updateUserRoleOrStatusAdmin,
  upsertCategory,
  upsertRecommendation,
} from '../lib/firestoreService';
import { SafeImage } from './BrandLogo';
import {
  CategoryItem,
  CategoryKind,
  Inquiry,
  InquiryMessage,
  Post,
  PostImage,
  PostStatus,
  Recommendation,
  Report,
  ReportStatus,
  SUSPENDABLE_FEATURE_LABELS,
  SUSPENDABLE_FEATURES,
  SuspendableFeature,
  SuspensionScope,
  UserProfile,
  UserStatus,
  VALIDATION_LIMITS,
} from '../types';

type AdminTab =
  | 'posts'
  | 'images'
  | 'recommendations'
  | 'categories'
  | 'reports'
  | 'users'
  | 'stats';

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTimeJa(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AdminDashboardView() {
  const {
    authUser,
    userProfile,
    isAdmin,
    closeAdminView,
    openPostDetail,
    openEditPost,
    openCreatePost,
    refreshAllData,
    showToast,
  } = useApp();

  const [tab, setTab] = useState<AdminTab>('posts');
  const [loading, setLoading] = useState(true);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [allImages, setAllImages] = useState<PostImage[]>([]);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [allRecs, setAllRecs] = useState<Recommendation[]>([]);
  const [allCats, setAllCats] = useState<CategoryItem[]>([]);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allInquiries, setAllInquiries] = useState<Inquiry[]>([]);

  const [postFilter, setPostFilter] = useState<'all' | PostStatus>('all');
  const [rejectTarget, setRejectTarget] = useState<Post | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Recommendation form
  const [recPostId, setRecPostId] = useState('');
  const [recComment, setRecComment] = useState('');
  const [recOrder, setRecOrder] = useState(1);

  // Category form
  const [catKind, setCatKind] = useState<CategoryKind>('claw');
  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState(1);

  // Announcement form
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [seeding, setSeeding] = useState(false);

  // Granular suspension editor modal
  const [suspendTarget, setSuspendTarget] = useState<UserProfile | null>(null);
  const [suspStatus, setSuspStatus] = useState<UserStatus>('suspended');
  const [suspScope, setSuspScope] = useState<SuspensionScope>('all');
  const [suspFeatures, setSuspFeatures] = useState<SuspendableFeature[]>(['post']);
  const [suspIndefinite, setSuspIndefinite] = useState(false);
  const [suspUntilLocal, setSuspUntilLocal] = useState(() =>
    toLocalDateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  );
  const [suspReason, setSuspReason] = useState('');
  const [savingSuspension, setSavingSuspension] = useState(false);

  // Support chat viewer
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [inquiryMessages, setInquiryMessages] = useState<InquiryMessage[]>([]);
  const [supportReplyText, setSupportReplyText] = useState('');
  const [sendingSupportReply, setSendingSupportReply] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const loadAdminData = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [p, imgs, r, c, rep, u] = await Promise.all([
        fetchAllPostsAdmin(),
        fetchAllPostImagesAdmin(),
        fetchAllRecommendationsAdmin(),
        fetchCategories(true),
        fetchReportsAdmin(),
        fetchAllUsersAdmin(),
      ]);
      setAllPosts(p);
      setAllImages(imgs);
      setAllRecs(r);
      setAllCats(c);
      setAllReports(rep);
      setAllUsers(u);
      const firstApproved = p.find((x) => x.status === 'approved');
      if (firstApproved && !recPostId) {
        setRecPostId(firstApproved.postId);
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'データの取得に失敗しました。',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void loadAdminData();
    const unsubInq = subscribeAllInquiriesAdmin((items) => {
      setAllInquiries(items);
      setSelectedInquiryId((prev) => {
        if (prev && items.some((i) => i.inquiryId === prev)) return prev;
        return items.length > 0 ? items[0].inquiryId : null;
      });
    });
    return () => unsubInq();
  }, [isAdmin]);

  const activeInquiry = useMemo(
    () => allInquiries.find((i) => i.inquiryId === selectedInquiryId) || null,
    [allInquiries, selectedInquiryId],
  );

  useEffect(() => {
    if (!isAdmin || !activeInquiry) {
      setInquiryMessages([]);
      return;
    }
    const unsub = subscribeInquiryMessages(
      activeInquiry.inquiryId,
      activeInquiry.userId,
      true,
      (msgs) => {
        setInquiryMessages(msgs);
      },
    );
    return () => unsub();
  }, [isAdmin, activeInquiry?.inquiryId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [inquiryMessages.length]);

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-12 text-center space-y-4 max-w-lg mx-auto my-8">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          お探しのページは見つかりませんでした
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          URLをご確認のうえ、ホーム画面へお戻りください。
        </p>
        <button
          type="button"
          onClick={closeAdminView}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ホームへ戻る</span>
        </button>
      </div>
    );
  }

  const publishedOrModeratedPosts = useMemo(
    () => allPosts.filter((p) => p.status !== 'draft'),
    [allPosts],
  );

  const filteredPosts = useMemo(
    () =>
      postFilter === 'all'
        ? publishedOrModeratedPosts
        : publishedOrModeratedPosts.filter((p) => p.status === postFilter),
    [publishedOrModeratedPosts, postFilter],
  );

  const approvedPosts = useMemo(
    () => publishedOrModeratedPosts.filter((p) => p.status === 'approved'),
    [publishedOrModeratedPosts],
  );

  const statsSummary = useMemo(() => {
    const pending = publishedOrModeratedPosts.filter((p) => p.status === 'pending').length;
    const approved = publishedOrModeratedPosts.filter((p) => p.status === 'approved').length;
    const rejected = publishedOrModeratedPosts.filter((p) => p.status === 'rejected').length;
    const totalViews = publishedOrModeratedPosts.reduce((s, p) => s + p.viewsCount, 0);
    const totalLikes = publishedOrModeratedPosts.reduce((s, p) => s + p.likesCount, 0);
    const openReports = allReports.filter((r) => r.status === 'pending').length;

    const byClaw: Record<string, number> = {};
    const byPlay: Record<string, number> = {};
    publishedOrModeratedPosts.forEach((p) => {
      byClaw[p.clawType] = (byClaw[p.clawType] || 0) + 1;
      byPlay[p.playType] = (byPlay[p.playType] || 0) + 1;
    });

    return {
      total: publishedOrModeratedPosts.length,
      pending,
      approved,
      rejected,
      totalViews,
      totalLikes,
      openReports,
      byClaw,
      byPlay,
    };
  }, [publishedOrModeratedPosts, allReports]);

  const handleSeedInitialData = async () => {
    if (!authUser) return;
    setSeeding(true);
    try {
      await seedDefaultCategoriesAndSamples(
        authUser.uid,
        userProfile?.username || 'CRANE MANUAL運営',
      );
      showToast('初期カテゴリーとサンプル設定を投入しました。', 'success');
      await Promise.all([loadAdminData(), refreshAllData()]);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '初期データ投入に失敗しました。',
        'error',
      );
    } finally {
      setSeeding(false);
    }
  };

  const handleApprove = async (post: Post) => {
    try {
      await adminModeratePost(post, 'approved');
      showToast('投稿を承認・公開しました。', 'success');
      await Promise.all([loadAdminData(), refreshAllData()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '承認に失敗しました。', 'error');
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    try {
      await adminModeratePost(rejectTarget, 'rejected', rejectReason);
      setRejectTarget(null);
      setRejectReason('');
      showToast('投稿を却下しました。', 'info');
      await Promise.all([loadAdminData(), refreshAllData()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '却下処理に失敗しました。', 'error');
    }
  };

  const handleAddRecommendation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recPostId) {
      showToast('掲載する公開投稿を選択してください。', 'error');
      return;
    }
    try {
      await upsertRecommendation({
        postId: recPostId,
        adminComment: recComment,
        displayOrder: Number(recOrder) || 1,
        isActive: true,
      });
      setRecComment('');
      showToast('おすすめ設定を追加しました。', 'success');
      await Promise.all([loadAdminData(), refreshAllData()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '追加に失敗しました。', 'error');
    }
  };

  const moveRecommendationOrder = async (rec: Recommendation, delta: number) => {
    try {
      await upsertRecommendation({
        recommendationId: rec.recommendationId,
        postId: rec.postId,
        adminComment: rec.adminComment,
        displayOrder: Math.max(0, rec.displayOrder + delta),
        isActive: rec.isActive,
      });
      await Promise.all([loadAdminData(), refreshAllData()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '順番変更に失敗しました。', 'error');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    try {
      await upsertCategory({
        kind: catKind,
        name: catName,
        displayOrder: Number(catOrder) || 1,
        isActive: true,
      });
      setCatName('');
      showToast('カテゴリーを追加しました。', 'success');
      await Promise.all([loadAdminData(), refreshAllData()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '追加に失敗しました。', 'error');
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    const uids = allUsers.map((u) => u.userId);
    if (uids.length === 0) {
      showToast('送信対象のユーザーがいません。', 'info');
      return;
    }
    try {
      await sendAdminAnnouncement(uids, annTitle, annMessage);
      setAnnTitle('');
      setAnnMessage('');
      showToast(`${uids.length}名のユーザーにお知らせを送信しました。`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '送信に失敗しました。', 'error');
    }
  };

  const openSuspensionModal = (u: UserProfile) => {
    setSuspendTarget(u);
    setSuspStatus(u.status);
    setSuspScope(u.suspensionScope !== 'none' ? u.suspensionScope : 'all');
    setSuspFeatures(u.suspendedFeatures.length > 0 ? u.suspendedFeatures : ['post']);
    setSuspIndefinite(u.suspensionIndefinite);
    const untilMs = new Date(u.suspendedUntil).getTime();
    setSuspUntilLocal(
      !Number.isNaN(untilMs) && untilMs > Date.now()
        ? toLocalDateTimeInput(new Date(untilMs))
        : toLocalDateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    );
    setSuspReason(u.suspensionReason || '');
  };

  const handleSaveSuspension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendTarget) return;
    if (suspStatus === 'suspended' && suspScope === 'partial' && suspFeatures.length === 0) {
      showToast('一部機能停止の場合は、停止する機能を1つ以上選択してください。', 'error');
      return;
    }
    let untilIso = '';
    if (suspStatus === 'suspended' && !suspIndefinite) {
      const parsed = new Date(suspUntilLocal);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        showToast('停止期限は現在時刻より後の日時を指定してください。', 'error');
        return;
      }
      untilIso = parsed.toISOString();
    }
    setSavingSuspension(true);
    try {
      await updateUserRoleOrStatusAdmin(suspendTarget, {
        role: suspendTarget.role,
        status: suspStatus,
        suspensionScope: suspStatus === 'suspended' ? suspScope : 'none',
        suspendedFeatures: suspStatus === 'suspended' && suspScope === 'partial' ? suspFeatures : [],
        suspensionIndefinite: suspStatus === 'suspended' ? suspIndefinite : false,
        suspendedUntilIso: untilIso,
        suspensionReason: suspReason,
      });
      setSuspendTarget(null);
      showToast('アカウントの利用制限設定を更新しました。', 'success');
      await loadAdminData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新に失敗しました。', 'error');
    } finally {
      setSavingSuspension(false);
    }
  };

  const handleSendSupportReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !activeInquiry || !supportReplyText.trim()) return;
    setSendingSupportReply(true);
    try {
      await sendInquiryMessage({
        inquiryId: activeInquiry.inquiryId,
        inquiryOwnerId: activeInquiry.userId,
        senderId: authUser.uid,
        senderRole: 'support',
        body: supportReplyText.trim(),
      });
      setSupportReplyText('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '返信の送信に失敗しました。', 'error');
    } finally {
      setSendingSupportReply(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0B1F3B] text-white rounded-3xl p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sky-300 text-xs font-bold">
            <Settings className="w-4 h-4" />
            <span>CRANE MANUAL 運用ツール</span>
          </div>
          <h1 className="text-2xl font-bold">システムコンソール</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeedInitialData()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Database className="w-4 h-4" />
            <span>{seeding ? '投入中...' : '初期カテゴリー・サンプル投入'}</span>
          </button>
          <button
            type="button"
            onClick={openCreatePost}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>公式設定を作成</span>
          </button>
          <button
            type="button"
            onClick={closeAdminView}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>通常画面へ</span>
          </button>
        </div>
      </div>

      {/* Quick KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">保留中</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono-num">
            {statsSummary.pending}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">公開中の投稿</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 font-mono-num">
            {statsSummary.approved}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">未対応の通報</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 font-mono-num">
            {statsSummary.openReports}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">登録ユーザー</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono-num">
            {allUsers.length}
          </p>
        </div>
      </div>

      {/* Console Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        {(
          [
            { id: 'posts', label: '投稿管理', icon: Sliders },
            { id: 'images', label: '画像管理', icon: ImageIcon },
            { id: 'recommendations', label: 'おすすめ設定', icon: Award },
            { id: 'categories', label: 'カテゴリー管理', icon: FolderCog },
            { id: 'reports', label: '通報対応', icon: Flag },
            { id: 'users', label: 'ユーザー・チャット対応', icon: Users },
            { id: 'stats', label: '統計データ', icon: BarChart3 },
          ] as { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                active
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="h-64 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
      ) : (
        <>
          {/* 1. Posts & Moderation */}
          {tab === 'posts' && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  全投稿一覧（<span className="font-mono-num">{filteredPosts.length}</span> 件）
                </h2>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  {(
                    [
                      { k: 'all', l: 'すべて' },
                      { k: 'pending', l: '審査待ち' },
                      { k: 'approved', l: '公開中' },
                      { k: 'rejected', l: '却下' },
                    ] as { k: 'all' | PostStatus; l: string }[]
                  ).map((f) => (
                    <button
                      key={f.k}
                      type="button"
                      onClick={() => setPostFilter(f.k)}
                      className={`min-h-[36px] px-3 text-xs font-semibold rounded-lg whitespace-nowrap ${
                        postFilter === f.k
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {f.l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPosts.map((p) => (
                  <div
                    key={p.postId}
                    className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span
                          className={
                            p.status === 'approved'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : p.status === 'rejected'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          [{p.status === 'approved' ? '公開' : p.status === 'rejected' ? '却下' : '審査待ち'}]
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-blue-700 dark:text-sky-400">{p.clawType}</span>
                        <span className="text-slate-400">·</span>
                        <span>{p.playType}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">投稿者: {p.authorName}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {p.title}
                      </p>
                      {p.rejectionReason && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          却下理由: {p.rejectionReason}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openPostDetail(p.postId)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                      >
                        内容確認
                      </button>
                      {p.status !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => void handleApprove(p)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>承認</span>
                        </button>
                      )}
                      {p.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => {
                            setRejectTarget(p);
                            setRejectReason('');
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>却下</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditPost(p)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>編集</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const idToken = await authUser?.getIdToken();
                            await deletePostCascade(p.postId, true, idToken);
                            showToast('投稿を削除しました。', 'info');
                            await Promise.all([loadAdminData(), refreshAllData()]);
                          } catch (err) {
                            showToast(
                              err instanceof Error ? err.message : '削除に失敗しました。',
                              'error',
                            );
                          }
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>削除</span>
                      </button>
                    </div>
                  </div>
                ))}
                {filteredPosts.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500">
                    該当する投稿はありません。
                  </p>
                )}
              </div>
            </section>
          )}

          {/* 1b. Image Review & Deletion */}
          {tab === 'images' && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    投稿画像の確認・削除（<span className="font-mono-num">{allImages.length}</span> 件）
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    不適切な画像や利用規約違反の画像をCloudinaryおよびデータベースから直接削除できます。
                  </p>
                </div>
              </div>

              {allImages.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  登録されている投稿画像はありません。
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allImages.map((img) => {
                    const parentPost = allPosts.find((p) => p.postId === img.postId) || null;
                    return (
                      <div
                        key={img.imageId}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col"
                      >
                        <button
                          type="button"
                          onClick={() => parentPost && openPostDetail(parentPost.postId)}
                          className="aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-900"
                        >
                          <SafeImage
                            src={img.imageUrl}
                            alt={parentPost?.title || img.imageId}
                            className="w-full h-full object-cover"
                          />
                        </button>
                        <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() => parentPost && openPostDetail(parentPost.postId)}
                              className="text-left text-xs font-bold text-blue-700 dark:text-sky-400 hover:underline line-clamp-1"
                            >
                              {parentPost ? parentPost.title : `投稿ID: ${img.postId}`}
                            </button>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              投稿者: {parentPost?.authorName || img.authorId}
                            </p>
                            {img.publicId && (
                              <p className="text-[10px] font-mono-num text-slate-400 truncate">
                                ID: {img.publicId}
                              </p>
                            )}
                            <p className="text-[10px] font-mono-num text-slate-400">
                              {formatDateTimeJa(img.createdAt)}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={deletingImageId === img.imageId}
                            onClick={async () => {
                              setDeletingImageId(img.imageId);
                              try {
                                const idToken = await authUser?.getIdToken();
                                await deleteSinglePostImage(img, parentPost, idToken);
                                showToast('画像を削除しました。', 'success');
                                await Promise.all([loadAdminData(), refreshAllData()]);
                              } catch (err) {
                                showToast(
                                  err instanceof Error ? err.message : '画像の削除に失敗しました。',
                                  'error',
                                );
                              } finally {
                                setDeletingImageId(null);
                              }
                            }}
                            className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>
                              {deletingImageId === img.imageId ? '削除中...' : '画像を削除'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* 2. Recommendations */}
          {tab === 'recommendations' && (
            <div className="space-y-6">
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  おすすめ設定を追加
                </h2>
                <form
                  onSubmit={(e) => void handleAddRecommendation(e)}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-9">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        対象の公開投稿
                      </label>
                      <select
                        value={recPostId}
                        onChange={(e) => setRecPostId(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      >
                        {approvedPosts.map((p) => (
                          <option key={p.postId} value={p.postId}>
                            {p.title}（{p.clawType} / {p.playType}）
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        掲載順
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={recOrder}
                        onChange={(e) => setRecOrder(Number(e.target.value))}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono-num"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      ピックアップ解説
                    </label>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={recComment}
                      onChange={(e) => setRecComment(e.target.value)}
                      placeholder="おすすめの理由や注目ポイントを入力"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                  >
                    おすすめに掲載する
                  </button>
                </form>
              </section>

              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  掲載中・登録済みのおすすめ設定（<span className="font-mono-num">{allRecs.length}</span> 件）
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {allRecs.map((rec) => {
                    const targetPost = allPosts.find((p) => p.postId === rec.postId);
                    return (
                      <div key={rec.recommendationId} className="py-4 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-mono-num text-blue-700 dark:text-sky-400">
                              表示順: {rec.displayOrder} · {rec.isActive ? '掲載中' : '非掲載'}
                            </p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {targetPost?.title || rec.postId}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void moveRecommendationOrder(rec, -1)}
                              aria-label="順番を上げる"
                              className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void moveRecommendationOrder(rec, 1)}
                              aria-label="順番を下げる"
                              className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await upsertRecommendation({
                                  recommendationId: rec.recommendationId,
                                  postId: rec.postId,
                                  adminComment: rec.adminComment,
                                  displayOrder: rec.displayOrder,
                                  isActive: !rec.isActive,
                                });
                                await Promise.all([loadAdminData(), refreshAllData()]);
                              }}
                              className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                            >
                              {rec.isActive ? '掲載解除' : '掲載再開'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteRecommendation(rec.recommendationId);
                                showToast('おすすめ設定を削除しました。', 'info');
                                await Promise.all([loadAdminData(), refreshAllData()]);
                              }}
                              className="min-h-[36px] px-3 py-1 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-xs font-semibold"
                            >
                              削除
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            defaultValue={rec.adminComment}
                            onBlur={async (e) => {
                              const nextComment = e.target.value;
                              if (nextComment === rec.adminComment) return;
                              await upsertRecommendation({
                                recommendationId: rec.recommendationId,
                                postId: rec.postId,
                                adminComment: nextComment,
                                displayOrder: rec.displayOrder,
                                isActive: rec.isActive,
                              });
                              showToast('ピックアップ解説を更新しました。', 'success');
                              await Promise.all([loadAdminData(), refreshAllData()]);
                            }}
                            placeholder="ピックアップ解説を編集してフォーカスを外すと保存されます"
                            className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                          />
                        </div>
                      </div>
                    );
                  })}
                  {allRecs.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-500">
                      まだおすすめ設定が登録されていません。
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* 3. Categories */}
          {tab === 'categories' && (
            <div className="space-y-6">
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  爪・アームタイプ / 景品配置方式を追加
                </h2>
                <form
                  onSubmit={(e) => void handleAddCategory(e)}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                >
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold mb-1">種別</label>
                    <select
                      value={catKind}
                      onChange={(e) => setCatKind(e.target.value as CategoryKind)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      <option value="claw">爪・アームタイプ</option>
                      <option value="play">景品配置方式</option>
                    </select>
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-semibold mb-1">名称</label>
                    <input
                      type="text"
                      required
                      maxLength={40}
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="例：Dリング設定"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold mb-1">表示順</label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={catOrder}
                      onChange={(e) => setCatOrder(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono-num"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                    >
                      追加
                    </button>
                  </div>
                </form>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(['claw', 'play'] as CategoryKind[]).map((kind) => {
                  const items = allCats.filter((c) => c.kind === kind);
                  return (
                    <section
                      key={kind}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
                    >
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {kind === 'claw' ? '爪・アームタイプ一覧' : '景品配置方式一覧'}
                      </h3>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items.map((c) => (
                          <div
                            key={c.categoryId}
                            className="py-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="text-sm">
                              <span className="font-mono-num text-xs text-slate-400 mr-2">
                                #{c.displayOrder}
                              </span>
                              <span
                                className={`font-semibold ${
                                  c.isActive ? '' : 'line-through text-slate-400'
                                }`}
                              >
                                {c.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  await upsertCategory({
                                    categoryId: c.categoryId,
                                    kind: c.kind,
                                    name: c.name,
                                    displayOrder: c.displayOrder,
                                    isActive: !c.isActive,
                                  });
                                  await Promise.all([loadAdminData(), refreshAllData()]);
                                }}
                                className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                              >
                                {c.isActive ? '無効化' : '有効化'}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteCategory(c.categoryId);
                                  await Promise.all([loadAdminData(), refreshAllData()]);
                                }}
                                className="min-h-[34px] px-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-xs font-semibold"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        ))}
                        {items.length === 0 && (
                          <p className="py-4 text-xs text-slate-500">
                            Firestoreにカテゴリーがまだありません。「初期カテゴリー・サンプル投入」で一括作成できます。
                          </p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Reports */}
          {tab === 'reports' && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                通報管理（<span className="font-mono-num">{allReports.length}</span> 件）
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {allReports.map((r) => (
                  <div
                    key={r.reportId}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-semibold flex items-center gap-2">
                        <span
                          className={
                            r.status === 'pending'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                          }
                        >
                          [{r.status === 'pending' ? '未対応' : r.status === 'resolved' ? '対応済み' : '却下・問題なし'}]
                        </span>
                        <span>·</span>
                        <span>{r.reason}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openPostDetail(r.postId)}
                        className="text-sm font-bold text-blue-700 dark:text-sky-400 hover:underline text-left"
                      >
                        対象投稿: {r.postTitle}
                      </button>
                      {r.details && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          詳細: {r.details}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(['pending', 'resolved', 'dismissed'] as ReportStatus[]).map(
                        (st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={async () => {
                              await updateReportStatus(r.reportId, st);
                              showToast('通報ステータスを更新しました。', 'success');
                              await loadAdminData();
                            }}
                            className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold border ${
                              r.status === st
                                ? 'bg-blue-700 text-white border-blue-700'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {st === 'pending'
                              ? '未対応'
                              : st === 'resolved'
                                ? '対応済み'
                                : '問題なし'}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ))}
                {allReports.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-500">
                    現在、通報はありません。
                  </p>
                )}
              </div>
            </section>
          )}

          {/* 5. Users, Announcements & Inquiries */}
          {tab === 'users' && (
            <div className="space-y-6">
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  全ユーザーへお知らせ通知を送信
                </h2>
                <form
                  onSubmit={(e) => void handleSendAnnouncement(e)}
                  className="space-y-3"
                >
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    placeholder="お知らせのタイトル"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                  <textarea
                    rows={3}
                    required
                    maxLength={1000}
                    value={annMessage}
                    onChange={(e) => setAnnMessage(e.target.value)}
                    placeholder="お知らせの本文"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Send className="w-4 h-4" />
                    <span>お知らせを配信する</span>
                  </button>
                </form>
              </section>

              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  ユーザー一覧・利用停止設定（<span className="font-mono-num">{allUsers.length}</span> 名）
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {allUsers.map((u) => {
                    const isSusp =
                      u.status === 'suspended' &&
                      (u.suspensionIndefinite ||
                        new Date(u.suspendedUntil).getTime() > Date.now());
                    return (
                      <div
                        key={u.userId}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">
                            {u.username}{' '}
                            <span className="text-xs font-normal text-slate-500">
                              ({u.email})
                            </span>
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            区分: {u.role === 'admin' ? 'スタッフ' : '通常'} · 状態:{' '}
                            {isSusp ? (
                              <span className="text-red-600 dark:text-red-400 font-semibold">
                                {u.suspensionScope === 'partial'
                                  ? `一部停止（${u.suspendedFeatures
                                      .map((f) => SUSPENDABLE_FEATURE_LABELS[f])
                                      .join(', ')}）`
                                  : '全機能停止'}
                                {' · '}
                                {u.suspensionIndefinite
                                  ? '無期限'
                                  : `${formatDateTimeJa(u.suspendedUntil)} まで`}
                              </span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                有効
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              await updateUserRoleOrStatusAdmin(u, {
                                role: u.role === 'admin' ? 'user' : 'admin',
                                status: u.status,
                                suspensionScope: u.suspensionScope,
                                suspendedFeatures: u.suspendedFeatures,
                                suspensionIndefinite: u.suspensionIndefinite,
                                suspendedUntilIso: u.suspendedUntil,
                                suspensionReason: u.suspensionReason,
                              });
                              showToast('ユーザー区分を変更しました。', 'success');
                              await loadAdminData();
                            }}
                            className="min-h-[38px] px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                          >
                            {u.role === 'admin' ? '通常区分へ' : 'スタッフ権限付与'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openSuspensionModal(u)}
                            className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold border ${
                              isSusp
                                ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {isSusp ? '停止設定を編集 / 解除' : '一時停止設定'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Support Chat Responder */}
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-blue-700 dark:text-sky-400" />
                  <span>お問い合わせチャット対応（<span className="font-mono-num">{allInquiries.length}</span> 件）</span>
                </h2>

                {allInquiries.length === 0 ? (
                  <p className="py-4 text-xs text-slate-500">
                    お問い合わせはまだありません。
                  </p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Thread List */}
                    <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
                      {allInquiries.map((inq) => {
                        const selected = inq.inquiryId === selectedInquiryId;
                        return (
                          <button
                            key={inq.inquiryId}
                            type="button"
                            onClick={() => setSelectedInquiryId(inq.inquiryId)}
                            className={`w-full text-left p-3.5 space-y-1 transition-colors ${
                              selected
                                ? 'bg-sky-50 dark:bg-blue-950/40'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                              <span
                                className={
                                  inq.status === 'open'
                                    ? 'text-blue-700 dark:text-sky-400'
                                    : 'text-slate-400'
                                }
                              >
                                [{inq.status === 'open' ? '対応中' : '完了'}]
                              </span>
                              <span className="text-slate-400 font-mono-num">
                                {formatDateTimeJa(inq.updatedAt)}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                              {inq.subject}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{inq.email}</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Chat Stream */}
                    <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950">
                      {activeInquiry ? (
                        <>
                          <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {activeInquiry.subject}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {activeInquiry.email}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await updateInquiryStatus(
                                  activeInquiry.inquiryId,
                                  activeInquiry.status === 'open' ? 'closed' : 'open',
                                );
                              }}
                              className="min-h-[36px] px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold shrink-0"
                            >
                              {activeInquiry.status === 'open' ? '完了にする' : '対応中に戻す'}
                            </button>
                          </div>

                          <div className="p-4 space-y-3 h-[280px] overflow-y-auto">
                            {inquiryMessages.length === 0 ? (
                              <div className="flex justify-start">
                                <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm whitespace-pre-wrap">
                                  {activeInquiry.message}
                                </div>
                              </div>
                            ) : (
                              inquiryMessages.map((m) => {
                                const isSupport = m.senderRole === 'support';
                                return (
                                  <div
                                    key={m.messageId}
                                    className={`flex flex-col ${isSupport ? 'items-end' : 'items-start'}`}
                                  >
                                    {isSupport && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-sky-400 mb-1 px-1">
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                        <span>サポート返信</span>
                                      </span>
                                    )}
                                    <div
                                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                                        isSupport
                                          ? 'rounded-tr-sm bg-blue-700 text-white'
                                          : 'rounded-tl-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                                      }`}
                                    >
                                      {m.body}
                                      <div
                                        className={`text-[10px] mt-1 font-mono-num ${
                                          isSupport ? 'text-sky-200 text-right' : 'text-slate-400'
                                        }`}
                                      >
                                        {formatDateTimeJa(m.createdAt)}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                            <div ref={chatBottomRef} />
                          </div>

                          <form
                            onSubmit={(e) => void handleSendSupportReply(e)}
                            className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-end gap-2"
                          >
                            <textarea
                              rows={2}
                              maxLength={VALIDATION_LIMITS.inquiryMessageMax}
                              value={supportReplyText}
                              onChange={(e) => setSupportReplyText(e.target.value)}
                              placeholder="ユーザーへチャットで返信する..."
                              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm resize-none"
                            />
                            <button
                              type="submit"
                              disabled={sendingSupportReply || !supportReplyText.trim()}
                              className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                            >
                              <Send className="w-4 h-4" />
                              <span>返信</span>
                            </button>
                          </form>
                        </>
                      ) : (
                        <div className="p-8 text-center text-xs text-slate-500">
                          左の一覧からスレッドを選択してください。
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* 6. Stats */}
          {tab === 'stats' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  投稿・閲覧・いいね集計
                </h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <dt className="text-slate-500">総投稿数</dt>
                    <dd className="font-mono-num font-bold">{statsSummary.total}</dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <dt className="text-slate-500">審査待ち / 公開 / 却下</dt>
                    <dd className="font-mono-num font-bold">
                      {statsSummary.pending} / {statsSummary.approved} / {statsSummary.rejected}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <dt className="text-slate-500">総閲覧数</dt>
                    <dd className="font-mono-num font-bold">{statsSummary.totalViews}</dd>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <dt className="text-slate-500">総いいね数</dt>
                    <dd className="font-mono-num font-bold">{statsSummary.totalLikes}</dd>
                  </div>
                </dl>
              </section>

              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  カテゴリー別内訳
                </h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-1.5">
                      爪・アームタイプ別
                    </p>
                    <div className="space-y-1 text-xs">
                      {Object.entries(statsSummary.byClaw).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span>{k}</span>
                          <span className="font-mono-num font-semibold">{v} 件</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-1.5">
                      景品配置方式別
                    </p>
                    <div className="space-y-1 text-xs">
                      {Object.entries(statsSummary.byPlay).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span>{k}</span>
                          <span className="font-mono-num font-semibold">{v} 件</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {/* Granular Suspension Modal */}
      {suspendTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  アカウント制限・一時停止設定
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  対象: {suspendTarget.username} ({suspendTarget.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveSuspension(e)} className="space-y-4">
              {/* Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  アカウント状態
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSuspStatus('active')}
                    className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold ${
                      suspStatus === 'active'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    有効（制限を解除）
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuspStatus('suspended')}
                    className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold ${
                      suspStatus === 'suspended'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    一時停止する
                  </button>
                </div>
              </div>

              {suspStatus === 'suspended' && (
                <>
                  {/* Scope */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      停止範囲
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSuspScope('all')}
                        className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold ${
                          suspScope === 'all'
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        全機能を停止
                      </button>
                      <button
                        type="button"
                        onClick={() => setSuspScope('partial')}
                        className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold ${
                          suspScope === 'partial'
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        一部機能のみ停止
                      </button>
                    </div>
                  </div>

                  {/* Feature checkboxes when partial */}
                  {suspScope === 'partial' && (
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        停止する機能を選択
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {SUSPENDABLE_FEATURES.map((feat) => {
                          const checked = suspFeatures.includes(feat);
                          return (
                            <label
                              key={feat}
                              className="flex items-center gap-2 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSuspFeatures((prev) =>
                                      prev.includes(feat) ? prev : [...prev, feat],
                                    );
                                  } else {
                                    setSuspFeatures((prev) =>
                                      prev.filter((f) => f !== feat),
                                    );
                                  }
                                }}
                                className="rounded text-blue-700"
                              />
                              <span>{SUSPENDABLE_FEATURE_LABELS[feat]}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Expiry Date & Time */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-700 dark:text-sky-400" />
                        <span>いつまで停止するか</span>
                      </span>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={suspIndefinite}
                          onChange={(e) => setSuspIndefinite(e.target.checked)}
                          className="rounded text-blue-700"
                        />
                        <span>無期限にする</span>
                      </label>
                    </div>

                    {!suspIndefinite && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: '24時間', hours: 24 },
                            { label: '3日間', hours: 72 },
                            { label: '7日間', hours: 168 },
                            { label: '30日間', hours: 720 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() =>
                                setSuspUntilLocal(
                                  toLocalDateTimeInput(
                                    new Date(Date.now() + preset.hours * 3600 * 1000),
                                  ),
                                )
                              }
                              className="min-h-[32px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:border-blue-600"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="datetime-local"
                          required
                          value={suspUntilLocal}
                          onChange={(e) => setSuspUntilLocal(e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-num"
                        />
                      </div>
                    )}
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      停止理由・ユーザーへの案内（任意）
                    </label>
                    <textarea
                      rows={2}
                      maxLength={VALIDATION_LIMITS.suspensionReasonMax}
                      value={suspReason}
                      onChange={(e) => setSuspReason(e.target.value)}
                      placeholder="例：ガイドライン違反のため一時的に利用を制限しています"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSuspendTarget(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={savingSuspension}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {savingSuspension ? '保存中...' : '設定を保存する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              投稿を非公開にする
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              対象: {rejectTarget.title}
            </p>
            <form onSubmit={(e) => void handleRejectSubmit(e)} className="space-y-3">
              <textarea
                rows={3}
                required
                maxLength={500}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="理由を入力してください（投稿者へ通知されます）"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
                >
                  確定する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
