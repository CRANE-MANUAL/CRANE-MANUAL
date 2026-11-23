import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Bookmark,
  Clock,
  Eye,
  Flame,
  Heart,
  Plus,
  Search,
  Sparkles,
  User,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { fetchPublicProfilesMap } from '../lib/firestoreService';
import { Post, PublicProfile } from '../types';
import { SafeImage } from './BrandLogo';

type TimelineTab = 'foryou' | 'latest' | 'popular' | 'recent';

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'たった今';
    if (mins < 60) return `${mins}分前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}日前`;
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function HomeView() {
  const {
    authUser,
    userProfile,
    posts,
    loadingPosts,
    recommendations,
    recentlyViewedIds,
    clawTypes,
    playTypes,
    likedPostIds,
    favoritedPostIds,
    handleToggleLike,
    handleToggleFavorite,
    navigateToSearch,
    openCreatePost,
    openPostDetail,
    setActiveTab,
  } = useApp();

  const [timelineTab, setTimelineTab] = useState<TimelineTab>('latest');
  const [quickKeyword, setQuickKeyword] = useState('');
  const [profilesMap, setProfilesMap] = useState<Record<string, PublicProfile>>({});

  useEffect(() => {
    const ids = posts.map((p) => p.authorId);
    if (ids.length === 0) return;
    void fetchPublicProfilesMap(ids)
      .then((map) => setProfilesMap(map))
      .catch(() => {
        // Non-blocking avatar lookup
      });
  }, [posts]);

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigateToSearch({ keyword: quickKeyword.trim(), scope: 'all' });
  };

  const recMap = useMemo(() => {
    const map = new Map<string, string>();
    recommendations
      .filter((r) => r.isActive)
      .forEach((r) => map.set(r.postId, r.adminComment));
    return map;
  }, [recommendations]);

  const timelinePosts = useMemo(() => {
    if (timelineTab === 'latest') {
      return [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (timelineTab === 'popular') {
      return [...posts].sort(
        (a, b) =>
          b.likesCount * 3 + b.viewsCount - (a.likesCount * 3 + a.viewsCount),
      );
    }
    if (timelineTab === 'recent') {
      const byId = new Map(posts.map((p) => [p.postId, p]));
      return recentlyViewedIds
        .map((id) => byId.get(id))
        .filter((p): p is Post => Boolean(p));
    }
    // 'foryou': boost admin-recommended + recent high-engagement posts
    return [...posts].sort((a, b) => {
      const aRec = recMap.has(a.postId) ? 1000 : 0;
      const bRec = recMap.has(b.postId) ? 1000 : 0;
      const aScore = aRec + a.likesCount * 4 + a.viewsCount;
      const bScore = bRec + b.likesCount * 4 + b.viewsCount;
      return bScore - aScore || b.createdAt.localeCompare(a.createdAt);
    });
  }, [posts, timelineTab, recentlyViewedIds, recMap]);

  const featuredRecommendations = useMemo(() => {
    const byId = new Map(posts.map((p) => [p.postId, p]));
    return recommendations
      .filter((r) => r.isActive && byId.has(r.postId))
      .slice(0, 3)
      .map((r) => ({ rec: r, post: byId.get(r.postId)! }));
  }, [posts, recommendations]);

  const stats = useMemo(() => {
    const totalLikes = posts.reduce((acc, p) => acc + p.likesCount, 0);
    const totalViews = posts.reduce((acc, p) => acc + p.viewsCount, 0);
    return {
      postCount: posts.length,
      totalLikes,
      totalViews,
      categoryCount: clawTypes.length + playTypes.length,
    };
  }, [posts, clawTypes.length, playTypes.length]);

  return (
    <div className="relative pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main X-Style Timeline Column */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {/* Timeline Header Tabs (X-style) */}
          <div className="sticky top-12 sm:top-16 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-4">
              {(
                [
                  { id: 'latest', label: '新着', icon: Clock },
                  { id: 'foryou', label: 'おすすめ', icon: Sparkles },
                  { id: 'popular', label: '人気', icon: Flame },
                  { id: 'recent', label: '閲覧履歴', icon: Eye },
                ] as {
                  id: TimelineTab;
                  label: string;
                  icon: React.ComponentType<{ className?: string }>;
                }[]
              ).map((t) => {
                const active = timelineTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTimelineTab(t.id)}
                    className={`min-h-[48px] px-2 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold relative transition-colors whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span>{t.label}</span>
                    {active && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-blue-700 dark:bg-sky-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile Quick Search Bar */}
          <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 lg:hidden">
            <form onSubmit={handleQuickSearch} className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={quickKeyword}
                onChange={(e) => setQuickKeyword(e.target.value)}
                placeholder="設定名・爪タイプ・配置方式を検索"
                aria-label="設定を検索"
                className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </form>
          </div>

          {/* Inline X-style Compose Prompt Row */}
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
              {userProfile?.profileImageUrl ? (
                <SafeImage
                  src={userProfile.profileImageUrl}
                  alt={userProfile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <button
              type="button"
              onClick={openCreatePost}
              className="flex-1 min-h-[44px] px-4 rounded-full bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-left text-sm text-slate-500 dark:text-slate-400 transition-colors"
            >
              {authUser
                ? 'クレーンゲームの設定ノウハウを共有しよう...'
                : 'ログインして設定ノウハウをタイムラインへ投稿...'}
            </button>
            <button
              type="button"
              onClick={openCreatePost}
              className="hidden sm:inline-flex min-h-[40px] px-4 py-2 rounded-full bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
            >
              投稿する
            </button>
          </div>

          {/* Feed Stream */}
          {loadingPosts ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="p-4 sm:p-5 flex gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                  <div className="flex-1 space-y-2.5">
                    <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-12 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : timelinePosts.length > 0 ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {timelinePosts.map((post) => {
                const isLiked = likedPostIds.has(post.postId);
                const isFavorited = favoritedPostIds.has(post.postId);
                const authorAvatar = profilesMap[post.authorId]?.profileImageUrl || '';
                const adminComment = recMap.get(post.postId);

                return (
                  <article
                    key={`${timelineTab}_${post.postId}`}
                    className="px-4 sm:px-5 py-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/35 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Author Avatar */}
                      <button
                        type="button"
                        onClick={() => openPostDetail(post.postId)}
                        aria-label={`${post.authorName}の投稿を見る`}
                        className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center"
                      >
                        {authorAvatar ? (
                          <SafeImage
                            src={authorAvatar}
                            alt={post.authorName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-5 h-5 text-slate-400" />
                        )}
                      </button>

                      {/* Post Body Column */}
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Author + Timestamp */}
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                          <span className="font-bold text-slate-900 dark:text-white truncate max-w-[160px]">
                            {post.authorName}
                          </span>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 font-mono-num">
                            {formatRelativeTime(post.createdAt)}
                          </span>
                          {adminComment && (
                            <>
                              <span className="text-slate-400" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-semibold text-blue-700 dark:text-sky-400 inline-flex items-center gap-1">
                                <Award className="w-3.5 h-3.5" />
                                <span>運営おすすめ</span>
                              </span>
                            </>
                          )}
                        </div>

                        {/* Unboxed Setting Classification Metadata */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-blue-700 dark:text-sky-400">
                          <span>{post.clawType}</span>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                            ·
                          </span>
                          <span>{post.playType}</span>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-600 dark:text-slate-300">
                            難易度: {post.difficulty}
                          </span>
                        </div>

                        {/* Clickable Content Area */}
                        <button
                          type="button"
                          onClick={() => openPostDetail(post.postId)}
                          className="w-full text-left space-y-2 focus-visible:outline-2 focus-visible:outline-blue-600 rounded-xl"
                        >
                          <h2 className="text-base sm:text-[17px] font-bold text-slate-900 dark:text-white leading-snug hover:text-blue-700 dark:hover:text-sky-400 transition-colors">
                            {post.title}
                          </h2>

                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-3 whitespace-pre-line">
                            {post.description}
                          </p>

                          {adminComment && (
                            <p className="text-xs text-slate-700 dark:text-slate-300 bg-sky-50/80 dark:bg-blue-950/40 border border-sky-200/80 dark:border-blue-900/60 rounded-xl p-2.5">
                              運営コメント: {adminComment}
                            </p>
                          )}

                          {post.coverImageUrl && (
                            <div className="aspect-[16/10] w-full max-h-[340px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 mt-1">
                              <SafeImage
                                src={post.coverImageUrl}
                                alt={post.title}
                                fallbackTitle={post.playType}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                        </button>

                        {/* X-style Bottom Engagement Bar */}
                        <div className="pt-1 flex items-center justify-between max-w-md text-xs">
                          <button
                            type="button"
                            onClick={() => void handleToggleLike(post)}
                            aria-label={`いいね (${post.likesCount})`}
                            className={`min-h-[40px] px-2.5 -ml-2.5 rounded-full inline-flex items-center gap-1.5 font-semibold transition-colors ${
                              isLiked
                                ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50'
                                : 'text-slate-500 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50/70 dark:hover:bg-rose-950/30'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                            <span className="font-mono-num">{post.likesCount}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleToggleFavorite(post)}
                            aria-label={isFavorited ? 'お気に入り解除' : 'お気に入りに追加'}
                            className={`min-h-[40px] px-2.5 rounded-full inline-flex items-center gap-1.5 font-semibold transition-colors ${
                              isFavorited
                                ? 'text-blue-700 dark:text-sky-400 bg-sky-50 dark:bg-blue-950/50'
                                : 'text-slate-500 dark:text-slate-400 hover:text-blue-700 hover:bg-sky-50/70 dark:hover:bg-blue-950/30'
                            }`}
                          >
                            <Bookmark className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
                            <span className="font-mono-num">{post.favoritesCount}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openPostDetail(post.postId)}
                            className="min-h-[40px] px-2.5 rounded-full inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="font-mono-num">{post.viewsCount}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openPostDetail(post.postId)}
                            className="min-h-[40px] px-2.5 rounded-full text-blue-700 dark:text-sky-400 font-semibold hover:underline"
                          >
                            詳細を見る
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-10 text-center space-y-3">
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                {timelineTab === 'recent'
                  ? '最近閲覧した投稿はまだありません'
                  : 'まだタイムラインに投稿がありません'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {timelineTab === 'recent'
                  ? '気になる設定マニュアルを開くと、ここに閲覧履歴が表示されます。'
                  : '右下の＋ボタンから最初のアーム設定・景品配置マニュアルを投稿してみましょう。'}
              </p>
              {timelineTab !== 'recent' && (
                <button
                  type="button"
                  onClick={openCreatePost}
                  className="min-h-[44px] px-5 py-2.5 rounded-full bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>設定を投稿する</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Desktop Right Sidebar (Search, Stats, Recommended, Categories) */}
        <aside className="hidden lg:flex lg:col-span-4 flex-col gap-5 sticky top-22">
          {/* Search Box */}
          <form onSubmit={handleQuickSearch} className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={quickKeyword}
              onChange={(e) => setQuickKeyword(e.target.value)}
              placeholder="設定・キーワードを検索..."
              aria-label="設定を検索"
              className="w-full min-h-[46px] pl-11 pr-4 py-2.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </form>

          {/* Service Statistics */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              CRANE MANUAL 統計
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">公開設定数</p>
                <p className="text-xl font-bold font-mono-num text-slate-900 dark:text-white">
                  {stats.postCount}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">カテゴリー</p>
                <p className="text-xl font-bold font-mono-num text-slate-900 dark:text-white">
                  {stats.categoryCount}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">累計いいね</p>
                <p className="text-xl font-bold font-mono-num text-blue-700 dark:text-sky-400">
                  {stats.totalLikes}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">累計閲覧数</p>
                <p className="text-xl font-bold font-mono-num text-slate-900 dark:text-white">
                  {stats.totalViews}
                </p>
              </div>
            </div>
          </section>

          {/* Admin Curated Highlights */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                <Award className="w-4 h-4 text-blue-700 dark:text-sky-400" />
                <span>運営おすすめ設定</span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('recommended')}
                className="text-xs font-semibold text-blue-700 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5"
              >
                <span>一覧</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {featuredRecommendations.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {featuredRecommendations.map(({ rec, post }) => (
                  <button
                    key={rec.recommendationId}
                    type="button"
                    onClick={() => openPostDetail(post.postId)}
                    className="w-full py-2.5 text-left hover:opacity-80 transition-opacity space-y-0.5"
                  >
                    <p className="text-[11px] font-semibold text-blue-700 dark:text-sky-400">
                      {post.clawType} · {post.playType}
                    </p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                      {post.title}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                厳選された基準マニュアルは「おすすめ設定」タブで確認できます。
              </p>
            )}
          </section>

          {/* Quick Category Exploration */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              配置方式・爪タイプで探す
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {clawTypes.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => navigateToSearch({ clawType: c })}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-700 hover:text-white text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  {c}
                </button>
              ))}
              {playTypes.slice(0, 6).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => navigateToSearch({ playType: p })}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-700 hover:text-white text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* Bottom-Right Floating + Compose Button (FAB) */}
      <button
        type="button"
        onClick={openCreatePost}
        aria-label="新しい設定を投稿する"
        title="新しい設定を投稿する"
        className="fixed right-4 sm:right-6 bottom-18 md:bottom-8 z-40 w-14 h-14 rounded-full bg-blue-700 hover:bg-blue-800 active:scale-95 text-white shadow-xl shadow-blue-950/30 flex items-center justify-center transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
}
