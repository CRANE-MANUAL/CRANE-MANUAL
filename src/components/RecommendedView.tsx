import React, { useMemo } from 'react';
import { Award } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { PostCard } from './PostCard';

export function RecommendedView() {
  const { posts, recommendations, loadingPosts, setActiveTab } = useApp();

  const recommendedItems = useMemo(() => {
    const byId = new Map(posts.map((p) => [p.postId, p]));
    return recommendations
      .filter((r) => r.isActive && byId.has(r.postId))
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((r) => ({ rec: r, post: byId.get(r.postId)! }));
  }, [posts, recommendations]);

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-2">
        <div className="flex items-center gap-2 text-blue-700 dark:text-sky-400">
          <Award className="w-5 h-5" />
          <span className="text-xs font-bold tracking-wide">編集部ピックアップ</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          おすすめ設定
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          CRANE MANUAL編集部が設定内容や再現性、安全性を確認して厳選したおすすめ設定マニュアルです。ピックアップ解説とあわせてご活用ください。
        </p>
      </div>

      {loadingPosts ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-80 rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse"
            />
          ))}
        </div>
      ) : recommendedItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {recommendedItems.map(({ rec, post }, idx) => (
            <div key={rec.recommendationId} className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1 font-mono-num">
                No. {String(idx + 1).padStart(2, '0')}
              </div>
              <PostCard post={post} adminComment={rec.adminComment} />
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <Award className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-base font-bold text-slate-800 dark:text-slate-200">
            現在掲載中のおすすめ設定はありません
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            公開中のすべての設定は検索ページからご覧いただけます。
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
          >
            設定を検索する
          </button>
        </div>
      )}
    </div>
  );
}
