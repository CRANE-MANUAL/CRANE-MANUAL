import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  isValidHttpUrl,
  isValidImageSrc,
  OperationType,
} from './firebase';
import { deleteCloudinaryImage } from './cloudinaryClient';
import {
  CategoryItem,
  CategoryKind,
  DEFAULT_CLAW_TYPES,
  DEFAULT_PLAY_TYPES,
  DifficultyLevel,
  ImageDraft,
  Inquiry,
  InquiryMessage,
  NotificationItem,
  Post,
  PostImage,
  PostStatus,
  PostVideo,
  PublicProfile,
  Recommendation,
  Report,
  ReportReason,
  ReportStatus,
  SUSPENDABLE_FEATURES,
  SuspendableFeature,
  SuspensionScope,
  UserProfile,
  UserRole,
  UserStatus,
  VALIDATION_LIMITS,
  VideoDraft,
} from '../types';

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

function mapPost(data: Record<string, unknown>, id: string): Post {
  return {
    postId: String(data.postId || id),
    title: String(data.title || ''),
    description: String(data.description || ''),
    clawType: String(data.clawType || ''),
    playType: String(data.playType || ''),
    difficulty: (data.difficulty as DifficultyLevel) || '中級',
    notes: String(data.notes || ''),
    authorId: String(data.authorId || ''),
    authorName: String(data.authorName || 'ユーザー'),
    coverImageUrl: String(data.coverImageUrl || ''),
    status: (data.status as PostStatus) || 'pending',
    rejectionReason: String(data.rejectionReason || ''),
    isAdminPost: Boolean(data.isAdminPost),
    likesCount: Number(data.likesCount || 0),
    viewsCount: Number(data.viewsCount || 0),
    favoritesCount: Number(data.favoritesCount || 0),
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

function mapPostImage(data: Record<string, unknown>, id: string): PostImage {
  return {
    imageId: String(data.imageId || id),
    postId: String(data.postId || ''),
    authorId: String(data.authorId || ''),
    postStatus: (data.postStatus as PostStatus) || 'pending',
    imageUrl: String(data.imageUrl || ''),
    publicId: String(data.publicId || ''),
    sourceUrl: data.sourceUrl ? String(data.sourceUrl) : '',
    displayOrder: Number(data.displayOrder || 0),
    createdAt: tsToIso(data.createdAt),
  };
}

function mapPostVideo(data: Record<string, unknown>, id: string): PostVideo {
  return {
    videoId: String(data.videoId || id),
    postId: String(data.postId || ''),
    authorId: String(data.authorId || ''),
    postStatus: (data.postStatus as PostStatus) || 'pending',
    videoUrl: String(data.videoUrl || ''),
    displayOrder: Number(data.displayOrder || 0),
    createdAt: tsToIso(data.createdAt),
  };
}

function mapUserProfile(data: Record<string, unknown>, id: string): UserProfile {
  const status = (data.status as UserStatus) || 'active';
  const hasScope = typeof data.suspensionScope === 'string';
  const suspensionScope: SuspensionScope = hasScope
    ? (data.suspensionScope as SuspensionScope)
    : status === 'suspended'
      ? 'all'
      : 'none';
  const rawFeatures = Array.isArray(data.suspendedFeatures) ? data.suspendedFeatures : [];
  const suspendedFeatures = rawFeatures.filter((f): f is SuspendableFeature =>
    SUSPENDABLE_FEATURES.includes(f as SuspendableFeature),
  );
  const suspensionIndefinite =
    typeof data.suspensionIndefinite === 'boolean'
      ? data.suspensionIndefinite
      : status === 'suspended' && !hasScope;

  return {
    userId: String(data.userId || id),
    username: String(data.username || 'ユーザー'),
    profileImageUrl: String(data.profileImageUrl || ''),
    bio: String(data.bio || ''),
    role: (data.role as UserRole) || 'user',
    status,
    suspensionScope,
    suspendedFeatures,
    suspensionIndefinite,
    suspendedUntil: data.suspendedUntil ? tsToIso(data.suspendedUntil) : new Date(0).toISOString(),
    suspensionReason: String(data.suspensionReason || ''),
    email: String(data.email || ''),
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

export async function ensureUserProfile(
  authUser: User,
  preferredUsername?: string,
): Promise<UserProfile | null> {
  if (!authUser.emailVerified) {
    return null;
  }
  const userPath = `users/${authUser.uid}`;
  try {
    const userRef = doc(db, 'users', authUser.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return mapUserProfile(snap.data() as Record<string, unknown>, snap.id);
    }

    const isBootstrapAdmin =
      authUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
      authUser.emailVerified;
    const rawName =
      preferredUsername ||
      authUser.displayName ||
      (authUser.email ? authUser.email.split('@')[0] : 'クレーンユーザー');
    const username = clampStr(rawName || 'ユーザー', VALIDATION_LIMITS.usernameMax);
    const profileImageUrl =
      authUser.photoURL && isValidHttpUrl(authUser.photoURL)
        ? clampStr(authUser.photoURL, VALIDATION_LIMITS.urlMax)
        : '';
    const role: UserRole = isBootstrapAdmin ? 'admin' : 'user';
    const email = clampStr(authUser.email || '', 254);

    const batch = writeBatch(db);
    batch.set(userRef, {
      userId: authUser.uid,
      username,
      profileImageUrl,
      bio: '',
      role,
      status: 'active',
      suspensionScope: 'none',
      suspendedFeatures: [],
      suspensionIndefinite: false,
      suspendedUntil: Timestamp.fromDate(new Date(0)),
      suspensionReason: '',
      email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'publicProfiles', authUser.uid), {
      userId: authUser.uid,
      username,
      profileImageUrl,
      bio: '',
      createdAt: serverTimestamp(),
    });
    await batch.commit();

    const created = await getDoc(userRef);
    return mapUserProfile(created.data() as Record<string, unknown>, created.id);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function updateUserProfile(
  userId: string,
  updates: { username: string; profileImageUrl: string; bio: string; email: string },
): Promise<void> {
  const path = `users/${userId}`;
  const username = clampStr(updates.username, VALIDATION_LIMITS.usernameMax);
  if (!username) {
    throw new Error('ユーザー名を入力してください。');
  }
  const profileImageUrl = clampStr(updates.profileImageUrl, VALIDATION_LIMITS.urlMax);
  if (profileImageUrl && !isValidHttpUrl(profileImageUrl)) {
    throw new Error('プロフィール画像URLは http:// または https:// で入力してください。');
  }
  const bio = clampStr(updates.bio, VALIDATION_LIMITS.bioMax);

  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    const existingData = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    const needsBackfill = !('suspensionScope' in existingData);

    const batch = writeBatch(db);
    batch.update(userRef, {
      username,
      profileImageUrl,
      bio,
      email: clampStr(updates.email, 254),
      updatedAt: serverTimestamp(),
      ...(needsBackfill
        ? {
            suspensionScope: 'none',
            suspendedFeatures: [],
            suspensionIndefinite: false,
            suspendedUntil: Timestamp.fromDate(new Date(0)),
            suspensionReason: '',
          }
        : {}),
    });
    batch.update(doc(db, 'publicProfiles', userId), {
      username,
      profileImageUrl,
      bio,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchPublicProfilesMap(
  userIds: string[],
): Promise<Record<string, PublicProfile>> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) return {};
  try {
    const snap = await getDocs(collection(db, 'publicProfiles'));
    const map: Record<string, PublicProfile> = {};
    snap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      map[d.id] = {
        userId: String(data.userId || d.id),
        username: String(data.username || 'ユーザー'),
        profileImageUrl: String(data.profileImageUrl || ''),
        bio: String(data.bio || ''),
        createdAt: tsToIso(data.createdAt),
      };
    });
    return map;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'publicProfiles');
  }
}

export async function fetchApprovedPosts(): Promise<Post[]> {
  try {
    const q = query(
      collection(db, 'posts'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapPost(d.data() as Record<string, unknown>, d.id));
  } catch (error) {
    // Fallback without composite index if index is still building
    try {
      const qFallback = query(collection(db, 'posts'), where('status', '==', 'approved'));
      const snap = await getDocs(qFallback);
      return snap.docs
        .map((d) => mapPost(d.data() as Record<string, unknown>, d.id))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (innerError) {
      handleFirestoreError(innerError, OperationType.LIST, 'posts');
    }
  }
}

export async function fetchAuthorPosts(authorId: string): Promise<Post[]> {
  try {
    const q = query(collection(db, 'posts'), where('authorId', '==', authorId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapPost(d.data() as Record<string, unknown>, d.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `posts?authorId=${authorId}`);
  }
}

export async function fetchAuthorDrafts(authorId: string): Promise<Post[]> {
  const all = await fetchAuthorPosts(authorId);
  return all.filter((p) => p.status === 'draft');
}

export async function fetchAllPostsAdmin(): Promise<Post[]> {
  try {
    const snap = await getDocs(collection(db, 'posts'));
    return snap.docs
      .map((d) => mapPost(d.data() as Record<string, unknown>, d.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'posts');
  }
}

export async function fetchPostById(postId: string): Promise<Post | null> {
  try {
    const snap = await getDoc(doc(db, 'posts', postId));
    if (!snap.exists()) return null;
    return mapPost(snap.data() as Record<string, unknown>, snap.id);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `posts/${postId}`);
  }
}

export async function fetchPostMedia(
  postId: string,
  postStatus: PostStatus,
  authorId: string,
  isAdmin: boolean,
  currentUid?: string,
): Promise<{ images: PostImage[]; videos: PostVideo[] }> {
  try {
    const canSeeUnapproved = isAdmin || (currentUid && currentUid === authorId);
    const imgQ = canSeeUnapproved
      ? query(collection(db, 'postImages'), where('postId', '==', postId))
      : query(
          collection(db, 'postImages'),
          where('postId', '==', postId),
          where('postStatus', '==', 'approved'),
        );
    const vidQ = canSeeUnapproved
      ? query(collection(db, 'postVideos'), where('postId', '==', postId))
      : query(
          collection(db, 'postVideos'),
          where('postId', '==', postId),
          where('postStatus', '==', 'approved'),
        );

    const [imgSnap, vidSnap] = await Promise.all([getDocs(imgQ), getDocs(vidQ)]);
    const images = imgSnap.docs
      .map((d) => mapPostImage(d.data() as Record<string, unknown>, d.id))
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const videos = vidSnap.docs
      .map((d) => mapPostVideo(d.data() as Record<string, unknown>, d.id))
      .sort((a, b) => a.displayOrder - b.displayOrder);
    return { images, videos };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `postImages/${postId}`);
  }
}

export interface PostInputPayload {
  title: string;
  description: string;
  clawType: string;
  playType: string;
  difficulty: DifficultyLevel;
  notes: string;
  images: ImageDraft[];
  videos: VideoDraft[];
  publishDirectly?: boolean;
  saveAsDraft?: boolean;
}

function validatePostPayload(input: PostInputPayload, allowLocalAsset: boolean): void {
  if (input.saveAsDraft) {
    const hasAnyContent =
      Boolean(input.title.trim()) ||
      Boolean(input.description.trim()) ||
      Boolean(input.notes.trim()) ||
      input.images.length > 0 ||
      input.videos.length > 0;
    if (!hasAnyContent) {
      throw new Error(
        '下書きを保存するには、タイトル・説明・注意事項・画像・動画のいずれかを入力してください。',
      );
    }
  } else {
    if (!input.title.trim()) throw new Error('タイトルを入力してください。');
    if (!input.clawType.trim()) throw new Error('爪・アームタイプを選択してください。');
    if (!input.playType.trim()) throw new Error('景品配置方式を選択してください。');
    if (!input.description.trim()) throw new Error('設定方法の説明を入力してください。');
  }

  for (let i = 0; i < input.images.length; i++) {
    const img = input.images[i];
    if (!isValidImageSrc(img.imageUrl, allowLocalAsset)) {
      throw new Error(`画像 ${i + 1} の画像URLの形式が正しくありません。`);
    }
    if (!allowLocalAsset && !img.publicId.trim()) {
      throw new Error(`画像 ${i + 1} のアップロード識別子（publicId）が不足しています。再度アップロードしてください。`);
    }
  }

  for (let i = 0; i < input.videos.length; i++) {
    if (!isValidHttpUrl(input.videos[i].videoUrl)) {
      throw new Error(`参考動画 ${i + 1} のURLの形式が正しくありません。`);
    }
  }
}

export async function createPostWithMedia(
  authorId: string,
  authorName: string,
  isAdmin: boolean,
  input: PostInputPayload,
): Promise<string> {
  validatePostPayload(input, isAdmin);
  const postId = makeId('post');
  const status: PostStatus = input.saveAsDraft
    ? 'draft'
    : isAdmin && input.publishDirectly === false
      ? 'pending'
      : 'approved';
  const coverImageUrl =
    input.images.length > 0
      ? clampStr(input.images[0].imageUrl, VALIDATION_LIMITS.urlMax)
      : '';

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'posts', postId), {
      postId,
      title: clampStr(input.title, VALIDATION_LIMITS.titleMax),
      description: clampStr(input.description, VALIDATION_LIMITS.descriptionMax),
      clawType: clampStr(input.clawType, VALIDATION_LIMITS.categoryNameMax),
      playType: clampStr(input.playType, VALIDATION_LIMITS.categoryNameMax),
      difficulty: input.difficulty,
      notes: clampStr(input.notes, VALIDATION_LIMITS.notesMax),
      authorId,
      authorName: clampStr(authorName || 'ユーザー', VALIDATION_LIMITS.usernameMax),
      coverImageUrl,
      status,
      rejectionReason: '',
      isAdminPost: isAdmin,
      likesCount: 0,
      viewsCount: 0,
      favoritesCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    input.images.slice(0, 10).forEach((img, index) => {
      const imageId = makeId('img');
      batch.set(doc(db, 'postImages', imageId), {
        imageId,
        postId,
        authorId,
        postStatus: status,
        imageUrl: clampStr(img.imageUrl, VALIDATION_LIMITS.urlMax),
        publicId: clampStr(img.publicId || '', 300),
        displayOrder: index,
        createdAt: serverTimestamp(),
      });
    });

    input.videos.slice(0, 5).forEach((vid, index) => {
      const videoId = makeId('vid');
      batch.set(doc(db, 'postVideos', videoId), {
        videoId,
        postId,
        authorId,
        postStatus: status,
        videoUrl: clampStr(vid.videoUrl, VALIDATION_LIMITS.urlMax),
        displayOrder: index,
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
    return postId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${postId}`);
  }
}

export async function updatePostWithMedia(
  post: Post,
  authorName: string,
  isAdmin: boolean,
  input: PostInputPayload,
  idToken?: string,
): Promise<void> {
  validatePostPayload(input, isAdmin);
  const nextStatus: PostStatus =
    input.saveAsDraft && post.status === 'draft'
      ? 'draft'
      : isAdmin
        ? input.publishDirectly === false
          ? 'pending'
          : 'approved'
        : post.status === 'rejected'
          ? 'rejected'
          : 'approved';
  const coverImageUrl =
    input.images.length > 0
      ? clampStr(input.images[0].imageUrl, VALIDATION_LIMITS.urlMax)
      : '';

  try {
    const [existingImgSnap, existingVidSnap] = await Promise.all([
      getDocs(query(collection(db, 'postImages'), where('postId', '==', post.postId))),
      getDocs(query(collection(db, 'postVideos'), where('postId', '==', post.postId))),
    ]);

    const keptPublicIds = new Set(
      input.images.map((i) => i.publicId.trim()).filter(Boolean),
    );
    const removedCloudinaryImages = existingImgSnap.docs
      .map((d) => mapPostImage(d.data() as Record<string, unknown>, d.id))
      .filter((img) => img.publicId && !keptPublicIds.has(img.publicId));

    const batch = writeBatch(db);
    batch.update(doc(db, 'posts', post.postId), {
      title: clampStr(input.title, VALIDATION_LIMITS.titleMax),
      description: clampStr(input.description, VALIDATION_LIMITS.descriptionMax),
      clawType: clampStr(input.clawType, VALIDATION_LIMITS.categoryNameMax),
      playType: clampStr(input.playType, VALIDATION_LIMITS.categoryNameMax),
      difficulty: input.difficulty,
      notes: clampStr(input.notes, VALIDATION_LIMITS.notesMax),
      authorName: clampStr(
        isAdmin ? post.authorName : authorName || post.authorName,
        VALIDATION_LIMITS.usernameMax,
      ),
      coverImageUrl,
      status: nextStatus,
      rejectionReason: '',
      updatedAt: serverTimestamp(),
    });

    existingImgSnap.docs.forEach((d) => batch.delete(d.ref));
    existingVidSnap.docs.forEach((d) => batch.delete(d.ref));

    input.images.slice(0, 10).forEach((img, index) => {
      const imageId = makeId('img');
      const payload: Record<string, unknown> = {
        imageId,
        postId: post.postId,
        authorId: post.authorId,
        postStatus: nextStatus,
        imageUrl: clampStr(img.imageUrl, VALIDATION_LIMITS.urlMax),
        publicId: clampStr(img.publicId || '', 300),
        displayOrder: index,
        createdAt: serverTimestamp(),
      };
      if (img.sourceUrl && img.sourceUrl.trim()) {
        payload.sourceUrl = clampStr(img.sourceUrl, VALIDATION_LIMITS.urlMax);
      }
      batch.set(doc(db, 'postImages', imageId), payload);
    });

    input.videos.slice(0, 5).forEach((vid, index) => {
      const videoId = makeId('vid');
      batch.set(doc(db, 'postVideos', videoId), {
        videoId,
        postId: post.postId,
        authorId: post.authorId,
        postStatus: nextStatus,
        videoUrl: clampStr(vid.videoUrl, VALIDATION_LIMITS.urlMax),
        displayOrder: index,
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();

    const token = idToken || (await auth.currentUser?.getIdToken());
    if (token && removedCloudinaryImages.length > 0) {
      await Promise.allSettled(
        removedCloudinaryImages.map((img) =>
          deleteCloudinaryImage(img.publicId, token, img.imageId),
        ),
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${post.postId}`);
  }
}

export async function deletePostCascade(
  postId: string,
  isAdmin: boolean,
  idToken?: string,
): Promise<void> {
  try {
    const [imgSnap, vidSnap] = await Promise.all([
      getDocs(query(collection(db, 'postImages'), where('postId', '==', postId))),
      getDocs(query(collection(db, 'postVideos'), where('postId', '==', postId))),
    ]);

    const imagesToDelete = imgSnap.docs
      .map((d) => mapPostImage(d.data() as Record<string, unknown>, d.id))
      .filter((img) => Boolean(img.publicId));

    const token = idToken || (await auth.currentUser?.getIdToken());
    if (token && imagesToDelete.length > 0) {
      for (const img of imagesToDelete) {
        await deleteCloudinaryImage(img.publicId, token, img.imageId);
      }
    }

    const batch = writeBatch(db);
    imgSnap.docs.forEach((d) => batch.delete(d.ref));
    vidSnap.docs.forEach((d) => batch.delete(d.ref));

    if (isAdmin) {
      const recSnap = await getDocs(
        query(collection(db, 'recommendations'), where('postId', '==', postId)),
      );
      recSnap.docs.forEach((d) => batch.delete(d.ref));
    }

    batch.delete(doc(db, 'posts', postId));
    await batch.commit();
  } catch (error) {
    if (error instanceof Error && !error.message.startsWith('{')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
  }
}

export async function deleteSinglePostImage(
  image: PostImage,
  post: Post | null,
  idToken?: string,
): Promise<void> {
  const token = idToken || (await auth.currentUser?.getIdToken());
  if (!token) {
    throw new Error('ログインセッションを確認できませんでした。再ログインしてください。');
  }

  if (image.publicId) {
    await deleteCloudinaryImage(image.publicId, token, image.imageId);
  }

  try {
    const siblingSnap = await getDocs(
      query(collection(db, 'postImages'), where('postId', '==', image.postId)),
    );
    const remaining = siblingSnap.docs
      .map((d) => mapPostImage(d.data() as Record<string, unknown>, d.id))
      .filter((img) => img.imageId !== image.imageId)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const batch = writeBatch(db);
    batch.delete(doc(db, 'postImages', image.imageId));
    remaining.forEach((img, idx) => {
      if (img.displayOrder !== idx) {
        batch.update(doc(db, 'postImages', img.imageId), { displayOrder: idx });
      }
    });

    if (post) {
      batch.update(doc(db, 'posts', post.postId), {
        coverImageUrl: remaining[0]?.imageUrl || '',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `postImages/${image.imageId}`);
  }
}

export async function fetchAllPostImagesAdmin(): Promise<PostImage[]> {
  try {
    const snap = await getDocs(collection(db, 'postImages'));
    return snap.docs
      .map((d) => mapPostImage(d.data() as Record<string, unknown>, d.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'postImages');
  }
}

export async function incrementPostView(post: Post, isSignedInAndVerified: boolean): Promise<void> {
  if (!isSignedInAndVerified || post.status !== 'approved') return;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'posts', post.postId), {
      viewsCount: post.viewsCount + 1,
    });
    await batch.commit();
  } catch {
    // Non-blocking background view increment
  }
}

export async function fetchUserLikes(userId: string): Promise<Set<string>> {
  try {
    const q = query(collection(db, 'likes'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return new Set(snap.docs.map((d) => String(d.data().postId || '')));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `likes?userId=${userId}`);
  }
}

export async function fetchUserFavorites(userId: string): Promise<Set<string>> {
  try {
    const q = query(collection(db, 'favorites'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return new Set(snap.docs.map((d) => String(d.data().postId || '')));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `favorites?userId=${userId}`);
  }
}

export async function toggleLike(
  userId: string,
  likerName: string,
  post: Post,
  currentlyLiked: boolean,
): Promise<boolean> {
  const likeId = `${userId}_${post.postId}`;
  try {
    const batch = writeBatch(db);
    const likeRef = doc(db, 'likes', likeId);
    const postRef = doc(db, 'posts', post.postId);

    if (currentlyLiked) {
      batch.delete(likeRef);
      batch.update(postRef, {
        likesCount: Math.max(0, post.likesCount - 1),
      });
    } else {
      batch.set(likeRef, {
        likeId,
        userId,
        postId: post.postId,
        createdAt: serverTimestamp(),
      });
      batch.update(postRef, {
        likesCount: post.likesCount + 1,
      });

      if (post.authorId !== userId) {
        const notifId = makeId('notif');
        batch.set(doc(db, 'notifications', notifId), {
          notificationId: notifId,
          userId: post.authorId,
          type: 'post_liked',
          title: '投稿にいいねが付きました',
          message: `${likerName} さんがあなたの設定「${clampStr(post.title, 60)}」にいいねしました。`,
          postId: post.postId,
          isRead: false,
          createdAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
    return !currentlyLiked;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `likes/${likeId}`);
  }
}

export async function toggleFavorite(
  userId: string,
  post: Post,
  currentlyFavorited: boolean,
): Promise<boolean> {
  const favoriteId = `${userId}_${post.postId}`;
  try {
    const batch = writeBatch(db);
    const favRef = doc(db, 'favorites', favoriteId);
    const postRef = doc(db, 'posts', post.postId);

    if (currentlyFavorited) {
      batch.delete(favRef);
      batch.update(postRef, {
        favoritesCount: Math.max(0, post.favoritesCount - 1),
      });
    } else {
      batch.set(favRef, {
        favoriteId,
        userId,
        postId: post.postId,
        createdAt: serverTimestamp(),
      });
      batch.update(postRef, {
        favoritesCount: post.favoritesCount + 1,
      });
    }

    await batch.commit();
    return !currentlyFavorited;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `favorites/${favoriteId}`);
  }
}

export async function fetchActiveRecommendations(): Promise<Recommendation[]> {
  try {
    const q = query(collection(db, 'recommendations'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          recommendationId: String(data.recommendationId || d.id),
          postId: String(data.postId || ''),
          adminComment: String(data.adminComment || ''),
          displayOrder: Number(data.displayOrder || 0),
          isActive: Boolean(data.isActive),
          createdAt: tsToIso(data.createdAt),
          updatedAt: tsToIso(data.updatedAt),
        };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'recommendations');
  }
}

export async function fetchAllRecommendationsAdmin(): Promise<Recommendation[]> {
  try {
    const snap = await getDocs(collection(db, 'recommendations'));
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          recommendationId: String(data.recommendationId || d.id),
          postId: String(data.postId || ''),
          adminComment: String(data.adminComment || ''),
          displayOrder: Number(data.displayOrder || 0),
          isActive: Boolean(data.isActive),
          createdAt: tsToIso(data.createdAt),
          updatedAt: tsToIso(data.updatedAt),
        };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'recommendations');
  }
}

export async function upsertRecommendation(params: {
  recommendationId?: string;
  postId: string;
  adminComment: string;
  displayOrder: number;
  isActive: boolean;
}): Promise<void> {
  const recommendationId = params.recommendationId || makeId('rec');
  const path = `recommendations/${recommendationId}`;
  try {
    const batch = writeBatch(db);
    const ref = doc(db, 'recommendations', recommendationId);
    if (params.recommendationId) {
      batch.update(ref, {
        postId: params.postId,
        adminComment: clampStr(params.adminComment, VALIDATION_LIMITS.adminCommentMax),
        displayOrder: Math.max(0, Math.min(1000, Math.floor(params.displayOrder))),
        isActive: params.isActive,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(ref, {
        recommendationId,
        postId: params.postId,
        adminComment: clampStr(params.adminComment, VALIDATION_LIMITS.adminCommentMax),
        displayOrder: Math.max(0, Math.min(1000, Math.floor(params.displayOrder))),
        isActive: params.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteRecommendation(recommendationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'recommendations', recommendationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `recommendations/${recommendationId}`);
  }
}

export async function adminModeratePost(
  post: Post,
  nextStatus: 'approved' | 'rejected',
  rejectionReason = '',
): Promise<void> {
  const path = `posts/${post.postId}`;
  try {
    const [imgSnap, vidSnap] = await Promise.all([
      getDocs(query(collection(db, 'postImages'), where('postId', '==', post.postId))),
      getDocs(query(collection(db, 'postVideos'), where('postId', '==', post.postId))),
    ]);

    const batch = writeBatch(db);
    const cleanReason =
      nextStatus === 'rejected'
        ? clampStr(rejectionReason || '掲載基準を満たしていないため却下されました。', VALIDATION_LIMITS.rejectionReasonMax)
        : '';

    batch.update(doc(db, 'posts', post.postId), {
      status: nextStatus,
      rejectionReason: cleanReason,
      updatedAt: serverTimestamp(),
    });

    imgSnap.docs.forEach((d) => {
      batch.update(d.ref, { postStatus: nextStatus });
    });
    vidSnap.docs.forEach((d) => {
      batch.update(d.ref, { postStatus: nextStatus });
    });

    const notifId = makeId('notif');
    batch.set(doc(db, 'notifications', notifId), {
      notificationId: notifId,
      userId: post.authorId,
      type: nextStatus === 'approved' ? 'post_approved' : 'post_rejected',
      title:
        nextStatus === 'approved'
          ? '投稿が承認・公開されました'
          : '投稿が却下されました',
      message:
        nextStatus === 'approved'
          ? `あなたの設定投稿「${clampStr(post.title, 60)}」が承認され、一般公開されました。`
          : `あなたの設定投稿「${clampStr(post.title, 60)}」は却下されました。理由: ${cleanReason}`,
      postId: post.postId,
      isRead: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchCategories(includeInactive = false): Promise<CategoryItem[]> {
  try {
    const q = includeInactive
      ? collection(db, 'categories')
      : query(collection(db, 'categories'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          categoryId: String(data.categoryId || d.id),
          kind: (data.kind as CategoryKind) || 'play',
          name: String(data.name || ''),
          displayOrder: Number(data.displayOrder || 0),
          isActive: Boolean(data.isActive),
          createdAt: tsToIso(data.createdAt),
        };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'categories');
  }
}

export async function upsertCategory(params: {
  categoryId?: string;
  kind: CategoryKind;
  name: string;
  displayOrder: number;
  isActive: boolean;
}): Promise<void> {
  const categoryId = params.categoryId || makeId('cat');
  const cleanName = clampStr(params.name, VALIDATION_LIMITS.categoryNameMax);
  if (!cleanName) throw new Error('カテゴリー名を入力してください。');
  try {
    const batch = writeBatch(db);
    const ref = doc(db, 'categories', categoryId);
    if (params.categoryId) {
      batch.update(ref, {
        kind: params.kind,
        name: cleanName,
        displayOrder: Math.max(0, Math.min(500, Math.floor(params.displayOrder))),
        isActive: params.isActive,
      });
    } else {
      batch.set(ref, {
        categoryId,
        kind: params.kind,
        name: cleanName,
        displayOrder: Math.max(0, Math.min(500, Math.floor(params.displayOrder))),
        isActive: params.isActive,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `categories/${categoryId}`);
  }
}

export async function deleteCategory(categoryId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'categories', categoryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `categories/${categoryId}`);
  }
}

export async function createReport(params: {
  postId: string;
  postTitle: string;
  reporterId: string;
  reason: ReportReason;
  details: string;
}): Promise<void> {
  const reportId = makeId('rep');
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'reports', reportId), {
      reportId,
      postId: params.postId,
      postTitle: clampStr(params.postTitle, VALIDATION_LIMITS.titleMax),
      reporterId: params.reporterId,
      reason: params.reason,
      details: clampStr(params.details, VALIDATION_LIMITS.reportDetailsMax),
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
  }
}

export async function fetchReportsAdmin(): Promise<Report[]> {
  try {
    const snap = await getDocs(collection(db, 'reports'));
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          reportId: String(data.reportId || d.id),
          postId: String(data.postId || ''),
          postTitle: String(data.postTitle || ''),
          reporterId: String(data.reporterId || ''),
          reason: (data.reason as ReportReason) || 'その他',
          details: String(data.details || ''),
          status: (data.status as ReportStatus) || 'pending',
          createdAt: tsToIso(data.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reports');
  }
}

export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'reports', reportId), { status });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function fetchNotifications(userId: string): Promise<NotificationItem[]> {
  try {
    const q = query(collection(db, 'notifications'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          notificationId: String(data.notificationId || d.id),
          userId: String(data.userId || ''),
          type: (data.type as NotificationItem['type']) || 'admin_announcement',
          title: String(data.title || ''),
          message: String(data.message || ''),
          postId: String(data.postId || ''),
          isRead: Boolean(data.isRead),
          createdAt: tsToIso(data.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `notifications?userId=${userId}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'notifications', notificationId), { isRead: true });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsRead(items: NotificationItem[]): Promise<void> {
  const unread = items.filter((n) => !n.isRead);
  if (unread.length === 0) return;
  try {
    const batch = writeBatch(db);
    unread.forEach((n) => {
      batch.update(doc(db, 'notifications', n.notificationId), { isRead: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications/batchRead');
  }
}

export async function sendAdminAnnouncement(
  userIds: string[],
  title: string,
  message: string,
): Promise<void> {
  const cleanTitle = clampStr(title, VALIDATION_LIMITS.titleMax);
  const cleanMessage = clampStr(message, 1000);
  if (!cleanTitle || !cleanMessage) {
    throw new Error('お知らせのタイトルと本文を入力してください。');
  }
  try {
    const batch = writeBatch(db);
    userIds.forEach((uid) => {
      const notificationId = makeId('notif');
      batch.set(doc(db, 'notifications', notificationId), {
        notificationId,
        userId: uid,
        type: 'admin_announcement',
        title: cleanTitle,
        message: cleanMessage,
        postId: '',
        isRead: false,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications/announcement');
  }
}

export async function fetchAllUsersAdmin(): Promise<UserProfile[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs
      .map((d) => mapUserProfile(d.data() as Record<string, unknown>, d.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function updateUserRoleOrStatusAdmin(
  user: UserProfile,
  updates: {
    role: UserRole;
    status: UserStatus;
    suspensionScope?: SuspensionScope;
    suspendedFeatures?: SuspendableFeature[];
    suspensionIndefinite?: boolean;
    suspendedUntilIso?: string;
    suspensionReason?: string;
  },
): Promise<void> {
  const isSuspended = updates.status === 'suspended';
  const scope: SuspensionScope = isSuspended
    ? updates.suspensionScope && updates.suspensionScope !== 'none'
      ? updates.suspensionScope
      : 'all'
    : 'none';
  const features: SuspendableFeature[] =
    isSuspended && scope === 'partial'
      ? (updates.suspendedFeatures || []).filter((f) => SUSPENDABLE_FEATURES.includes(f))
      : [];
  const indefinite = isSuspended ? Boolean(updates.suspensionIndefinite) : false;
  let untilDate = new Date(0);
  if (isSuspended && !indefinite && updates.suspendedUntilIso) {
    const parsed = new Date(updates.suspendedUntilIso);
    if (!Number.isNaN(parsed.getTime())) {
      untilDate = parsed;
    }
  }
  const reason = isSuspended
    ? clampStr(updates.suspensionReason || '', VALIDATION_LIMITS.suspensionReasonMax)
    : '';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.userId), {
      role: updates.role,
      status: updates.status,
      suspensionScope: scope,
      suspendedFeatures: features,
      suspensionIndefinite: indefinite,
      suspendedUntil: Timestamp.fromDate(untilDate),
      suspensionReason: reason,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${user.userId}`);
  }
}

function mapInquiry(data: Record<string, unknown>, id: string): Inquiry {
  return {
    inquiryId: String(data.inquiryId || id),
    userId: String(data.userId || ''),
    email: String(data.email || ''),
    subject: String(data.subject || ''),
    message: String(data.message || ''),
    status: (data.status as 'open' | 'closed') || 'open',
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt || data.createdAt),
  };
}

function mapInquiryMessage(data: Record<string, unknown>, id: string): InquiryMessage {
  return {
    messageId: String(data.messageId || id),
    inquiryId: String(data.inquiryId || ''),
    inquiryOwnerId: String(data.inquiryOwnerId || ''),
    senderId: String(data.senderId || ''),
    senderRole: data.senderRole === 'support' ? 'support' : 'user',
    body: String(data.body || ''),
    createdAt: tsToIso(data.createdAt),
  };
}

export async function createInquiry(params: {
  userId: string;
  email: string;
  subject: string;
  message: string;
}): Promise<string> {
  const inquiryId = makeId('inq');
  const subject = clampStr(params.subject, VALIDATION_LIMITS.inquirySubjectMax);
  const message = clampStr(params.message, VALIDATION_LIMITS.inquiryMessageMax);
  if (!subject || !message) {
    throw new Error('件名とお問い合わせ内容を入力してください。');
  }
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'inquiries', inquiryId), {
      inquiryId,
      userId: params.userId,
      email: clampStr(params.email, 254),
      subject,
      message,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    const msgId = makeId('msg');
    const msgBatch = writeBatch(db);
    msgBatch.set(doc(db, 'inquiryMessages', msgId), {
      messageId: msgId,
      inquiryId,
      inquiryOwnerId: params.userId,
      senderId: params.userId,
      senderRole: 'user',
      body: message,
      createdAt: serverTimestamp(),
    });
    await msgBatch.commit();

    return inquiryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `inquiries/${inquiryId}`);
  }
}

export async function fetchUserInquiries(userId: string): Promise<Inquiry[]> {
  try {
    const q = query(collection(db, 'inquiries'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapInquiry(d.data() as Record<string, unknown>, d.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `inquiries?userId=${userId}`);
  }
}

export function subscribeUserInquiries(
  userId: string,
  onChange: (items: Inquiry[]) => void,
): () => void {
  const q = query(collection(db, 'inquiries'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapInquiry(d.data() as Record<string, unknown>, d.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onChange(items);
    },
    (error) => {
      console.error('subscribeUserInquiries error:', error);
    },
  );
}

export async function fetchInquiriesAdmin(): Promise<Inquiry[]> {
  try {
    const snap = await getDocs(collection(db, 'inquiries'));
    return snap.docs
      .map((d) => mapInquiry(d.data() as Record<string, unknown>, d.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'inquiries');
  }
}

export function subscribeAllInquiriesAdmin(
  onChange: (items: Inquiry[]) => void,
): () => void {
  return onSnapshot(
    collection(db, 'inquiries'),
    (snap) => {
      const items = snap.docs
        .map((d) => mapInquiry(d.data() as Record<string, unknown>, d.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onChange(items);
    },
    (error) => {
      console.error('subscribeAllInquiriesAdmin error:', error);
    },
  );
}

export function subscribeInquiryMessages(
  inquiryId: string,
  inquiryOwnerId: string,
  isAdminMode: boolean,
  onChange: (msgs: InquiryMessage[]) => void,
): () => void {
  const q = isAdminMode
    ? query(collection(db, 'inquiryMessages'), where('inquiryId', '==', inquiryId))
    : query(
        collection(db, 'inquiryMessages'),
        where('inquiryId', '==', inquiryId),
        where('inquiryOwnerId', '==', inquiryOwnerId),
      );

  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs
        .map((d) => mapInquiryMessage(d.data() as Record<string, unknown>, d.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onChange(msgs);
    },
    (error) => {
      console.error('subscribeInquiryMessages error:', error);
    },
  );
}

export async function sendInquiryMessage(params: {
  inquiryId: string;
  inquiryOwnerId: string;
  senderId: string;
  senderRole: 'user' | 'support';
  body: string;
}): Promise<void> {
  const body = clampStr(params.body, VALIDATION_LIMITS.inquiryMessageMax);
  if (!body) {
    throw new Error('メッセージを入力してください。');
  }
  const messageId = makeId('msg');
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'inquiryMessages', messageId), {
      messageId,
      inquiryId: params.inquiryId,
      inquiryOwnerId: params.inquiryOwnerId,
      senderId: params.senderId,
      senderRole: params.senderRole,
      body,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'inquiries', params.inquiryId), {
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `inquiryMessages/${messageId}`);
  }
}

export async function updateInquiryStatus(
  inquiryId: string,
  status: 'open' | 'closed',
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'inquiries', inquiryId), {
      status,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inquiries/${inquiryId}`);
  }
}

export async function deleteUserAccountData(userId: string): Promise<void> {
  try {
    const [postsSnap, favSnap, likeSnap, notifSnap] = await Promise.all([
      getDocs(query(collection(db, 'posts'), where('authorId', '==', userId))),
      getDocs(query(collection(db, 'favorites'), where('userId', '==', userId))),
      getDocs(query(collection(db, 'likes'), where('userId', '==', userId))),
      getDocs(query(collection(db, 'notifications'), where('userId', '==', userId))),
    ]);

    for (const p of postsSnap.docs) {
      await deletePostCascade(p.id, false);
    }

    const batch = writeBatch(db);
    favSnap.docs.forEach((d) => batch.delete(d.ref));
    likeSnap.docs.forEach((d) => batch.delete(d.ref));
    notifSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'publicProfiles', userId));
    batch.delete(doc(db, 'users', userId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

export async function seedDefaultCategoriesAndSamples(
  adminUid: string,
  adminName: string,
): Promise<void> {
  try {
    const [existingCats, existingPosts] = await Promise.all([
      getDocs(collection(db, 'categories')),
      getDocs(collection(db, 'posts')),
    ]);

    const batch = writeBatch(db);
    let ops = 0;

    if (existingCats.empty) {
      DEFAULT_CLAW_TYPES.forEach((name, idx) => {
        const categoryId = `cat_claw_${idx + 1}`;
        batch.set(doc(db, 'categories', categoryId), {
          categoryId,
          kind: 'claw',
          name,
          displayOrder: idx + 1,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        ops++;
      });
      DEFAULT_PLAY_TYPES.forEach((name, idx) => {
        const categoryId = `cat_play_${idx + 1}`;
        batch.set(doc(db, 'categories', categoryId), {
          categoryId,
          kind: 'play',
          name,
          displayOrder: idx + 1,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        ops++;
      });
    }

    if (existingPosts.empty) {
      const samplePosts = [
        {
          postId: 'sample_bridge_box_01',
          title: '標準橋渡し・箱物フィギュア向けバランス設定（バー間隔＋滑り止め調整）',
          description:
            '2本爪クレーンを使用した定番の橋渡し設定です。\n\n【基本構成】\n・手前バーと奥バーの間隔は景品箱の短辺＋12〜15mmを目安に平行配置。\n・バー全面にシリコンチューブを巻くことで、初期位置から極端に滑り落ちるのを防ぎつつ、重心移動による角落としを再現できます。\n\n【狙い目の挙動】\n1〜2手目で角を引っ掛けて箱を斜め（ハの字）にし、最終手で手前または奥の重心を押し込んで落下させるリズムを作れます。',
          clawType: '2本爪',
          playType: '橋渡し',
          difficulty: '中級' as DifficultyLevel,
          notes:
            '箱の重心に偏りがある大型フィギュアの場合は、バー幅を＋3mm広げるか、片側のチューブのみ低摩擦タイプにすると詰まりを防止できます。',
          coverImageUrl: '/src/assets/images/sample_bridge_setting_1795439095127.jpg',
          sourceUrl: 'https://cranemanual.example.jp/guides/bridge-standard',
          recComment:
            'これから橋渡し設定を組む店舗スタッフにも、角落としの挙動を学びたいプレイヤーにも最適な基準マニュアルです。',
        },
        {
          postId: 'sample_takoyaki_02',
          title: 'たこ焼き設定・ピンポン玉バウンド抑制＆当たり穴誘導ガイド',
          description:
            '3本爪または2本爪スプーン型で行うたこ焼き設定の標準レシピです。\n\n【設定のポイント】\n・皿の縁に低反発スポンジシートを敷き、ピンポン玉の場外跳ね返りを軽減。\n・当たり穴の周囲4穴に透明テープでわずかな段差を作ることで、最終的な収束性を調整できます。\n・持ち上げ量は1回あたり2〜3個が安定するアーム開き幅に設定するのがおすすめです。',
          clawType: '3本爪',
          playType: 'たこ焼き',
          difficulty: '初級' as DifficultyLevel,
          notes:
            'ピンポン玉の汚れは転がり方に影響するため、定期的な拭き上げメンテナンスを推奨します。',
          coverImageUrl: '/src/assets/images/sample_takoyaki_setting_1795439093727.jpg',
          sourceUrl: 'https://cranemanual.example.jp/guides/takoyaki-balance',
          recComment:
            '初心者でも楽しみやすい確率感と、跳ねすぎを防ぐ実戦的な皿メンテナンス手順がまとまっています。',
        },
        {
          postId: 'sample_plush_3claw_03',
          title: '3本爪ぬいぐるみ設定・寄せ＆転がし対応の確率・初期位置配置',
          description:
            '大型〜中型ぬいぐるみ向けの3本爪設定ノウハウです。\n\n【景品配置のコツ】\n・取り出し口シールドの高さは、ぬいぐるみの胴体厚みの約65%に設定。\n・1体目を落とし口に近接させず、少し手前で「寄せ」と「持ち上げ」の両方が効く角度で配置します。\n\n【アーム調整】\n・下降停止位置を床面ギリギリに合わせると、タグや耳への引っ掛け・寄せが機能しやすくなります。',
          clawType: '3本爪',
          playType: 'ぬいぐるみ設定',
          difficulty: '初級' as DifficultyLevel,
          notes:
            'ぬいぐるみの重心（頭部が重い・お尻にペレット入りなど）によって、持ち上げた際の抜けやすさが大きく変わります。',
          coverImageUrl: '/src/assets/images/sample_plush_setting_1795439094332.jpg',
          sourceUrl: 'https://cranemanual.example.jp/guides/plush-3claw',
          recComment:
            'シールド高の目安と寄せが効く下降停止位置の決め方が具体的に解説されています。',
        },
        {
          postId: 'sample_suehirogari_04',
          title: '末広がり設定・奥側ワイド開放で横ズレ回避する箱物攻略＆設置法',
          description:
            '手前が狭く、奥側に向かってバー間隔が広がる「末広がり」設定です。\n\n【配置と傾き】\n・手前バー間隔は景品幅の約80%、奥側は景品幅＋18mm程度に広げます。\n・景品が奥へ移動するほど自然に沈み込み、ラスト1手の押し込みや引きずり落としが綺麗に決まります。',
          clawType: '2本爪',
          playType: '末広がり',
          difficulty: '上級' as DifficultyLevel,
          notes:
            '奥へ送りすぎてバーから完全に外れて斜め引っかかりが起きないよう、奥ストッパー位置を確認してください。',
          coverImageUrl: '/src/assets/images/sample_bridge_setting_1795439095127.jpg',
          sourceUrl: 'https://cranemanual.example.jp/guides/suehirogari-pro',
          recComment: '',
        },
      ];

      samplePosts.forEach((sp, idx) => {
        batch.set(doc(db, 'posts', sp.postId), {
          postId: sp.postId,
          title: sp.title,
          description: sp.description,
          clawType: sp.clawType,
          playType: sp.playType,
          difficulty: sp.difficulty,
          notes: sp.notes,
          authorId: adminUid,
          authorName: clampStr(adminName || 'CRANE MANUAL運営', VALIDATION_LIMITS.usernameMax),
          coverImageUrl: sp.coverImageUrl,
          status: 'approved',
          rejectionReason: '',
          isAdminPost: true,
          likesCount: 0,
          viewsCount: 0,
          favoritesCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const imgId = `img_${sp.postId}`;
        batch.set(doc(db, 'postImages', imgId), {
          imageId: imgId,
          postId: sp.postId,
          authorId: adminUid,
          postStatus: 'approved',
          imageUrl: sp.coverImageUrl,
          publicId: '',
          sourceUrl: sp.sourceUrl,
          displayOrder: 0,
          createdAt: serverTimestamp(),
        });

        if (sp.recComment) {
          const recId = `rec_${sp.postId}`;
          batch.set(doc(db, 'recommendations', recId), {
            recommendationId: recId,
            postId: sp.postId,
            adminComment: sp.recComment,
            displayOrder: idx + 1,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        ops += 2;
      });
    }

    if (ops > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seed/initial');
  }
}
