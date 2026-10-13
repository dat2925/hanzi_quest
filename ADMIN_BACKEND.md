# Backend quản trị HanziOne

Backend Node hiện tại phục vụ `/api/admin/*`; frontend quản trị ở `src/admin/AdminPlatform.tsx` đã nối API cho tổng quan, user, khóa/chương, bài học và nhật ký. Mở `/?admin=overview` hoặc nút Admin trong Cài đặt; `/?admin=curriculum` vẫn mở trình biên tập. Types dùng chung ở `src/admin/platform-types.ts`; types biên tập JSON hiện có ở `src/admin/types.ts`. Prompt thiết kế ban đầu được giữ ở `ANTIGRAVITY_ADMIN_PROMPT.md`.

## Cài đặt

1. Chạy migrations hiện có theo thứ tự tới `202610130005`, sau đó chạy `supabase/migrations/202610130006_platform_admin.sql` bằng SQL Editor. Migration giữ user, tiến độ và nội dung hiện có; bổ sung bảng quyền, trạng thái tài khoản, nhật ký, revision, policy và wrapper RPC. Không chạy lại migration đã áp dụng.
2. Thay UUID trong `supabase/manual/grant_platform_admin_after_review.sql` bằng ID tài khoản thật từ Supabase Auth rồi chạy file này để cấp admin đầu tiên. Quyền biên tập cũ không tự nâng thành quyền quản trị user.
3. Backend cần `SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (hoặc `SUPABASE_SERVICE_ROLE_KEY`), `VITE_APP_URL`. Secret chỉ ở server. Dùng `npm run build` và `npm run mcp`; Vite đã proxy `/api/admin` về cổng 8787.
4. Build và triển khai mã nguồn mới để phục vụ cả backend lẫn frontend quản trị. Các bước SQL/deploy trên production chưa được thực hiện trong phiên Codex này.

Mọi request cần `Authorization: Bearer <Supabase access_token>`. POST cần `Content-Type: application/json`. Response có `Cache-Control: no-store`. Nếu gửi Origin phải trùng origin của `VITE_APP_URL`. Không gửi token qua query string. Trả `{ "error": "mã hoặc mô tả" }` khi lỗi.

## Phân quyền

| Role | Phạm vi |
| --- | --- |
| learner | Học và dữ liệu cá nhân của chính mình |
| editor | API `/api/admin/curriculum/*` hiện có, nhập/sửa/duyệt/xuất bản bài |
| admin | Tất cả API quản trị mới và API curriculum hiện có |

Backend xác minh JWT qua Supabase Auth ở mỗi request, kiểm tra quyền bằng RPC, rồi gọi RPC service role. DB kiểm tra lại actor. Không có quyền ghi bảng quản trị trực tiếp từ browser. Tài khoản suspended mất quyền học/đọc dữ liệu học và quyền admin/editor, kể cả JWT chưa hết hạn. Đây là khóa sử dụng HanziOne, không xóa tài khoản hoặc thay mật khẩu Supabase Auth. Không tự khóa hoặc đổi role của chính mình; muốn khóa admin khác phải hạ role trước. Vì admin không tự hạ role/khóa, không thể xóa admin cuối cùng qua API.

## GET endpoints

Danh sách trả `{items,total,limit,offset}`. Mặc định `limit=25&offset=0`, tối đa limit 100, offset 100000. `search` tối đa 100 ký tự, tìm không phân biệt hoa thường; `%`/`_` là ký tự thường. Phân trang theo thứ tự ổn định; dùng tổng số để tính nút trang tiếp. Mỗi lần đổi bộ lọc đưa offset về 0.

| Endpoint | Query | Response |
| --- | --- | --- |
| `/api/admin/access` | Không | `AdminAccess` với userId/role/capabilities |
| `/api/admin/overview` | Không | `AdminOverview`: tổng user, suspended, user có phiên học 7 ngày, khóa, bài published, nháp, chờ duyệt, số phiên 7 ngày |
| `/api/admin/users` | limit, offset, search, status=`active\|suspended`, role=`learner\|editor\|admin` | `PageResult<AdminUserRow>`; tìm email/tên/UUID |
| `/api/admin/users/:uuid` | limit, offset | `AdminUserDetail`; phân trang `lessonProgress`, tổng `progressTotal`; profile/stats có thể null |
| `/api/admin/courses` | limit, offset, search | `PageResult<AdminCourseRow>` |
| `/api/admin/chapters` | courseId bắt buộc, limit, offset | `PageResult<AdminChapterRow>` |
| `/api/admin/lessons` | courseId, chapterId, status=`draft\|reviewed\|published\|hidden`, search, limit, offset | `PageResult<AdminLessonRow>`; không tải toàn bộ nội dung bài trong danh sách |
| `/api/admin/audit` | search, limit, offset | `PageResult<AdminAuditRow>`; gồm thao tác quản trị mới và `curriculum.save/review/publish` cũ |

`activeUsers7d` tính từ phiên học, không phải thời điểm đăng nhập. `learners` của bài là số user có bản ghi lesson_progress, gồm cả đang học. Nhật ký không cung cấp nội dung sổ tay, checkpoint, mật khẩu hay metadata Auth. Ngày giờ trả ISO; FE hiển thị `Asia/Ho_Chi_Minh`.

Chi tiết nội dung bài: dùng `GET /api/admin/curriculum?course=<courseId>` rồi tìm lesson/draft theo ID. Đừng dùng danh sách gọn `/lessons` làm JSON để xuất bản. Nhập/sửa/validate/preview/review/publish tiếp tục theo `ADMIN_CURRICULUM.md`.

## POST commands

URL: `/api/admin/commands/<action>`. Body chung:

```json
{ "requestId": "UUID mới", "id": "ID đối tượng", "expectedRevision": 0 }
```

Gửi lại cùng requestId và payload khi retry lỗi mạng; thay nội dung phải dùng requestId mới. Mỗi thao tác thành công trả `{requestId,action,id,revision}`. Lần gọi trùng thành công trả lại kết quả cũ, không ghi nhật ký lần hai. Các lệnh ghi và audit nằm cùng transaction. Body tối đa 20 KB, field lạ bị từ chối.

| Action | Các field bổ sung | Revision lấy từ đâu |
| --- | --- | --- |
| `user.update` | displayName (1–100), targetHsk (1–100), dailyGoalMinutes (1–180), profileUpdatedAt (ISO, hoặc null nếu chưa có profile) | user detail/list `revision`; profileUpdatedAt lấy đúng `profile.updated_at` |
| `user.access` | suspended boolean, reason tối đa 500; reason bắt buộc khi khóa | user detail/list `revision` |
| `user.role` | role `learner\|editor\|admin` | user detail/list `revision` |
| `course.save` | title (1–200), description tối đa 5000, sortOrder (0–1000000); khóa mới cần family `foundation\|HSK`, syllabusVersion (1–100), hskLevel (1–9 cho HSK, null cho foundation) | `admin_revision`, khóa mới dùng 0 |
| `chapter.save` | courseId, title, description, sortOrder | `admin_revision`, chương mới dùng 0 |
| `lesson.visibility` | published boolean | lesson `admin_revision`, không dùng draft revision |
| `draft.delete` | Không thêm | draft `revision`, không dùng admin_revision |

ID khóa/chương/bài: `^[a-z][a-z0-9-]{1,99}$`; user ID là UUID. Khóa mới ở trạng thái chưa xuất bản và sẽ hiện với học viên sau khi xuất bản bài qua workflow hiện có. `course.save` chỉ chỉnh tên/mô tả/thứ tự của khóa đã tồn tại; family/phiên bản/HSK level không được đổi. `chapter.save` không đổi khóa sở hữu. Thứ tự chương phải duy nhất trong khóa; nếu trùng trả lỗi, FE yêu cầu chọn số khác (chưa có kéo thả sắp xếp hàng loạt).

`lesson.visibility` chỉ ẩn/khôi phục bài đã từng published, không xuất bản draft. Phải ẩn các bài phụ thuộc trước khi ẩn prerequisite; phải khôi phục prerequisite trước khi khôi phục bài phụ thuộc. Nội dung đã từng xuất bản vẫn bất biến kể cả khi ẩn. Tiến độ và ngân hàng câu hỏi được giữ nguyên. Xóa nháp chỉ được khi chưa có lesson tương ứng trong bảng lessons và không có nháp khác phụ thuộc. Nháp SQL có lesson row phải giữ lại và sửa qua quy trình nhận nháp hiện có. Chưa có xóa user/khóa/chương/bài published hoặc sửa XP/tiến độ bằng tay.

Ví dụ khóa user:

```json
{
  "requestId": "8910d4cc-6901-4f61-a1ab-f977424f82bd",
  "id": "70000000-0000-4000-8000-000000000002",
  "expectedRevision": 2,
  "suspended": true,
  "reason": "Tạm khóa theo yêu cầu hỗ trợ"
}
```

## Xử lý lỗi phía FE

| HTTP / mã | FE cần làm |
| --- | --- |
| 401 `AUTH_REQUIRED` | Đăng nhập lại; bỏ dữ liệu quản trị cũ khỏi state |
| 403 `PLATFORM_ADMIN_REQUIRED` | Ẩn màn quản trị toàn hệ thống; có thể kiểm tra curriculum/access cho editor |
| 403 `ACCOUNT_SUSPENDED` | Ngừng gửi thao tác và hiện tài khoản bị khóa |
| 503 `ADMIN_MIGRATION_REQUIRED` | Báo backend chưa cài migration; không giả thành danh sách trống |
| 409 `REVISION_CONFLICT` / `PROFILE_CHANGED` | Tải lại bản mới, cho người dùng xem và nhập lại thay đổi; không tự retry bằng revision mới |
| 409 `REQUEST_ID_CONFLICT` | Nội dung lệnh đã đổi; tạo requestId mới cho lệnh mới |
| 409 `PUBLISHED_DEPENDENTS_EXIST` / `DRAFT_DEPENDENTS_EXIST` | Giải thích đang có bài phụ thuộc; không tự xóa/ẩn dây chuyền |
| 400 `USE_REVIEW_PUBLISH_WORKFLOW` | Mở luồng duyệt và xuất bản draft |
| 400 `PUBLISHED_CONTENT_IMMUTABLE` | Chỉ xem nội dung; tạo bài mới nếu cần nội dung mới |
| 400 `COURSE_VERSION_IMMUTABLE` | Chỉ chỉnh metadata; phiên bản giáo trình cần khóa mới |
| 400 `DEMOTE_ADMIN_BEFORE_SUSPENDING` | Hạ quyền admin khác trước khi khóa |
| 400 `SELF_ROLE_CHANGE_FORBIDDEN` / `SELF_ACCESS_CHANGE_FORBIDDEN` | Bỏ thao tác trên chính mình |
| 400 lỗi validate / trùng thứ tự chương | Hiện thông báo cạnh form; giữ dữ liệu đang nhập |

Lỗi curriculum cũ tiếp tục trả 400, gồm `VOCABULARY_CONFLICT_REVIEW_READING_AND_MEANING` với nhiều dòng chi tiết. Hiện nguyên phần chi tiết bằng text, giữ xuống dòng; không dùng `dangerouslySetInnerHTML`.

## Kiểm thử

`tests/platform-admin.test.ts` chạy Node HTTP handler thật với PostgreSQL/PGlite cô lập qua mock Supabase transport: JWT/quyền, API, tìm kiếm, phân trang, stale revision, sửa profile, retry, phân quyền, suspension với phiên hiện có, RLS/RPC, phụ thuộc bài, dữ liệu published bất biến, xóa nháp và editorial publishing. `npm test` chạy cả kiểm thử cũ; `npm run build` kiểm tra TypeScript/backend. Không dùng production để chạy fixture.
