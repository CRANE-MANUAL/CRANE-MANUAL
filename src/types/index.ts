export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';
export type SuspensionScope = 'none' | 'partial' | 'all';
export type SuspendableFeature = 'post' | 'like' | 'favorite' | 'report' | 'profile';

export const SUSPENDABLE_FEATURES: SuspendableFeature[] = [
  'post',
  'like',
  'favorite',
  'report',
  'profile',
];

export const SUSPENDABLE_FEATURE_LABELS: Record<SuspendableFeature, string> = {
  post: '投稿・編集・削除',
  like: 'いいね',
  favorite: 'お気に入り登録',
  report: '問題の報告（通報）',
  profile: 'プロフィール編集',
};

export type PostStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type DifficultyLevel = '初級' | '中級' | '上級';
export type CategoryKind = 'claw' | 'play';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';
export type NotificationType =
  | 'post_approved'
  | 'post_rejected'
  | 'post_liked'
  | 'admin_announcement';

export type NavTab = 'home' | 'search' | 'recommended' | 'favorites' | 'mypage';

export type SortOption = 'newest' | 'oldest' | 'popular' | 'likes';
export type SearchScope = 'all' | 'title' | 'description';

export const DEFAULT_CLAW_TYPES: string[] = [
  '3本爪',
  '2本爪',
  '1本爪・フック',
  'その他',
];

export const DEFAULT_PLAY_TYPES: string[] = [
  '橋渡し',
  '末広がり',
  'たこ焼き',
  '直取り',
  'リング設定',
  'ペラ輪',
  '箱物設定',
  'ぬいぐるみ設定',
  'お菓子設定',
  'その他',
];

export const DIFFICULTY_LEVELS: DifficultyLevel[] = ['初級', '中級', '上級'];

export const REPORT_REASONS = [
  '不適切な内容',
  '著作権侵害の疑い',
  '画像・動画の無断転載',
  '虚偽情報',
  'その他',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const VALIDATION_LIMITS = {
  usernameMax: 40,
  bioMax: 500,
  urlMax: 1000,
  titleMax: 120,
  descriptionMax: 5000,
  notesMax: 2000,
  categoryNameMax: 40,
  rejectionReasonMax: 500,
  suspensionReasonMax: 500,
  adminCommentMax: 1000,
  reportDetailsMax: 1000,
  inquirySubjectMax: 120,
  inquiryMessageMax: 2000,
} as const;

export interface UserProfile {
  userId: string;
  username: string;
  profileImageUrl: string;
  bio: string;
  role: UserRole;
  status: UserStatus;
  suspensionScope: SuspensionScope;
  suspendedFeatures: SuspendableFeature[];
  suspensionIndefinite: boolean;
  suspendedUntil: string;
  suspensionReason: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfile {
  userId: string;
  username: string;
  profileImageUrl: string;
  bio: string;
  createdAt: string;
}

export interface Post {
  postId: string;
  title: string;
  description: string;
  clawType: string;
  playType: string;
  difficulty: DifficultyLevel;
  notes: string;
  authorId: string;
  authorName: string;
  coverImageUrl: string;
  status: PostStatus;
  rejectionReason: string;
  isAdminPost: boolean;
  likesCount: number;
  viewsCount: number;
  favoritesCount: number;
  createdAt: string;
  updatedAt: string;
}

export const CLOUDINARY_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CLOUDINARY_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export interface PostImage {
  imageId: string;
  postId: string;
  authorId: string;
  postStatus: PostStatus;
  imageUrl: string;
  publicId: string;
  sourceUrl?: string;
  displayOrder: number;
  createdAt: string;
}

export interface PostVideo {
  videoId: string;
  postId: string;
  authorId: string;
  postStatus: PostStatus;
  videoUrl: string;
  displayOrder: number;
  createdAt: string;
}

export interface Recommendation {
  recommendationId: string;
  postId: string;
  adminComment: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  reportId: string;
  postId: string;
  postTitle: string;
  reporterId: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  createdAt: string;
}

export interface NotificationItem {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  postId: string;
  isRead: boolean;
  createdAt: string;
}

export interface CategoryItem {
  categoryId: string;
  kind: CategoryKind;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface Inquiry {
  inquiryId: string;
  userId: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface InquiryMessage {
  messageId: string;
  inquiryId: string;
  inquiryOwnerId: string;
  senderId: string;
  senderRole: 'user' | 'support';
  body: string;
  createdAt: string;
}

export interface SearchFilters {
  keyword: string;
  scope: SearchScope;
  clawType: string;
  playType: string;
  difficulty: string;
  sort: SortOption;
}

export interface ImageDraft {
  draftId: string;
  imageId?: string;
  imageUrl: string;
  publicId: string;
  sourceUrl?: string;
  fileName?: string;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  uploadProgress: number;
  errorMessage?: string;
}

export interface VideoDraft {
  videoId?: string;
  videoUrl: string;
}
