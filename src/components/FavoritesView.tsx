import React, { useMemo } from 'react';
import { Bookmark, LogIn } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { PostCard } from './PostCard';

export function FavoritesView() {
  const {
    authUser,
    needsEmailVerification,
    posts,
    favoritedPostIds,
    setShowAuthModal,
    setActiveTab,
  } = useApp();

  const favoritePosts = useMemo(
    () => posts.filter((p) => favoritedPostIds.has(p.postId)),
    [posts, favoritedPostIds],
  );

  if (!authUser || needsEmailVerification) {
    return (
      <div className="pb-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-400 flex items-center justify-center mx-auto">
            <Bookmark className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            お気に入り一覧
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            お気に入り設定はユーザーごとに保存され、他のユーザーには公開されません。ログインしてあなた専用のお気に入りリストをご利用ください。
          </p>
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>ログイン / 新規登録</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          お気に入り
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          保存した設定マニュアル（<span className="font-mono-num">{favoritePosts.length}</span> 件・あなたのみ閲覧可能）
        </p>
      </div>

      {favoritePosts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {favoritePosts.map((post) => (
            <PostCard key={`fav_${post.postId}`} post={post} />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <Bookmark className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-base font-bold text-slate-800 dark:text-slate-200">
            お気に入りに登録された設定はまだありません
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            気になる設定カードの「お気に入り」ボタンを押すと、ここに一覧表示されます。
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
          >
            設定を探しに行く
          </button>
        </div>
      )}
    </div>
  );
}
