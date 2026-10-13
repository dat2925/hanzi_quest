# Admin Curriculum — nhập 5–10 bài trong một lần

## Trạng thái và phạm vi

Repository hiện có 1A, 1B và **1C draft kèm ứng dụng**; 1C có SQL draft/publish thủ công từ commit `480e560`. Trạng thái published trên production không thể kết luận từ Git. Trang Admin đọc cờ `is_published` thực từ Supabase. Đã giữ nguyên JSON, ID, SQL cũ, 10 bài mẫu và cơ chế XP/SRS. Chưa chạy bất kỳ SQL/cấu hình hoặc ghi dữ liệu nào lên production trong lần triển khai này.

Hệ thống mới có quản lý khóa/chương/bài, editor JSON từng bài, nhập lô, validate server bằng Zod v2, tự giải prerequisite và sắp bài, xem thử 7 màn, duyệt đúng revision, xác nhận xuất bản lô, và trạng thái draft/published thật. Mỗi file thuộc một khóa/phiên bản, khuyến nghị 5–10 bài, giới hạn 20 bài/4 MB. Khóa bài mẫu chỉ đọc. Bài đã published không chỉnh sửa; sửa bằng ID revision mới để giữ lịch sử.

Không có nguồn cho bài 1D trở đi trong yêu cầu này. Lô 5 bài `qa-book1-next-*` chỉ là fixture kiểm thử, tái dùng nội dung 1C để kiểm tra kỹ thuật, không phải giáo trình mới và không được nhập production. Chưa tạo hay xuất bản 76 bài.

## Bật hệ thống một lần — thao tác thủ công sau khi kiểm tra

1. Kiểm tra/backup theo quy trình của bạn. Chạy `supabase/migrations/202610130004_curriculum_admin.sql` nếu chưa cài Admin, sau đó chạy `supabase/migrations/202610130005_curriculum_practice_key_compatibility.sql`. Nếu đã cài Admin, chỉ chạy file `005` mới. **Không chạy lại các migration 1A/1B/1C hoặc toàn bộ thư mục.** Các migration này độc lập với việc 1C đã publish hay chưa; cần schema/learning_structure hiện đang phục vụ 1A/1B.
2. Xác định đúng tài khoản quản trị bằng `auth.users.id` trong Supabase. Trong `supabase/manual/grant_curriculum_admin_after_review.sql`, thay UUID toàn số 0 bằng UUID tài khoản đó rồi chạy. File cố ý từ chối UUID không tồn tại. Không dựa vào email/user_metadata để cấp quyền; người dùng không thể tự nâng quyền bằng chỉnh hồ sơ.
3. Trên **Render Node service**, giữ các biến public hiện tại `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL` (URL website thật). Thêm **server-only** `SUPABASE_SECRET_KEY` từ Supabase hoặc `SUPABASE_SERVICE_ROLE_KEY`. Có thể đặt `SUPABASE_URL` riêng, nếu không dùng URL public hiện có. Tuyệt đối không thêm tiền tố `VITE_` vào secret, không dán secret vào JSON/frontend, Git hoặc chat. Render vẫn chạy `npm run build` rồi `npm run mcp`; API admin được phục vụ cùng origin trên Node server.
4. Deploy bản hệ thống mới, đăng nhập tài khoản vừa cấp quyền, vào **Cài đặt → Admin Curriculum**. Có thể mở URL website với `?admin=curriculum`; backend vẫn kiểm tra quyền. Nếu thiếu migration/secret sẽ báo cấu hình thiếu, không tự cấp quyền. Bản website host tĩnh không có Node API này.

Để thu hồi quyền, operator chạy thủ công `delete from public.curriculum_admins where user_id='UUID_CẦN_THU_HỒI';`. API/database kiểm tra lại quyền ở mỗi yêu cầu. Không có chức năng để học viên/admin tự cấp quyền qua frontend.

### Sửa lỗi `QUESTION_KEY_CONFLICT` với câu ôn 你好

Dữ liệu mẫu cũ gắn câu ôn nghĩa/Pinyin của `你好` với các mục SRS `你好`, `你`, `好`; importer v2 tạo mục tiêu duy nhất `你好`. Migration `202610130005_curriculum_practice_key_compatibility.sql` cho phép tái sử dụng nguyên câu ôn tự sinh có cùng khóa, loại, lời hỏi, audio và đáp án, dù danh sách mục tiêu khác nhau. Không cập nhật ngân hàng câu hỏi cũ, bài đã xuất bản hay dữ liệu người học. Câu kiểm tra có `contentId` vẫn áp dụng kiểm tra nghiêm ngặt; đáp án khác vẫn bị chặn và giao dịch rollback.

Sau khi kiểm tra và chạy riêng file `005` bằng SQL Editor, tải lại Admin, chọn các bản nháp đã duyệt rồi thử **Chuẩn bị xuất bản → Xác nhận xuất bản**. Không cần xóa/nhập lại bài, đổi ID hay chạy lại migration Admin `004`. Bản sửa chưa được thực thi trên production bởi Codex. Test hồi quy dùng database cô lập tái hiện chính khóa `你好` cũ, kiểm tra đáp án khác bị chặn và ngân hàng câu hỏi/bài cũ được giữ nguyên.

### Lỗi `VOCABULARY_CONFLICT_REVIEW_READING_AND_MEANING`

Kho từ vựng dùng chữ Hán làm ID chung. Nếu bài mới dùng cùng chữ nhưng khác nghĩa hoặc cách đọc, lô bị chặn. Backend kiểm tra khi duyệt/xuất bản và báo tên bài, chữ Hán, Pinyin/nghĩa hiện tại và bản mới; sửa bản nháp theo nguồn đã đối chiếu rồi lưu và duyệt lại.

Các khác biệt chỉ do khoảng trắng trong Pinyin (ví dụ `zài jiàn` và `zàijiàn`) được backend đồng nhất với cách ghi hiện có cho từ vựng biên dịch và câu luyện SRS tự sinh. Nội dung giảng dạy vẫn giữ Pinyin tách âm tiết để qua validator. Nghĩa khác (`Tôi, mình` và `Tôi`) hoặc dấu thanh khác vẫn bị chặn. Không cập nhật kho từ vựng/ngân hàng câu hỏi cũ. Thay đổi này cần triển khai backend mới, không cần migration SQL; chưa được chạy trên production bởi Codex.

### Quyền và an toàn

Frontend chỉ giữ publishable key và JWT người đăng nhập. Node xác minh JWT qua Supabase Auth, kiểm tra `curriculum_admin_access`, rồi dùng secret server gọi RPC. Database kiểm tra membership lần nữa. Các RPC ghi/đọc draft chỉ được grant cho `service_role`; kể cả admin đang đăng nhập bằng role authenticated cũng không được gọi trực tiếp hoặc ghi bảng. Ba bảng mới bật RLS, không có policy/grant cho trình duyệt. Không nới RLS hoặc grant ghi trên bảng học viên hiện có.

Draft được lưu trong `curriculum_drafts`, không ở luồng học thật. Chỉ publish mới đưa vào lessons/vocabulary/question_bank. SQL draft cũ chưa published có thể đưa vào biên tập bằng **Sửa nháp → kiểm tra → lưu**; chỉ cho phép khi chưa có tiến độ, checkpoint, phiên học, ghi chú hay nhiệm vụ viết tham chiếu. Published và 10 bài mẫu luôn bị khóa. Nội dung/reference/chương/phiên bản không khớp sẽ dừng giao dịch.

Mọi lô save/review/publish là một transaction, dùng cùng advisory lock với importer SQL. Mã yêu cầu + hash + actor/action lưu riêng để retry không tạo bản trùng. Gửi lại mã cũ với nội dung khác bị chặn. Frontend giữ mã trong phiên trang; sau reload, thao tác nhập lặp bằng mã mới bị chặn bởi lesson ID/revision, không nhân đôi. Hai biên tập viên cùng sửa: revision cũ bị từ chối. Sửa draft sẽ hủy duyệt; publish chỉ nhận đúng nội dung/revision đã duyệt. Các prerequisite ngoài lô phải published, hoặc chọn cả chuỗi đã duyệt để publish cùng lần.

## Quy trình đơn giản nhất cho mỗi lô 5–10 bài

1. **Biên soạn từ nguồn:** cung cấp tài liệu, phạm vi và bảng chữ/Pinyin/nghĩa đã kiểm tra cho người biên soạn hoặc công cụ hỗ trợ. Dùng `curriculum/templates/AUTHOR_BATCH_PROMPT.md` và một JSON v2 chứa nhiều lessons. Không cần sửa React hoặc dùng Codex deploy từng bài. Hệ thống không tự OCR hay tự sinh bài có căn cứ ngôn ngữ; scan cần người kiểm tra ảnh gốc. Mỗi bài đúng 7 màn, ít từ mới và chỉ hỏi điều đã dạy.
2. **Nhập/kiểm tra:** đăng nhập Admin, chọn khóa, chọn file JSON, bấm **Kiểm tra toàn bộ JSON**. Backend dùng lại `validateBundle`, `compileBundle`, `questionKey` và `assessedWords` của importer/XP hiện tại. References của prerequisite được tải/đối chiếu từ DB; thứ tự nhập lộn vẫn sắp prerequisite trước. Lỗi ID/Pinyin/tone/knowledge/đáp án/vòng lặp hiển thị trong trang. Placeholder/OCR chưa đối chiếu bị từ chối.
3. **Xem thử và lưu:** xem thử từng bài đủ 7 màn; sửa JSON nếu cần, validate lại rồi **Lưu lô bản nháp**. Preview không lưu XP, checkpoint hay SRS. Draft vừa lưu chỉ admin thấy. Có thể chọn **Sửa nháp** cho từng bài; ID giữ nguyên trong vùng draft, published phải ID mới.
4. **Duyệt:** chọn các draft cần duyệt, đối chiếu nguồn/Hanzi/Pinyin/nghĩa/quyền sử dụng và xem thử, tích hai checklist, bấm **Duyệt các bản nháp đã chọn**. Checklist là xác nhận của người duyệt, không phải bằng chứng OCR/phát âm đã được máy chấm.
5. **Xuất bản:** chọn các bài đã duyệt, bấm **Chuẩn bị xuất bản**, đọc danh sách và **Xác nhận xuất bản lô đã duyệt**. Sau đó mở Hành trình, chọn khóa → chương → bài. Ứng dụng tải các bài published từ Supabase; **không cần chỉnh code, build/deploy Render hay tạo SQL cho từng lô nữa**. Prerequisite và XP/SRS tiếp tục được server chấm như hiện tại.

Với Quyển 1: kiểm tra trạng thái 1C thực trong Admin trước khi chọn nó làm prerequisite của các bài tiếp theo. Nếu chưa có 1C trên Supabase, nhập `curriculum/book1-lesson1c.json` như một draft; nếu đã có SQL draft thì dùng Sửa nháp để nhận vào vùng biên tập. Chỉ publish 1C sau khi bạn duyệt, không giả định nó đã published.

### Tạo khung 5–10 bài tùy chọn

Nút **Tạo bản nháp / lô mới** tạo khung 7 màn cố ý chưa đủ dữ liệu. Có thể tạo cả lô bằng manifest và CLI (không gọi Supabase):

```powershell
npx tsx scripts/scaffold-curriculum-batch.ts artifacts/manifest.json artifacts/new-batch.json
```

Manifest gồm metadata curriculum, 5–10 lesson ID/title/chapter/prerequisites và source cho từng bài. Ví dụ cấu trúc một phần tử (cần 5–10 phần tử thật):

```json
{
  "courseId": "hanzione-book1-preview",
  "title": "HanziOne · Quyển 1",
  "syllabus": { "family": "foundation", "version": "book1-preview-v1" },
  "chapters": [{ "id": "hanzione-b1-ch01", "title": "Bài 1", "description": "Phạm vi từ nguồn đã duyệt" }],
  "lessons": [{
    "id": "lesson-id-moi-tu-ke-hoach",
    "title": "Tên bài từ tài liệu thật",
    "chapterId": "hanzione-b1-ch01",
    "prerequisites": ["hanzione-b1-l01c"],
    "source": { "file": "source.md", "location": "Đoạn/trang đã phân công", "scanned": false }
  }]
}
```

Source path tính từ thư mục manifest và phải tồn tại. CLI tạo `new-batch.json` + `new-batch.json.review.json`, không ghi đè file, không tự sinh chữ/từ/câu hỏi. Khung cố ý chưa qua validator; phải điền nguồn, đối chiếu OCR và hoàn thiện trước khi nhập. Không commit nguyên sách có bản quyền. Với offline JSON đã có references đầy đủ, importer SQL/Zod cũ vẫn dùng được:

```powershell
npm run curriculum -- artifacts/new-batch.json --validate
```

Trong Admin có thể bỏ `references` và để backend giải quyết từ DB. Hiện backend giải references trong khóa đã chọn; dependency sang khóa khác cần workflow mở rộng riêng, không tự coi các phiên bản HSK là cùng nội dung.

## Giới hạn và kiểm thử

Editor hiện là JSON có validate/xem thử, chưa có trình soạn văn bản kéo thả, OCR tự động, lưu nháp offline hoặc thay đổi nội dung published tại chỗ. Không có auto-publish; chưa triển khai hạn mức/nhiệm vụ AI tự viết bài. Audio và nét viết dùng khả năng hiện có, không giả vờ chấm phát âm.

Kiểm thử bao gồm API Node thật + PostgreSQL/PGlite cô lập với 5 tài khoản, published 1A/1B/1C fixture, lô 5 bài QA (đảo thứ tự), ID/prerequisite/Pinyin sai, RLS/grant, member/anonymous bị chặn, revision stale, hủy duyệt khi sửa, prerequisite chưa published, transaction rollback, retry idempotent, published immutable, giữ các bài cũ/tiến độ và chấm XP bài mới. Playwright chạy luồng Admin/preview/duyệt/publish/Hành trình trên mobile 390px và desktop 1440px qua backend thật và DB cô lập; không dùng production. Chỉ fixture mới publish 1C để thử, không phải kết luận trạng thái production.

Chạy `npm test`, `npm run build`, `npx playwright test`, `npx playwright test --config playwright.auth.config.ts`, `npx tsx tests/mcp-smoke.ts` theo cấu hình local trong README. Kết quả thực tế được ghi trong báo cáo bàn giao; thao tác production ở trên do bạn kiểm tra/chạy thủ công.

Kết quả ngày 13/10/2026: **39 unit/API/PostgreSQL tests**, **30 E2E giao diện học**, **16 E2E tài khoản/Admin** (gồm 3 test Admin qua API/DB thật cô lập trên mobile/desktop) đạt; build và MCP smoke đạt. Một test QA production-build riêng được skip do không cấu hình `AUTH_E2E_URL`. Đã build với secret canary chỉ trên server và xác nhận giá trị không có trong HTML frontend. Lượt chạy song song ban đầu gặp server local cũ dừng và timeout; đã chạy lại 30 test trên server mới, chạy lại test lỗi tải trạng thái và luồng Auth nhiều thiết bị thành công. Test Auth được tăng thời hạn 120 → 180 giây, giữ nguyên toàn bộ assertions (thực chạy khoảng 2,1 phút). Không kiểm thử trực tiếp dữ liệu hoặc deployment production.
