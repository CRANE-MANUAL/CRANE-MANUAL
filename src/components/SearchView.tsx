import React, { useMemo } from 'react';
import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { DIFFICULTY_LEVELS, SearchScope, SortOption } from '../types';
import { PostCard } from './PostCard';

export function SearchView() {
  const {
    posts,
    loadingPosts,
    clawTypes,
    playTypes,
    searchFilters,
    setSearchFilters,
  } = useApp();

  const filteredPosts = useMemo(() => {
    const kw = searchFilters.keyword.trim().toLowerCase();

    const list = posts.filter((p) => {
      if (searchFilters.clawType && p.clawType !== searchFilters.clawType) {
        return false;
      }
      if (searchFilters.playType && p.playType !== searchFilters.playType) {
        return false;
      }
      if (searchFilters.difficulty && p.difficulty !== searchFilters.difficulty) {
        return false;
      }
      if (kw) {
        const inTitle = p.title.toLowerCase().includes(kw);
        const inDesc = p.description.toLowerCase().includes(kw);
        const inNotes = p.notes.toLowerCase().includes(kw);
        const inMeta =
          p.clawType.toLowerCase().includes(kw) ||
          p.playType.toLowerCase().includes(kw) ||
          p.authorName.toLowerCase().includes(kw);

        if (searchFilters.scope === 'title' && !inTitle) return false;
        if (searchFilters.scope === 'description' && !inDesc) return false;
        if (
          searchFilters.scope === 'all' &&
          !inTitle &&
          !inDesc &&
          !inNotes &&
          !inMeta
        ) {
          return false;
        }
      }
      return true;
    });

    return list.sort((a, b) => {
      switch (searchFilters.sort) {
        case 'oldest':
          return a.createdAt.localeCompare(b.createdAt);
        case 'popular':
          return b.viewsCount - a.viewsCount || b.likesCount - a.likesCount;
        case 'likes':
          return b.likesCount - a.likesCount || b.createdAt.localeCompare(a.createdAt);
        case 'newest':
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [posts, searchFilters]);

  const resetFilters = () => {
    setSearchFilters({
      keyword: '',
      scope: 'all',
      clawType: '',
      playType: '',
      difficulty: '',
      sort: 'newest',
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            設定を検索する
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            キーワード、爪・アームタイプ、景品配置方式、難易度を組み合わせて検索できます。
          </p>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 self-start sm:self-auto whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>条件をリセット</span>
        </button>
      </div>

      {/* Multi-condition Filter Box */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-7 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchFilters.keyword}
              onChange={(e) =>
                setSearchFilters((prev) => ({ ...prev, keyword: e.target.value }))
              }
              placeholder="キーワードを入力（例：シリコン、角落とし、シールド）"
              aria-label="検索キーワード"
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="md:col-span-5 flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {(
              [
                { key: 'all', label: 'すべて' },
                { key: 'title', label: 'タイトル' },
                { key: 'description', label: '説明文' },
              ] as { key: SearchScope; label: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() =>
                  setSearchFilters((prev) => ({ ...prev, scope: opt.key }))
                }
                className={`flex-1 min-h-[38px] px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  searchFilters.scope === opt.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              爪・アームタイプ
            </label>
            <select
              value={searchFilters.clawType}
              onChange={(e) =>
                setSearchFilters((prev) => ({ ...prev, clawType: e.target.value }))
              }
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">すべて</option>
              {clawTypes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              景品配置方式
            </label>
            <select
              value={searchFilters.playType}
              onChange={(e) =>
                setSearchFilters((prev) => ({ ...prev, playType: e.target.value }))
              }
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">すべて</option>
              {playTypes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              難易度
            </label>
            <select
              value={searchFilters.difficulty}
              onChange={(e) =>
                setSearchFilters((prev) => ({ ...prev, difficulty: e.target.value }))
              }
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">すべて</option>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              並び替え
            </label>
            <select
              value={searchFilters.sort}
              onChange={(e) =>
                setSearchFilters((prev) => ({
                  ...prev,
                  sort: e.target.value as SortOption,
                }))
              }
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="newest">新着順</option>
              <option value="oldest">古い順</option>
              <option value="popular">人気順（閲覧数）</option>
              <option value="likes">いいね順</option>
            </select>
          </div>
        </div>
      </section>

      {/* Results Header */}
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal className="w-4 h-4" />
          検索結果: <strong className="font-mono-num text-slate-900 dark:text-white">{filteredPosts.length}</strong> 件
        </span>
      </div>

      {/* Results Grid */}
      {loadingPosts ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-80 rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse"
            />
          ))}
        </div>
      ) : filteredPosts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPosts.map((post) => (
            <PostCard key={post.postId} post={post} />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <p className="text-base font-bold text-slate-800 dark:text-slate-200">
            条件に一致する設定投稿が見つかりませんでした
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            キーワードを変更するか、条件をリセットして再度お試しください。
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
          >
            すべての設定を表示
          </button>
        </div>
      )}
    </div>
  );
}
