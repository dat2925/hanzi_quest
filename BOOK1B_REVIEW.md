# Duyệt Bài 1B · Làm quen với Pinyin

Chỉ thêm `hanzione-b1-l01b`, prerequisite `hanzione-b1-l01a`. Bài 1A, 10 bài mẫu và các migration cũ được giữ nguyên. ZIP đã được giải nén và đọc đủ README, prompt, kịch bản, JSON và script. Tài liệu trong ZIP là nguồn biên soạn; việc thực hiện tuân theo yêu cầu người dùng, đặc biệt chỉ xem thử và không ghi production. Sách gốc được kịch bản nhắc tới không có trong ZIP nên chưa đối chiếu số trang sách.

## Mở bản xem thử

Sau khi Render deploy commit mới, vào **Hành trình → Bài 1B · Làm quen với Pinyin → Xem thử Bài 1B**. Không cần chạy SQL, hoàn thành 1A hay đăng nhập để duyệt bản kèm ứng dụng. Bản xem thử không lưu XP, checkpoint, tiến độ hay lịch ôn.

Khi đăng nhập, thẻ Bài 1B kiểm tra bản published thật trên Supabase. Nếu truy vấn không trả bài, chỉ ghi “Chưa có bản xuất bản hiển thị”, không suy đoán draft từ kết quả RLS. Lỗi và đang tải có trạng thái riêng cùng nút thử lại. Sau khi được duyệt và publish, thẻ chuyển sang Học ngay; phải hoàn thành 1A trước. Luồng **HanziOne · Quyển 1 → Bài 1 · Chào hỏi → Bài 1B** cũng dùng bài published, prerequisite và cơ chế đồng bộ hiện có.

## Nội dung cần duyệt

1. Pinyin, thanh mẫu, vận mẫu và dấu thanh, giải thích bằng tiếng Việt.
2. Khẩu hình b/p/m/f, a/o; thử giấy để phân biệt b ít bật hơi với p bật hơi mạnh.
3. Chỉ hai từ mới: 八 — bā — Tám; 马 — mǎ — Ngựa. Nghe thường/chậm bằng giọng Mandarin, ẩn Pinyin để tự đọc.
4. Sáu thẻ tự nhớ: chữ → nghĩa, nghĩa → chữ, chữ → Pinyin cho mỗi từ. Đáp án chỉ xuất hiện sau khi bấm lật thẻ.
5. Viết vào vở, che mẫu rồi viết từ trí nhớ, hiện mẫu để đối chiếu và tự kiểm tra checklist. Đã chuyển chữ/Pinyin mẫu ra khỏi đoạn hướng dẫn để nút che thực sự giấu mẫu.
6. Sáu câu từ nhận nghĩa, phân biệt bật hơi, nhận diện vận mẫu, nhận Pinyin tới ghép cặp. Tất cả có giải thích; chỉ hỏi nội dung đã dạy.
7. Ôn SRS qua cơ chế hiện tại. Tự đánh giá không cộng XP; kết quả kiểm tra học thật do server chấm. Ba hướng nhớ cùng dùng lịch của mỗi từ, chưa có ba lịch độc lập. Preview không tạo lịch.

## SQL thủ công — chỉ chạy sau khi duyệt

**Chưa chạy bất kỳ SQL nào trên Supabase production.** Hai file dùng importer hiện tại, transaction và khóa advisory. Kiểm thử SQL chỉ chạy trong PostgreSQL/PGlite cô lập.

1. `supabase/migrations/202610130002_book1_lesson1b_draft.sql`: thêm đúng một bài draft, đáp án server và prerequisite. Không update/delete bài hay tiến độ cũ; chương đang có cũng giữ metadata cũ.
2. `supabase/manual/book1_lesson1b_publish_after_review.sql`: chỉ chạy sau khi nội dung được duyệt; kiểm tra draft khớp bản đã kiểm thử rồi đổi trạng thái 1B, từ vựng mới và khả năng hiển thị khóa. Không chỉnh nội dung 1A.

Trước khi chạy, sao lưu theo quy trình của bạn và kiểm tra read-only trong SQL Editor:

```sql
select id, is_published,
       content_json->'learning' as learning
from public.lessons
where id in ('hanzione-b1-l01a', 'hanzione-b1-l01b');
```

So sánh `learning` của 1A với `references[0]` trong `curriculum/book1-lesson1b.json` (reference chỉ đổi status thành published). Chưa xác minh sự khớp này trên production. Cả hai SQL đều dừng bằng `REFERENCE_MISMATCH` nếu 1A chưa published hoặc khác reference; không bỏ guard hay ghi đè 1A. Nếu production khác, lấy bản learning thật để đối chiếu và xuất lại SQL trước khi triển khai.

Nếu `LESSON_ID_EXISTS_USE_NEW_REVISION`, đừng chạy lại import và đừng xóa hàng: kiểm tra bản draft hiện có. Nếu đã nhập đúng, dùng file publish riêng; nếu nội dung khác cần revision mới. `DRAFT_CONTENT_MISMATCH` có nghĩa bản lưu khác bản duyệt; dừng để đối chiếu. Sau lỗi transaction, rollback trước khi thực hiện bước khác.

Sau import, 1B phải là `false / draft`; sau publish là `true / published`, 7 màn, prerequisite 1A. Đăng nhập tài khoản đã hoàn thành 1A, tải lại Hành trình và học thật. Kiểm tra XP, hoàn thành bài và lịch ôn 八/马 sau reload.

**Metadata chương cần duyệt riêng:** chương cũ có mô tả “Chỉ Bài 1A đã được biên soạn để duyệt…”. Import cố ý không ghi đè metadata này. Đề xuất sau khi duyệt 1B đổi tên thành “Bài 1 · Chào hỏi và nhập môn Pinyin”, mô tả “Bài 1A: 你好. Bài 1B: b, p, m, f, a, o, 八, 马. Các bài còn lại sẽ biên soạn và duyệt sau.” Chưa tạo hoặc chạy cập nhật chương vì cần xác nhận metadata production và duyệt riêng.

## Validate, tái tạo và kiểm thử

Nguồn `curriculum/book1-lesson1b-base.json` đã chỉnh cách giấu Pinyin/mẫu viết từ bản cung cấp. `scripts/build-book1-lesson1b.mjs` đọc nguyên 1A trong repository, sao chép reference published, gắn prerequisite và từ chối ghi đè file đích. File kết quả `curriculum/book1-lesson1b.json` được kiểm tra bằng Zod. Khi biên tập lại, tạo revision/output mới thay vì xóa SQL đã chạy.

```powershell
npm run curriculum -- curriculum/book1-lesson1b.json --validate
npm test
npm run build
# Sau npm run mcp:
npx playwright test
npx tsx tests/mcp-smoke.ts
# Dev server QA dùng thông tin giả, không dùng production:
npx playwright test --config playwright.auth.config.ts
```

Tests bao phủ thứ tự dạy, sáu câu hỏi/khóa đáp án, sáu thẻ tự nhớ, kiến thức chưa dạy, Pinyin, prerequisite client/server, RLS draft, publish đúng nội dung, retry không nhân đôi XP, SRS hai từ, giữ dữ liệu 5 tài khoản và bài cũ. Playwright kiểm tra mobile 390px/desktop 1440px, che đáp án/mẫu, lỗi bật hơi, ghép cặp, điểm 5/6 và preview không lưu; trạng thái đăng nhập draft/published/loading/error và chọn khóa → chương → bài được mock trên miền QA.

Kết quả ngày 13/10/2026: validate JSON đạt; 34 unit/PostgreSQL tests, 27 E2E giao diện, 8 E2E CourseBrowser đăng nhập và 1 E2E Auth mock + RPC PostgreSQL thật đều đạt. Build TypeScript/Vite và MCP smoke đạt. Lần chạy E2E đầu tiên báo connection refused vì server local chưa bật; đã bật server, chạy lại toàn bộ 27 test và tất cả đạt.

Giới hạn: chưa có audio bản thu đã kiểm chứng cho riêng b/p/m/f/a/o; hướng dẫn khẩu hình và thử giấy là phần hỗ trợ hiện tại. Chỉ phát chữ Hán bằng giọng Mandarin có trên thiết bị; không dùng giọng Anh thay thế. Nếu thiết bị thiếu giọng Mandarin, ứng dụng báo rõ. Chưa chấm phát âm hoặc thứ tự nét. Các kiểm thử không xác nhận trạng thái Supabase production hay việc Render đã deploy xong.
