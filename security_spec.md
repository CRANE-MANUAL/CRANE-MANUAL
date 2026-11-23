# Security Specification (CRANE MANUAL)

## 1. Data Invariants
1. **Self-Registration Role Integrity**: A regular user creating `/users/{userId}` MUST set `role == "user"`, `status == "active"`, and `userId == request.auth.uid`. Only an existing verified admin can promote a user or suspend an account.
2. **PII Isolation**: `/users/{userId}` contains `email` and is strictly readable only by `isOwner(userId)` or `isAdmin()`. Public author profiles live in `/publicProfiles/{userId}` with zero PII.
3. **Publishing & Rejection Integrity**: Regular users creating `/posts/{postId}` publish immediately with `status == "approved"`, `isAdminPost == false`, `likesCount == 0`, `viewsCount == 0`, `favoritesCount == 0`, `rejectionReason == ""`, and `authorId == request.auth.uid`. Only `isAdmin()` can set `status` to `"rejected"` or `"pending"`, set `isAdminPost == true`, or override a rejected post back to `"approved"`.
4. **Public Read Gating**: Unauthenticated or non-admin users can ONLY read `posts`, `postImages`, and `postVideos` whose status is `"approved"`, or their own authored documents.
5. **Recommendations Exclusivity**: Only `isAdmin()` can create, update, or delete `/recommendations/{recommendationId}`. Public users can only read active recommendations (`isActive == true`).
6. **Private Favorites**: `/favorites/{favoriteId}` (`{userId}_{postId}`) is strictly readable and writable only by the owning user (`userId == request.auth.uid`), never by other users.
7. **Deterministic Interaction IDs & Atomic Counts**: `/likes/{userId}_{postId}` and `/favorites/{userId}_{postId}` enforce deterministic IDs and atomic count synchronization via `getAfter` / `existsAfter` / `!existsAfter` where appropriate.
8. **Notification Integrity**: Users can only read and mark `isRead: true` on their own `/notifications/{notificationId}`. Only admins (for approvals/rejections/announcements) or verified likers creating a valid like notification (`type == 'post_liked'` with `existsAfter` like doc) can create notifications.
9. **Temporal & Immutable Integrity**: All `createdAt` and `updatedAt` timestamps must equal `request.time`. Immutable owner/ID/createdAt fields cannot be changed on update.
10. **Email Verification Gate**: All standard authenticated writes and admin checks mandate `request.auth.token.email_verified == true`.

## 2. Dirty Dozen Adversarial Payloads
1. **Self-Admin Escalation**: `POST /users/attacker123` with `{ role: "admin", ... }` -> `PERMISSION_DENIED`.
2. **Unverified Email Admin Spoof**: `POST /recommendations/rec1` with `auth.token.email == "quvoaicode@gmail.com"` and `email_verified == false` -> `PERMISSION_DENIED`.
3. **Bypassing Moderation on Create**: `POST /posts/p1` by regular user with `{ status: "approved", isAdminPost: true }` -> `PERMISSION_DENIED`.
4. **Self-Approving Pending Post**: `PATCH /posts/p1` by regular author changing `status: "approved"` -> `PERMISSION_DENIED`.
5. **Shadow Ghost Field Injection**: `POST /posts/p1` including `{ shadowFlag: true }` -> `PERMISSION_DENIED`.
6. **ID Poisoning**: `PUT /posts/<1500-char-id>` or invalid characters `../admin` -> `PERMISSION_DENIED`.
7. **PII Blanket Scraping**: `GET /users/victim123` or `LIST /users` by non-admin user -> `PERMISSION_DENIED`.
8. **Cross-User Favorite Snooping**: `GET /favorites/victim123_post1` or `LIST /favorites` without `userId == request.auth.uid` -> `PERMISSION_DENIED`.
9. **Unauthorized Post Tampering**: `PATCH /posts/otherUserPost` by non-owner regular user -> `PERMISSION_DENIED`.
10. **Regular User Creating Recommendation**: `POST /recommendations/rec1` by non-admin -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: `POST /posts/p1` with `createdAt: <past client timestamp>` instead of `request.time` -> `PERMISSION_DENIED`.
12. **Reading Pending/Rejected Posts of Others**: `GET /posts/pendingPostOfAlice` by Bob or anonymous user -> `PERMISSION_DENIED`.
