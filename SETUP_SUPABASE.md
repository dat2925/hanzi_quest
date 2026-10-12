# Kết nối Supabase và Render

## Trạng thái bàn giao

Mã nguồn dùng `@supabase/supabase-js` 2.117.3, Auth email/password và PostgreSQL RPC. Chưa kết nối project Supabase thật hoặc gửi email thật. Không có credential trong repository. Có kiểm thử PostgreSQL bằng PGlite (Auth schema/role được mô phỏng), kiểm thử trình duyệt với GoTrue mock + RPC PostgreSQL thật cục bộ. Cần kiểm tra lại trên project của bạn trước khi đưa vào sử dụng.

## 1. Tạo project

Đăng ký tại https://supabase.com/dashboard, tạo organization/project với gói Free. Chọn region gần người dùng, ví dụ Singapore nếu có trong Dashboard. Đặt database password mạnh và giữ trong trình quản lý mật khẩu; không đưa vào frontend hoặc chat. Kiểm tra hạn mức, quy tắc tạm dừng và khả năng sao lưu hiện tại của gói Free trong Dashboard; ứng dụng không dùng Realtime hoặc dịch vụ AI trả phí.

Trong Project Settings / API lấy **Project URL** và **publishable key** bắt đầu bằng `sb_publishable_`. Đây là khóa dành cho client, quyền dữ liệu vẫn bị giới hạn bởi JWT và RLS. Không dùng secret key, service_role hoặc database password cho biến `VITE_*`.

## 2. Chạy migrations theo thứ tự

Trong SQL Editor của project mới, chạy nội dung các file:

1. `supabase/migrations/202610120001_schema.sql`
2. `supabase/migrations/202610120002_sample_content.sql`
3. `supabase/migrations/202610120003_legacy_approval.sql`

Mỗi file dùng transaction. File schema dành cho database mới; không chạy lại file 001 khi đã áp dụng thành công. Lần nâng cấp sau phải thêm migration mới, không sửa/xóa migration đã áp dụng. Có thể dùng Supabase CLI (`supabase init`, `supabase link`, `supabase db push`) thay SQL Editor để lưu migration history; cần đối chiếu history nếu đã chạy thủ công. Không đưa access token CLI vào repository.

Bảng public: `profiles`, `courses`, `units`, `lessons`, `vocabulary`, `lesson_progress`, `stage_progress`, `review_items`, `notebook_entries`, `notebook_tasks`, `study_sessions`, `user_stats`, `sync_operations`, `legacy_imports`. Bảng `private.question_bank` chứa đáp án chuẩn dùng chấm điểm. Tất cả bảng public đều có RLS. Người học chỉ SELECT dữ liệu của chính mình; không có quyền ghi bảng trực tiếp, kể cả dữ liệu của mình. Các RPC kiểm tra `auth.uid()` và tự lấy owner, không tin `user_id` client gửi.

Không cấp thêm quyền INSERT/UPDATE/DELETE cho `authenticated`, không cấp quyền schema `private`, không tắt RLS. Giáo trình chỉ đọc khi course/lesson được xuất bản; vocabulary có cờ xuất bản riêng.

## 3. Cấu hình Auth

Authentication → Providers → Email: bật email/password, bật xác nhận email nếu muốn. Đặt chính sách mật khẩu phù hợp (giao diện đăng ký yêu cầu tối thiểu 8 ký tự). Để vận hành thật, kiểm tra hạn mức email của hệ thống mặc định và cấu hình SMTP của bạn khi cần.

Authentication → URL Configuration:

- Site URL: URL Render HTTPS của ứng dụng, ví dụ `https://YOUR_APP.onrender.com`.
- Redirect URLs cho local: `http://127.0.0.1:8787/`, `http://127.0.0.1:8787/?auth=recovery`, `http://127.0.0.1:5173/`, `http://127.0.0.1:5173/?auth=recovery`.
- Redirect URLs cho production: `https://YOUR_APP.onrender.com/` và `https://YOUR_APP.onrender.com/?auth=recovery`.

Đặt `VITE_APP_URL` đúng origin đang dùng. Khi dùng Vite dev, đặt URL cổng 5173; khi dùng MCP server local, đặt cổng 8787. Không dùng wildcard rộng cho production. Luồng email dùng PKCE: mở email trên chính trình duyệt đã gửi yêu cầu để có code verifier. Đăng nhập bằng email/password vẫn sử dụng được trên thiết bị khác. Nếu link hết hạn/khác trình duyệt, gửi yêu cầu reset mới tại thiết bị đó.

## 4. Cấu hình local

Copy `.env.example` thành `.env.local`, điền tại máy:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
VITE_APP_URL=http://127.0.0.1:8787
```

Không gửi mật khẩu hoặc secret vào chat. Hai giá trị Project URL và publishable key cần được nhập vào `.env.local` hoặc Render Environment. Vite nhúng các biến này khi build; thay đổi biến cần build lại.

```sh
npm ci
npm run build
npm run mcp
```

Mở http://127.0.0.1:8787. Không có cấu hình Supabase thì app tiếp tục học local như trước. Khi có cấu hình sẽ có đăng nhập/đăng ký và lựa chọn học không tài khoản. Tiến độ local không tự động gán cho tài khoản mới.

## 5. Render Free

Tạo Web Service từ repository GitHub hiện tại, runtime Node, dùng Node.js 22+.

- Build Command: `npm ci --include=dev && npm run build`
- Start Command: `npm run mcp`
- Health Check Path: `/health`
- Environment: ba biến `VITE_*` ở trên; `VITE_APP_URL` là URL HTTPS Render thực tế.

Render cung cấp `PORT`, server bind `0.0.0.0` khi có biến này. Không cần disk/database trên Render. Không lưu dữ liệu học trên filesystem server. Sleep/restart không xóa dữ liệu PostgreSQL hoặc hàng đợi trong trình duyệt. Free service có thể cold start; giao diện sẽ hiển thị lỗi/chờ và thử lại khi kết nối trở lại. Mã nguồn không tự đăng ký dịch vụ hoặc gói trả phí.

## 6. Quy tắc đồng bộ

Supabase là nguồn chính của tài khoản. Cache/queue có khóa riêng theo UUID người dùng; token do Supabase Auth SDK quản lý, không nằm trong queue. Khi đăng xuất, UI và manager của tài khoản cũ bị tháo; cache chưa gửi giữ nguyên trên máy để chính tài khoản đó đăng nhập lại. Không nên dùng thiết bị chung nếu không muốn giữ cache; backup/export có dữ liệu cá nhân, cần giữ riêng.

Mỗi operation có UUID. RPC transaction khóa theo người dùng, kiểm tra ledger, cập nhật dữ liệu và lưu ledger cùng transaction. Retry cùng ID không tạo phiên hoặc cộng XP lần nữa. Client không gửi XP đáng tin cậy: RPC so đáp án với lesson/question bank được quản trị nhập, kiểm tra mở khóa, tự tính XP, SRS và thống kê. Match/flashcard vẫn có phần tự đánh giá như bản gốc; đây không phải hệ thống thi có giám sát. Người dùng có kỹ năng vẫn có thể đọc đáp án học tập, nên không tuyên bố chống gian lận tuyệt đối. Giới hạn 1000 kết quả/ngày/tài khoản; thời điểm học offline được chấp nhận trong 365 ngày, không quá 5 phút tương lai.

- Note debounce khoảng 800 ms, giữ base trước chuỗi sửa. Khi server khác base, queue dừng để người dùng chọn bản local hoặc server; không tự đè ghi chú mới.
- Profile cập nhật theo từng trường. Task/từ khó cùng khóa dùng thao tác tới server sau cùng. SRS được áp dụng tuần tự khi RPC nhận, không thay cả map từ cache cũ.
- Phiên học hợp nhất bằng operation ID, không ghi đè lịch sử. Checkpoint giữ thứ tự đáp án đã xáo, màn hiện tại, kết quả và session ID; có nút tiếp tục sau reload/đổi thiết bị khi đã đồng bộ.
- Hai thiết bị học cùng một bài: checkpoint hiển thị bản server nhận sau cùng; các phiên hoàn thành khác ID vẫn được giữ riêng. Không hỗ trợ cùng chỉnh một checkpoint theo thời gian thực.
- Retry backoff 2–60 giây, chạy lại khi online/focus; không polling hoặc Realtime liên tục. Offline vẫn học được trong tab đang mở với giáo trình/cache có sẵn. Chưa có service worker để mở lại ứng dụng hoàn toàn khi không có mạng.
- XP lúc chưa đồng bộ là tạm tính; sau RPC sẽ hiển thị giá trị server. Không đóng/xóa storage khi còn trạng thái chờ, hoặc xuất backup có queue trước.

## 7. Chuyển dữ liệu LocalStorage cũ

Đăng nhập → Cài đặt → Chuyển tiến độ hiện tại lên tài khoản. Xem tên/XP/bài/phiên/từ ôn, xuất backup và xác nhận đây là dữ liệu của mình. Zod kiểm tra trước khi chuyển; JSON cũ giữ nguyên ở `hanzi-quest-v1`.

Server giữ một proposal theo hash nội dung, không tạo trùng khi retry. Tự động hợp nhất từ khó và ghi chú nếu server chưa có ghi chú. Thành tích/học sử/SRS/checklist cũ cần chủ project kiểm tra và duyệt vì phiên bản local không có bằng chứng đáp án đáng tin cậy.

Trong SQL Editor, quản trị xem proposal trước:

```sql
select id, user_id, status, data_json from public.legacy_imports order by created_at desc;
-- Sau khi kiểm tra danh tính và nội dung, thay UUID proposal cần duyệt:
select public.approve_legacy_import('UUID_PROPOSAL');
```

RPC duyệt chỉ chạy bằng quản trị SQL, không cấp quyền cho người học. Duyệt lại không cộng lại điểm. XP được tính từ từng history entry hợp lệ (tối đa 40/entry), không tin tổng `xp` trong JSON. Lịch sử trùng được nhận dạng bằng hash nội dung và vị trí; bản local có lịch sử không đầy đủ/đã sắp xếp lại cần quản trị xem xét trước khi duyệt. Bài không có trong giáo trình hiện tại bị bỏ qua khi nhập, nhưng vẫn còn trong proposal/backup. Không ghi đè SRS đã được ôn trên tài khoản hoặc ghi chú mới. Sau duyệt, tải lại app để nhận bản hợp nhất; chỉ xóa backup local khi đã kiểm tra đủ dữ liệu.

## 8. Bổ sung giáo trình sau này

Bản bàn giao giữ nguyên nội dung 10 bài mẫu. `src/data.ts` là nguồn mẫu cho chế độ local/MCP công khai; migration 002 là bản xuất tương ứng để seed Supabase. Với tài khoản, UI tải lesson đã xuất bản từ PostgreSQL một lần khi mở phiên, kiểm tra Zod và cache. Không trộn lesson DB với bản local cũ.

Không sửa lesson ID khi đã có người học. Để bổ sung, chuẩn bị JSON theo schema Lesson hiện tại:

```json
{
  "courseId": "hsk-future",
  "version": "v1",
  "title": "Giáo trình tương lai",
  "lessons": []
}
```

Mảng lessons phải có nội dung hợp lệ, không rỗng, ID ổn định và duy nhất. Dùng script để tạo SQL, kiểm tra diff rồi quản trị chạy:

```sh
npx tsx scripts/export-curriculum.ts curriculum.json supabase/migrations/YYYYMMDDHHMM_curriculum.sql
```

Script escape SQL literal, validate Zod, upsert nội dung và đáp án trong một transaction. Không chạy import từ frontend, không nhận SQL tùy ý từ người học. Để thêm course sau course mẫu, đặt `courses.sort_order` phù hợp trong migration và giữ các lesson mẫu `hello`, `tones`, `hsk1` vì các chế độ ôn cơ bản tham chiếu chúng. Danh sách/chỉ số bài trong UI theo dữ liệu, không cần thêm component cho mỗi bài. Chưa có CMS, phân trang hoặc tải từng lesson; hàng trăm bài được đọc một lần khi mở phiên. Tối ưu tải theo course là bước tiếp theo nếu giáo trình lớn; MCP tool công khai vẫn dùng bài mẫu đóng gói, không tự quảng bá giáo trình mới trên DB.

Kiểm tra seed còn khớp nguồn mẫu:

```sh
npx tsx scripts/export-curriculum.ts --sample sample-check.sql
# So sánh với migration 002, không commit sample-check.sql.
```

## 9. MCP Apps

MCP tools vẫn chỉ đọc giáo trình công khai, không nhận JWT hoặc dùng service_role đọc tiến độ. Auth trong iframe không lưu session và không coi tài khoản ChatGPT là tài khoản Supabase. Nút mở website dùng Apps SDK `openLink` để mở origin `VITE_APP_URL`; học/tài khoản tiếp tục ở website độc lập. Không gửi token qua URL hoặc `postMessage`. Luồng quay lại iframe với tài khoản đồng bộ chưa được triển khai; iframe vẫn học local riêng. CSP có Supabase origin nếu biến server tương ứng được cấu hình. Chưa kiểm thử Auth trong ChatGPT thật.

## 10. Kiểm tra và sao lưu

Nếu API `lessons` và `learning_snapshot` đều HTTP 200 nhưng app không mở, xem Console với tiền tố `[Hanzi Quest] curriculum`. Log chỉ chứa stage, thông điệp đã lọc credential và đường dẫn Zod của bài/trường lỗi; không chứa session hoặc response payload. Bản sửa production loại bỏ dynamic import sau khi tải giáo trình và tắt module preload cho HTML một file, xử lý lỗi `__VITE_PRELOAD__ is not defined`. Không chạy lại migrations hoặc xóa LocalStorage để xử lý lỗi JavaScript này. Sau Render deploy commit mới, tải lại trang; giữ nguyên cache tiến độ và hàng đợi.

```sh
npm test
npm run build
npm run mcp
npx tsx tests/mcp-smoke.ts
npx playwright test
npm audit
```

Auth mock E2E riêng: mở Vite ở cổng 5174 với `VITE_SUPABASE_URL=https://hanzi-qa.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_qa_placeholder`, `VITE_APP_URL=http://127.0.0.1:5174`, rồi chạy `npx playwright test --config playwright.auth.config.ts`. Toàn bộ request tới domain QA được chặn/mock; không dùng project thật. Không đưa cấu hình QA vào deploy.

Trên Supabase thật cần tự kiểm tra: đăng ký A/B và xác nhận email; reset bằng email thật; đăng nhập hai thiết bị; hoàn thành bài; gửi lại operation; B không SELECT/UPDATE dữ liệu A; offline/reconnect; note conflict; migration local; signout/signin; Render restart. Kiểm tra Security Advisor và policy sau migration. PGlite không thay thế kiểm thử GoTrue, PostgREST, SMTP, browser storage policy hoặc ChatGPT host thật.

Cài đặt có nút xuất JSON tài khoản và hàng đợi, không chứa token. Đây là backup cá nhân, chưa có giao diện import backup account tự động. Quản trị nên xuất database định kỳ bằng Supabase CLI/`pg_dump` theo tài liệu backup hiện tại; giữ dump ngoài Git, có mã hóa và kiểm tra restore trên project thử trước. Chỉ restore vào database đã sao lưu và đúng phiên bản migration; không restore đè production chưa kiểm tra. Bản SQL schema/seed trong Git không chứa dữ liệu người dùng.

Tài liệu chính thức: [Auth password](https://supabase.com/docs/guides/auth/passwords), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database functions](https://supabase.com/docs/guides/database/functions), [API keys](https://supabase.com/docs/guides/api/api-keys).
