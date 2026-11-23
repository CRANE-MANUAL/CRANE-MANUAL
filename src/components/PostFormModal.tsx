import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileEdit,
  FolderOpen,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  checkCloudinaryStatus,
  CloudinaryStatusResponse,
  deleteCloudinaryImage,
  uploadImageToCloudinary,
  validateImageFile,
} from '../lib/cloudinaryClient';
import { isValidHttpUrl, isValidImageSrc } from '../lib/firebase';
import {
  createPostWithMedia,
  deletePostCascade,
  fetchPostMedia,
  updatePostWithMedia,
} from '../lib/firestoreService';
import {
  DIFFICULTY_LEVELS,
  DifficultyLevel,
  ImageDraft,
  Post,
  VALIDATION_LIMITS,
  VideoDraft,
} from '../types';
import { SafeImage } from './BrandLogo';

function makeDraftId(): string {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDraftTimeJa(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function PostFormModal() {
  const {
    showPostFormModal,
    editingPost,
    closePostForm,
    authUser,
    userProfile,
    isAdmin,
    clawTypes,
    playTypes,
    draftPosts,
    refreshAllData,
    showToast,
  } = useApp();

  const [activePost, setActivePost] = useState<Post | null>(null);
  const [showDraftPicker, setShowDraftPicker] = useState(false);
  const [loadingDraftMedia, setLoadingDraftMedia] = useState(false);

  const [title, setTitle] = useState('');
  const [clawType, setClawType] = useState('');
  const [playType, setPlayType] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('中級');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState<ImageDraft[]>([]);
  const [videos, setVideos] = useState<VideoDraft[]>([]);
  const [publishDirectly, setPublishDirectly] = useState(true);
  const [savingMode, setSavingMode] = useState<'none' | 'publish' | 'draft'>('none');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [cloudinaryStatus, setCloudinaryStatus] = useState<CloudinaryStatusResponse>({
    configured: true,
    missing: [],
  });

  // Track newly uploaded publicIds in this modal session so cancelling cleans up orphaned uploads
  const sessionUploadedPublicIdsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const populateFromPost = async (target: Post) => {
    setActivePost(target);
    setTitle(target.title);
    setClawType(target.clawType || clawTypes[0] || '');
    setPlayType(target.playType || playTypes[0] || '');
    setDifficulty(target.difficulty);
    setDescription(target.description);
    setNotes(target.notes);
    setPublishDirectly(target.status === 'approved' || target.status === 'draft');
    setLoadingDraftMedia(true);
    try {
      const { images: imgs, videos: vids } = await fetchPostMedia(
        target.postId,
        target.status,
        target.authorId,
        isAdmin,
        authUser?.uid,
      );
      setImages(
        imgs.map((i) => ({
          draftId: makeDraftId(),
          imageId: i.imageId,
          imageUrl: i.imageUrl,
          publicId: i.publicId || '',
          sourceUrl: i.sourceUrl || '',
          uploadStatus: 'success',
          uploadProgress: 100,
        })),
      );
      setVideos(vids.map((v) => ({ videoId: v.videoId, videoUrl: v.videoUrl })));
    } finally {
      setLoadingDraftMedia(false);
    }
  };

  useEffect(() => {
    if (!showPostFormModal) return;
    setErrorMsg('');
    setShowDraftPicker(false);
    sessionUploadedPublicIdsRef.current = new Set();

    void checkCloudinaryStatus().then((st) => {
      setCloudinaryStatus(st);
    });

    if (editingPost) {
      void populateFromPost(editingPost);
    } else {
      setActivePost(null);
      setTitle('');
      setClawType(clawTypes[0] || '');
      setPlayType(playTypes[0] || '');
      setDifficulty('中級');
      setDescription('');
      setNotes('');
      setImages([]);
      setVideos([]);
      setPublishDirectly(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPostFormModal, editingPost]);

  useEffect(() => {
    if (!showPostFormModal) return;
    if (!clawType && clawTypes[0]) setClawType(clawTypes[0]);
    if (!playType && playTypes[0]) setPlayType(playTypes[0]);
  }, [showPostFormModal, clawType, playType, clawTypes, playTypes]);

  if (!showPostFormModal) return null;

  const isAnyUploading = images.some((img) => img.uploadStatus === 'uploading');
  const saving = savingMode !== 'none';
  const isDraftMode = !activePost || activePost.status === 'draft';

  const cleanupSessionUploads = async () => {
    const unsavedPublicIds = Array.from(sessionUploadedPublicIdsRef.current);
    if (unsavedPublicIds.length > 0 && authUser) {
      try {
        const token = await authUser.getIdToken();
        await Promise.allSettled(
          unsavedPublicIds.map((pid) => deleteCloudinaryImage(pid, token)),
        );
      } catch {
        // Non-blocking cleanup on cancel
      }
    }
    sessionUploadedPublicIdsRef.current.clear();
  };

  const handleCloseAndCleanup = async () => {
    if (isAnyUploading) {
      showToast('画像のアップロード完了までお待ちください。', 'info');
      return;
    }
    await cleanupSessionUploads();
    closePostForm();
  };

  const handleResumeDraft = async (draft: Post) => {
    if (isAnyUploading) {
      showToast('画像のアップロード完了までお待ちください。', 'info');
      return;
    }
    setErrorMsg('');
    await cleanupSessionUploads();
    setShowDraftPicker(false);
    await populateFromPost(draft);
    showToast('下書きを読み込みました。編集を再開できます。', 'info');
  };

  const handleDeleteDraftFromPicker = async (draft: Post) => {
    if (!authUser) return;
    try {
      const token = await authUser.getIdToken();
      await deletePostCascade(draft.postId, isAdmin, token);
      if (activePost?.postId === draft.postId) {
        setActivePost(null);
        setTitle('');
        setDescription('');
        setNotes('');
        setImages([]);
        setVideos([]);
      }
      showToast('下書きを削除しました。', 'info');
      await refreshAllData();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '下書きの削除に失敗しました。',
        'error',
      );
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    if (!authUser || !authUser.emailVerified) {
      setErrorMsg('画像をアップロードするにはログインおよびメール認証が必要です。');
      return;
    }

    const remainingSlots = 10 - images.length;
    if (remainingSlots <= 0) {
      showToast('画像は最大10枚まで登録できます。', 'info');
      return;
    }

    const selected = Array.from(fileList).slice(0, remainingSlots);
    if (fileList.length > remainingSlots) {
      showToast(`上限10枚のため、最初の ${remainingSlots} 枚をアップロードします。`, 'info');
    }

    let idToken = '';
    try {
      idToken = await authUser.getIdToken();
    } catch {
      setErrorMsg('認証情報の取得に失敗しました。再ログインしてください。');
      return;
    }

    const initialDrafts: { draft: ImageDraft; file: File; validationError: string | null }[] =
      selected.map((file) => {
        const validationError = validateImageFile(file);
        return {
          file,
          validationError,
          draft: {
            draftId: makeDraftId(),
            imageUrl: '',
            publicId: '',
            fileName: file.name,
            uploadStatus: validationError ? 'error' : 'uploading',
            uploadProgress: 0,
            errorMessage: validationError || undefined,
          },
        };
      });

    setImages((prev) => [...prev, ...initialDrafts.map((item) => item.draft)]);

    await Promise.all(
      initialDrafts.map(async ({ draft, file, validationError }) => {
        if (validationError) return;
        try {
          const uploaded = await uploadImageToCloudinary(file, idToken, (pct) => {
            setImages((prev) =>
              prev.map((item) =>
                item.draftId === draft.draftId
                  ? { ...item, uploadProgress: pct }
                  : item,
              ),
            );
          });

          sessionUploadedPublicIdsRef.current.add(uploaded.publicId);
          setImages((prev) =>
            prev.map((item) =>
              item.draftId === draft.draftId
                ? {
                    ...item,
                    imageUrl: uploaded.imageUrl,
                    publicId: uploaded.publicId,
                    uploadStatus: 'success',
                    uploadProgress: 100,
                    errorMessage: undefined,
                  }
                : item,
            ),
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : '画像のアップロードに失敗しました。';
          setImages((prev) =>
            prev.map((item) =>
              item.draftId === draft.draftId
                ? {
                    ...item,
                    uploadStatus: 'error',
                    uploadProgress: 0,
                    errorMessage: message,
                  }
                : item,
            ),
          );
        }
      }),
    );
  };

  const removeImageDraft = async (index: number) => {
    const target = images[index];
    if (!target) return;

    if (
      target.publicId &&
      !target.imageId &&
      sessionUploadedPublicIdsRef.current.has(target.publicId) &&
      authUser
    ) {
      try {
        const token = await authUser.getIdToken();
        await deleteCloudinaryImage(target.publicId, token);
        sessionUploadedPublicIdsRef.current.delete(target.publicId);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Cloudinary上の画像削除に失敗しました。',
          'error',
        );
        return;
      }
    }

    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    setImages((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const addVideoRow = () => {
    if (videos.length >= 5) {
      showToast('参考動画は最大5件まで登録できます。', 'info');
      return;
    }
    setVideos((prev) => [...prev, { videoUrl: '' }]);
  };

  const persistPost = async (saveAsDraft: boolean) => {
    setErrorMsg('');

    if (!authUser || !authUser.emailVerified) {
      setErrorMsg('ログインおよびメール認証が必要です。');
      return;
    }

    if (isAnyUploading) {
      setErrorMsg('画像のアップロードが完了するまでお待ちください。');
      return;
    }

    const failedImages = images.filter((img) => img.uploadStatus === 'error');
    if (failedImages.length > 0) {
      setErrorMsg(
        'アップロードに失敗した画像があります。不要なエラー項目を削除してから保存してください。',
      );
      return;
    }

    const readyImages = images.filter(
      (img) =>
        img.uploadStatus === 'success' &&
        isValidImageSrc(img.imageUrl, isAdmin) &&
        (isAdmin || Boolean(img.publicId.trim())),
    );
    const cleanedVideos = videos.filter((v) => v.videoUrl.trim() !== '');

    if (saveAsDraft) {
      const hasAnyContent =
        Boolean(title.trim()) ||
        Boolean(description.trim()) ||
        Boolean(notes.trim()) ||
        readyImages.length > 0 ||
        cleanedVideos.length > 0;
      if (!hasAnyContent) {
        setErrorMsg(
          '下書きを保存するには、タイトル・説明・注意事項・画像・動画のいずれかを入力してください。',
        );
        return;
      }
    } else {
      if (!title.trim()) {
        setErrorMsg('タイトルを入力してください。');
        return;
      }
      if (!clawType) {
        setErrorMsg('爪・アームタイプを選択してください。');
        return;
      }
      if (!playType) {
        setErrorMsg('景品配置方式を選択してください。');
        return;
      }
      if (!description.trim()) {
        setErrorMsg('設定方法の説明を入力してください。');
        return;
      }
    }

    for (let i = 0; i < cleanedVideos.length; i++) {
      if (!isValidHttpUrl(cleanedVideos[i].videoUrl)) {
        setErrorMsg(
          `参考動画 ${i + 1} のURL形式が正しくありません。http:// または https:// で始まるURLを入力してください。`,
        );
        return;
      }
    }

    setSavingMode(saveAsDraft ? 'draft' : 'publish');
    try {
      const idToken = await authUser.getIdToken();
      const authorName =
        userProfile?.username || authUser.displayName || 'ユーザー';

      if (activePost) {
        await updatePostWithMedia(
          activePost,
          authorName,
          isAdmin,
          {
            title,
            description,
            clawType,
            playType,
            difficulty,
            notes,
            images: readyImages,
            videos: cleanedVideos,
            publishDirectly: isAdmin ? publishDirectly : true,
            saveAsDraft,
          },
          idToken,
        );
        showToast(
          saveAsDraft
            ? '下書きを更新しました。マイページや投稿画面からいつでも再開できます。'
            : activePost.status === 'draft'
              ? '下書きをタイムラインに公開しました。'
              : '投稿を更新しました。',
          'success',
        );
      } else {
        await createPostWithMedia(authUser.uid, authorName, isAdmin, {
          title,
          description,
          clawType,
          playType,
          difficulty,
          notes,
          images: readyImages,
          videos: cleanedVideos,
          publishDirectly: isAdmin ? publishDirectly : true,
          saveAsDraft,
        });
        showToast(
          saveAsDraft
            ? '下書きを保存しました。マイページや投稿画面からいつでも再開できます。'
            : isAdmin && !publishDirectly
              ? '非公開として保存しました。'
              : '設定をタイムラインに公開しました。',
          'success',
        );
      }

      sessionUploadedPublicIdsRef.current.clear();
      await refreshAllData();
      closePostForm();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '保存に失敗しました。');
    } finally {
      setSavingMode('none');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistPost(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={activePost ? '設定投稿を編集' : '新しい設定を投稿'}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 my-4 space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {activePost?.status === 'draft'
                ? '下書きから投稿を再開'
                : activePost
                  ? '設定投稿を編集する'
                  : '設定ノウハウを投稿する'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ※メーカー名・機械名・機種名・型番などの項目は不要です。設定構造そのものを共有してください。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCloseAndCleanup()}
            aria-label="閉じる"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saved Drafts Quick Resume Drawer */}
        {draftPosts.length > 0 && !editingPost && (
          <div className="rounded-2xl border border-sky-200 dark:border-blue-900/80 bg-sky-50/70 dark:bg-blue-950/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDraftPicker((v) => !v)}
              className="w-full min-h-[46px] px-4 py-2.5 flex items-center justify-between gap-2 text-left text-xs sm:text-sm font-bold text-blue-900 dark:text-sky-200 hover:bg-sky-100/60 dark:hover:bg-blue-950/50 transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-blue-700 dark:text-sky-400 shrink-0" />
                <span>
                  保存済みの下書きから再開する（
                  <span className="font-mono-num">{draftPosts.length}</span> 件）
                </span>
              </span>
              {showDraftPicker ? (
                <ChevronUp className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" />
              )}
            </button>

            {showDraftPicker && (
              <div className="px-4 pb-3 pt-1 divide-y divide-sky-200/70 dark:divide-blue-900/50">
                {draftPosts.map((d) => {
                  const isCurrent = activePost?.postId === d.postId;
                  return (
                    <div
                      key={d.postId}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {d.title.trim() || '（無題の下書き）'}
                          {isCurrent && (
                            <span className="ml-2 text-blue-700 dark:text-sky-400">
                              · 編集中
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
                          更新: {formatDraftTimeJa(d.updatedAt)}
                          {d.clawType ? ` · ${d.clawType}` : ''}
                          {d.playType ? ` / ${d.playType}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleResumeDraft(d)}
                          className="min-h-[34px] px-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                        >
                          再開
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDraftFromPicker(d)}
                          aria-label="下書きを削除"
                          className="min-h-[34px] min-w-[34px] rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center bg-white dark:bg-slate-900"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activePost?.status === 'draft' && (
          <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-blue-950/35 border border-sky-200 dark:border-blue-900/70 text-xs text-blue-900 dark:text-sky-200 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-semibold">
              <FileEdit className="w-4 h-4 text-blue-700 dark:text-sky-400 shrink-0" />
              <span>
                下書きを編集中です。「下書き保存」で途中保存、「公開して投稿する」でタイムラインに公開できます。
              </span>
            </span>
          </div>
        )}

        {loadingDraftMedia ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-blue-700 dark:text-sky-400" />
            <span>下書きデータを読み込み中...</span>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                タイトル <span className="text-red-600">*公開時は必須</span>
              </label>
              <input
                type="text"
                required
                maxLength={VALIDATION_LIMITS.titleMax}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：橋渡し設定・滑り止めゴム調整で角落としを安定させる方法"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Claw Type & Play Type & Difficulty */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  爪・アームタイプ <span className="text-red-600">*公開時は必須</span>
                </label>
                <select
                  required
                  value={clawType}
                  onChange={(e) => setClawType(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                >
                  {clawTypes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  景品配置方式 <span className="text-red-600">*公開時は必須</span>
                </label>
                <select
                  required
                  value={playType}
                  onChange={(e) => setPlayType(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                >
                  {playTypes.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  難易度（任意）
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                >
                  {DIFFICULTY_LEVELS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                設定方法の説明 <span className="text-red-600">*公開時は必須</span>
              </label>
              <textarea
                required
                rows={6}
                maxLength={VALIDATION_LIMITS.descriptionMax}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="バー間隔、シールド高さ、滑り止め素材、アーム開き幅や狙い方・攻略ポイントを具体的に記載してください。"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                注意事項（任意）
              </label>
              <textarea
                rows={2}
                maxLength={VALIDATION_LIMITS.notesMax}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="景品の形状や重心の違いによる注意点、メンテナンス時の配慮など"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Cloudinary Direct Image Upload Section */}
            <div className="space-y-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                    <ImagePlus className="w-4 h-4 text-blue-700 dark:text-sky-400" />
                    <span>設定画像アップロード（任意・最大10枚）</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    対応形式: JPEG / PNG / WebP · 上限: 1ファイル最大10MB
                  </p>
                </div>
                <span className="text-xs font-mono-num font-bold text-blue-700 dark:text-sky-400">
                  {images.length} / 10 枚
                </span>
              </div>

              {!cloudinaryStatus.configured && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 space-y-1.5 leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Cloudinaryの画像アップロード設定が未完了です</span>
                  </div>
                  <p>
                    画像をアップロードするには、サーバー側の環境変数（Secretsパネル等）に以下の3つを設定してください。
                  </p>
                  <ul className="list-disc list-inside font-mono-num text-[11px]">
                    <li>CLOUDINARY_CLOUD_NAME</li>
                    <li>CLOUDINARY_API_KEY</li>
                    <li>CLOUDINARY_API_SECRET</li>
                  </ul>
                </div>
              )}

              {/* Dropzone & Mobile/PC Selectors */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void handleFilesSelected(e.dataTransfer.files);
                }}
                className={`p-4 rounded-2xl border-2 border-dashed transition-colors text-center space-y-3 ${
                  isDragging
                    ? 'border-blue-600 bg-sky-50/70 dark:bg-blue-950/30'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <UploadCloud className="w-7 h-7 mx-auto text-blue-700 dark:text-sky-400" />
                <div className="space-y-0.5">
                  <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
                    端末から画像を選択してアップロード
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    PCではドラッグ＆ドロップ、スマホでは写真ライブラリまたはカメラ撮影に対応しています（複数同時可）
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleFilesSelected(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      void handleFilesSelected(e.target.files);
                      e.target.value = '';
                    }}
                  />

                  <button
                    type="button"
                    disabled={images.length >= 10 || !cloudinaryStatus.configured}
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>写真・ファイルを選択</span>
                  </button>

                  <button
                    type="button"
                    disabled={images.length >= 10 || !cloudinaryStatus.configured}
                    onClick={() => cameraInputRef.current?.click()}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4 text-blue-700 dark:text-sky-400" />
                    <span>カメラで撮影</span>
                  </button>
                </div>
              </div>

              {/* Uploaded Images List with Progress, Preview, Reorder & Delete */}
              {images.length > 0 && (
                <div className="space-y-2.5">
                  {images.map((img, idx) => (
                    <div
                      key={img.draftId}
                      className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3"
                    >
                      <div className="w-20 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 shrink-0 flex items-center justify-center">
                        {img.uploadStatus === 'uploading' ? (
                          <Loader2 className="w-5 h-5 text-blue-700 dark:text-sky-400 animate-spin" />
                        ) : img.uploadStatus === 'error' ? (
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                        ) : (
                          <SafeImage
                            src={img.imageUrl}
                            alt={`アップロード画像 ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono-num font-bold text-slate-700 dark:text-slate-300">
                            #{idx + 1}
                          </span>
                          {idx === 0 && img.uploadStatus === 'success' && (
                            <span className="text-[11px] font-bold text-blue-700 dark:text-sky-400">
                              サムネイル画像
                            </span>
                          )}
                          {img.fileName && (
                            <span className="text-slate-500 dark:text-slate-400 truncate">
                              {img.fileName}
                            </span>
                          )}
                        </div>

                        {img.uploadStatus === 'uploading' && (
                          <div className="space-y-1">
                            <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-blue-700 dark:bg-sky-400 transition-all duration-150"
                                style={{ width: `${img.uploadProgress}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-blue-700 dark:text-sky-400 font-mono-num">
                              アップロード中... {img.uploadProgress}%
                            </p>
                          </div>
                        )}

                        {img.uploadStatus === 'success' && (
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>アップロード完了（安全に保存されます）</span>
                          </p>
                        )}

                        {img.uploadStatus === 'error' && (
                          <p className="text-[11px] text-red-600 dark:text-red-400 font-medium leading-snug">
                            {img.errorMessage || 'アップロードに失敗しました。'}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0 || img.uploadStatus === 'uploading'}
                          onClick={() => moveImage(idx, -1)}
                          aria-label="上へ移動"
                          className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 disabled:opacity-40"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === images.length - 1 || img.uploadStatus === 'uploading'}
                          onClick={() => moveImage(idx, 1)}
                          aria-label="下へ移動"
                          className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 disabled:opacity-40"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={img.uploadStatus === 'uploading'}
                          onClick={() => void removeImageDraft(idx)}
                          aria-label="画像を削除"
                          className="min-h-[36px] min-w-[36px] rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reference Videos Section */}
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-blue-700 dark:text-sky-400" />
                  <span>参考動画URL（任意）</span>
                </h3>
                <button
                  type="button"
                  onClick={addVideoRow}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>動画URLを追加</span>
                </button>
              </div>

              {videos.map((vid, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={vid.videoUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setVideos((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, videoUrl: val } : item,
                        ),
                      );
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setVideos((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label="動画URLを削除"
                    className="min-h-[42px] min-w-[42px] rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Publish Notice */}
            {isAdmin ? (
              <label className="flex items-center gap-2.5 p-3.5 rounded-xl bg-sky-50 dark:bg-blue-950/40 border border-sky-200 dark:border-blue-900 text-xs font-semibold text-blue-900 dark:text-sky-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={publishDirectly}
                  onChange={(e) => setPublishDirectly(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-700"
                />
                <span>タイムラインに即時公開する</span>
              </label>
            ) : (
              <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-blue-950/30 border border-sky-200/80 dark:border-blue-900/60 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2 leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-sky-400 shrink-0 mt-0.5" />
                <span>
                  公開した設定はすぐにホームのタイムラインへ反映されます。書きかけの場合は「下書き保存」から一時保存できます。
                </span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleCloseAndCleanup()}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                キャンセル
              </button>

              {isDraftMode && (
                <button
                  type="button"
                  disabled={saving || isAnyUploading}
                  onClick={() => void persistPost(true)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-sky-50 dark:bg-blue-950/50 hover:bg-sky-100 dark:hover:bg-blue-950 text-blue-800 dark:text-sky-300 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingMode === 'draft' ? '保存中...' : '下書き保存'}</span>
                </button>
              )}

              <button
                type="submit"
                disabled={saving || isAnyUploading}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-60"
              >
                {savingMode === 'publish'
                  ? '送信中...'
                  : isAnyUploading
                    ? '画像アップロード中...'
                    : activePost && activePost.status !== 'draft'
                      ? '変更を保存'
                      : '公開して投稿する'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
