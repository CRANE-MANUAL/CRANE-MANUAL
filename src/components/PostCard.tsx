import React from 'react';
import { Bookmark, Heart, Eye } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Post } from '../types';
import { SafeImage } from './BrandLogo';

interface PostCardProps {
  post: Post;
  adminComment?: string;
}

export function PostCard({ post, adminComment }: PostCardProps) {
  const {
    likedPostIds,
    favoritedPostIds,
    handleToggleLike,
    handleToggleFavorite,
    openPostDetail,
  } = useApp();

  const isLiked = likedPostIds.has(post.postId);
  const isFavorited = favoritedPostIds.has(post.postId);

  return (
    <article className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5">
      <button
        type="button"
        onClick={() => openPostDetail(post.postId)}
        className="text-left focus-visible:outline-2 focus-visible:outline-blue-600 flex-1 flex flex-col"
      >
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 relative">
          <SafeImage
            src={post.coverImageUrl}
            alt={post.title}
            fallbackTitle={post.playType}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>

        <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
          <div className="space-y-2">
            {/* Unboxed metadata with typographic separators */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-blue-700 dark:text-sky-400">
              <span>{post.clawType}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                ·
              </span>
              <span>{post.playType}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                ·
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                難易度: {post.difficulty}
              </span>
            </div>

            <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-blue-700 dark:group-hover:text-sky-400 transition-colors">
              {post.title}
            </h3>

            {adminComment && (
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 bg-sky-50/80 dark:bg-blue-950/40 border border-sky-200/80 dark:border-blue-900/60 rounded-xl p-3 line-clamp-3">
                ピックアップ解説: {adminComment}
              </p>
            )}
          </div>

          <div className="pt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate max-w-[140px]">投稿者: {post.authorName}</span>
            <span className="inline-flex items-center gap-1 font-mono-num">
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              {post.viewsCount}
            </span>
          </div>
        </div>
      </button>

      <div className="px-4 sm:px-5 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void handleToggleLike(post)}
          aria-label={`いいね (${post.likesCount})`}
          className={`min-h-[44px] px-3 rounded-xl inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            isLiked
              ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
          <span className="font-mono-num">{post.likesCount}</span>
        </button>

        <button
          type="button"
          onClick={() => void handleToggleFavorite(post)}
          aria-label={isFavorited ? 'お気に入り解除' : 'お気に入りに追加'}
          className={`min-h-[44px] px-3 rounded-xl inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            isFavorited
              ? 'text-blue-700 dark:text-sky-400 bg-sky-50 dark:bg-blue-950/60'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Bookmark className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
          <span>{isFavorited ? '保存済み' : 'お気に入り'}</span>
        </button>
      </div>
    </article>
  );
}
