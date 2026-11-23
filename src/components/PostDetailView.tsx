import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Calendar,
  Edit3,
  ExternalLink,
  Eye,
  Flag,
  Heart,
  PlayCircle,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getYouTubeEmbedUrl, sanitizeExternalHref } from '../lib/firebase';
import {
  createReport,
  deletePostCascade,
  deleteSinglePostImage,
  fetchPostById,
  fetchPostMedia,
  incrementPostView,
} from '../lib/firestoreService';
import {
  Post,
  PostImage,
  PostVideo,
  REPORT_REASONS,
  ReportReason,
} from '../types';
import { SafeImage } from './BrandLogo';
import { PostCard } from './PostCard';

function formatDateJa(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

export function PostDetailView({ postId }: { postId: string }) {
  const {
    authUser,
    isAdmin,
    needsEmailVerification,
    isFeatureSuspended,
    suspensionExpiryLabel,
    posts,
    likedPostIds,
    favoritedPostIds,
    handleToggleLike,
    handleToggleFavorite,
    openEditPost,
    closePostDetail,
    openPostDetail,
    refreshAllData,
    setShowAuthModal,
    showToast,
  } = useApp();

  const [post, setPost] = useState<Post | null>(null);
  const [images, setImages] = useState<PostImage[]>([]);
  const [videos, setVideos] = useState<PostVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [lightboxImage, setLightboxImage] = useState<PostImage | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('不適切な内容');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  const viewedRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const fetched = await fetchPostById(postId);
        if (!fetched) {
          if (!cancelled) setLoadError('指定された投稿が見つかりませんでした。');
          return;
        }
        const media = await fetchPostMedia(
          fetched.postId,
          fetched.status,
          fetched.authorId,
          isAdmin,
          authUser?.uid,
        );
        if (!cancelled) {
          setPost(fetched);
          setImages(media.images);
          setVideos(media.videos);
        }
        if (
          authUser?.emailVerified &&
          fetched.status === 'approved' &&
          viewedRef.current !== fetched.postId
        ) {
          viewedRef.current = fetched.postId;
          void incrementPostView(fetched, true);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : '投稿データの読み込みに失敗しました。',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [postId, authUser, isAdmin]);

  // Sync live counters from context posts array
  const livePost = useMemo(() => {
    const fromContext = posts.find((p) => p.postId === postId);
    if (fromContext && post) {
      return {
        ...post,
        likesCount: fromContext.likesCount,
        favoritesCount: fromContext.favoritesCount,
      };
    }
    return post;
  }, [post, posts, postId]);

  const relatedPosts = useMemo(() => {
    if (!livePost) return [];
    return posts
      .filter(
        (p) =>
          p.postId !== livePost.postId &&
          (p.playType === livePost.playType || p.clawType === livePost.clawType),
      )
      .slice(0, 3);
  }, [posts, livePost]);

  const canModify =
    Boolean(authUser?.emailVerified) &&
    Boolean(livePost) &&
    (livePost!.authorId === authUser?.uid || isAdmin);

  const handleDeletePost = async () => {
    if (!livePost) return;
    if (!isAdmin && isFeatureSuspended('post')) {
      const suffix = suspensionExpiryLabel ? `（${suspensionExpiryLabel}）` : '';
      showToast(`現在このアカウントでは投稿・削除機能が停止されています${suffix}。`, 'error');
      setConfirmDelete(false);
      return;
    }
    setDeleting(true);
    try {
      const idToken = await authUser?.getIdToken();
      await deletePostCascade(livePost.postId, isAdmin, idToken);
      showToast('投稿を削除しました。', 'success');
      await refreshAllData();
      closePostDetail();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '投稿の削除に失敗しました。',
        'error',
      );
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleDeleteSingleImage = async (img: PostImage) => {
    if (!livePost || !authUser) return;
    if (!isAdmin && isFeatureSuspended('post')) {
      const suffix = suspensionExpiryLabel ? `（${suspensionExpiryLabel}）` : '';
      showToast(`現在このアカウントでは画像の削除機能が停止されています${suffix}。`, 'error');
      return;
    }
    setDeletingImageId(img.imageId);
    try {
      const idToken = await authUser.getIdToken();
      await deleteSinglePostImage(img, livePost, idToken);
      setImages((prev) => prev.filter((item) => item.imageId !== img.imageId));
      if (lightboxImage?.imageId === img.imageId) {
        setLightboxImage(null);
      }
      showToast('画像を削除しました。', 'success');
      await refreshAllData();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '画像の削除に失敗しました。',
        'error',
      );
    } finally {
      setDeletingImageId(null);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!livePost) return;
    if (!authUser || needsEmailVerification) {
      setShowAuthModal(true);
      showToast('通報を送信するにはログインが必要です。', 'info');
      return;
    }
    if (isFeatureSuspended('report')) {
      const suffix = suspensionExpiryLabel ? `（${suspensionExpiryLabel}）` : '';
      showToast(`現在このアカウントでは通報機能が停止されています${suffix}。`, 'error');
      return;
    }
    setSubmittingReport(true);
    try {
      await createReport({
        postId: livePost.postId,
        postTitle: livePost.title,
        reporterId: authUser.uid,
        reason: reportReason,
        details: reportDetails,
      });
      showToast('運営への通報を受け付けました。ご協力ありがとうございます。', 'success');
      setShowReportModal(false);
      setReportDetails('');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '通報の送信に失敗しました。',
        'error',
      );
    } finally {
      setSubmittingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 pb-8">
        <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-3xl animate-pulse" />
      </div>
    );
  }

  if (loadError || !livePost) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
        <p className="text-base font-bold text-slate-900 dark:text-white">
          {loadError || '投稿を表示できません。'}
        </p>
        <button
          type="button"
          onClick={closePostDetail}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>一覧へ戻る</span>
        </button>
      </div>
    );
  }

  const isLiked = likedPostIds.has(livePost.postId);
  const isFavorited = favoritedPostIds.has(livePost.postId);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={closePostDetail}
          className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>戻る</span>
        </button>

        {canModify && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openEditPost(livePost)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <Edit3 className="w-4 h-4" />
              <span>編集</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>削除</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Article */}
      <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6">
          {livePost.status !== 'approved' && (
            <div
              className={`p-4 rounded-2xl border text-sm ${
                livePost.status === 'pending'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200'
              }`}
            >
              <p className="font-bold">
                審査状況: {livePost.status === 'pending' ? '審査待ち（非公開）' : '却下'}
              </p>
              {livePost.rejectionReason && (
                <p className="text-xs mt-1">却下理由: {livePost.rejectionReason}</p>
              )}
            </div>
          )}

          {/* Header Metadata */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm font-semibold text-blue-700 dark:text-sky-400">
              <span>爪タイプ: {livePost.clawType}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                ·
              </span>
              <span>配置方式: {livePost.playType}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                ·
              </span>
              <span className="text-slate-700 dark:text-slate-300">
                難易度: {livePost.difficulty}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight text-balance">
              {livePost.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
              <span>
                投稿者: <strong className="text-slate-800 dark:text-slate-200">{livePost.authorName}</strong>
              </span>
              <span className="inline-flex items-center gap-1 font-mono-num">
                <Calendar className="w-3.5 h-3.5" />
                投稿日: {formatDateJa(livePost.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1 font-mono-num">
                更新日: {formatDateJa(livePost.updatedAt)}
              </span>
              <span className="inline-flex items-center gap-1 font-mono-num">
                <Eye className="w-3.5 h-3.5" />
                閲覧: {livePost.viewsCount}
              </span>
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-y border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleToggleLike(livePost)}
                className={`min-h-[44px] px-4 py-2 rounded-xl inline-flex items-center gap-2 text-sm font-semibold transition-colors ${
                  isLiked
                    ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                <span>いいね</span>
                <span className="font-mono-num">{livePost.likesCount}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleToggleFavorite(livePost)}
                className={`min-h-[44px] px-4 py-2 rounded-xl inline-flex items-center gap-2 text-sm font-semibold transition-colors ${
                  isFavorited
                    ? 'bg-sky-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-400 border border-sky-200 dark:border-blue-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
                <span>{isFavorited ? 'お気に入り保存済み' : 'お気に入り登録'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!authUser || needsEmailVerification) {
                  setShowAuthModal(true);
                  showToast('通報するにはログインが必要です。', 'info');
                  return;
                }
                if (isFeatureSuspended('report')) {
                  const suffix = suspensionExpiryLabel ? `（${suspensionExpiryLabel}）` : '';
                  showToast(`現在このアカウントでは通報機能が停止されています${suffix}。`, 'error');
                  return;
                }
                setShowReportModal(true);
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>問題を報告（通報）</span>
            </button>
          </div>

          {/* Images Gallery with Tap-to-Zoom & Owner/Operator Delete */}
          {images.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                設定画像（タップで拡大）
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {images.map((img, index) => (
                  <div
                    key={img.imageId}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col"
                  >
                    <button
                      type="button"
                      onClick={() => setLightboxImage(img)}
                      className="relative aspect-[4/3] w-full overflow-hidden group focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      <SafeImage
                        src={img.imageUrl}
                        alt={`${livePost.title} - 画像 ${index + 1}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-slate-950/75 text-white text-xs font-medium inline-flex items-center gap-1">
                        <ZoomIn className="w-3.5 h-3.5" />
                        <span>拡大</span>
                      </span>
                    </button>
                    <div className="px-3.5 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-mono-num">
                        画像 #{index + 1}
                      </span>
                      {canModify && (
                        <button
                          type="button"
                          disabled={deletingImageId === img.imageId}
                          onClick={() => void handleDeleteSingleImage(img)}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{deletingImageId === img.imageId ? '削除中...' : '画像を削除'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Setting Description */}
          <section className="space-y-2.5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              設定方法の説明
            </h2>
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
              {livePost.description}
            </div>
          </section>

          {/* Notes */}
          {livePost.notes && (
            <section className="space-y-2.5">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                注意事項・運用のポイント
              </h2>
              <div className="p-5 rounded-2xl bg-sky-50/60 dark:bg-blue-950/30 border border-sky-200/80 dark:border-blue-900/60 text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {livePost.notes}
              </div>
            </section>
          )}

          {/* Reference Videos */}
          {videos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                参考動画
              </h2>
              <div className="space-y-4">
                {videos.map((vid, idx) => {
                  const embedUrl = getYouTubeEmbedUrl(vid.videoUrl);
                  return (
                    <div
                      key={vid.videoId}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950"
                    >
                      {embedUrl && (
                        <div className="aspect-video w-full bg-black">
                          <iframe
                            src={embedUrl}
                            title={`参考動画 ${idx + 1}`}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      )}
                      <div className="p-3.5 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 truncate">
                          <PlayCircle className="w-4 h-4 text-blue-700 dark:text-sky-400 shrink-0" />
                          <span className="truncate">{vid.videoUrl}</span>
                        </span>
                        <a
                          href={sanitizeExternalHref(vid.videoUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-blue-700 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <span>動画を開く</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </article>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            関連する設定投稿
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {relatedPosts.map((rp) => (
              <PostCard key={rp.postId} post={rp} />
            ))}
          </div>
        </section>
      )}

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="画像拡大表示"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-w-4xl w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white">
              {canModify ? (
                <button
                  type="button"
                  disabled={deletingImageId === lightboxImage.imageId}
                  onClick={() => void handleDeleteSingleImage(lightboxImage)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600/90 hover:bg-red-600 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingImageId === lightboxImage.imageId ? '削除中...' : 'この画像を削除'}</span>
                </button>
              ) : (
                <span className="text-xs font-semibold text-white/80">画像拡大表示</span>
              )}
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="拡大表示を閉じる"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full max-h-[80vh] overflow-hidden rounded-2xl bg-slate-900 flex items-center justify-center">
              <SafeImage
                src={lightboxImage.imageUrl}
                alt="拡大画像"
                className="max-h-[80vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
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
              「{livePost.title}」を削除すると元に戻すことはできません。
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeletePost()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {deleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="投稿の通報"
        >
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                不適切な投稿を通報する
              </h3>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSubmitReport(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  通報理由
                </label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value as ReportReason)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                >
                  {REPORT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  詳細（任意）
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="問題の詳細や著作権侵害の根拠となるURLなどをご記入ください"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {submittingReport ? '送信中...' : '通報を送信'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
