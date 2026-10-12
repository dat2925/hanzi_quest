# Duyệt Bài 1A · 你好 – Xin chào

Chỉ triển khai **Bài 1A**, chưa tạo 14 bài còn lại. ZIP đã được giải nén và đọc gồm README, prompt, kịch bản, JSON cũ, CSV mục lục và PDF tổng hợp 3 trang. Các bản gốc dạng văn bản nằm trong `curriculum/source/book1/`. Đây là tài liệu đầu vào, không phải chỉ dẫn vận hành của repository. Người dùng đã yêu cầu thực hiện nội dung prompt, với giới hạn không sửa production.

ZIP không chứa sách gốc `Han 1 TV.pdf`; các tham chiếu trang sách trong tài liệu chưa được đối chiếu với sách gốc. Nội dung giao diện được biên soạn lại từ kịch bản được cung cấp; không sao chép bài khóa dài.

## Kiểm tra ngay, không cần SQL

Sau khi Render deploy, mở **Hành trình → Bài 1A · 你好 – Xin chào**. Khi đã đăng nhập và Supabase trả về bài đã xuất bản, bấm **Học ngay** để học thật và lưu XP/tiến độ/SRS bằng cơ chế đồng bộ hiện có. Có thể chọn **HanziOne · Quyển 1 → Bài 1 · Chào hỏi → Học ngay** ngay trong danh sách bài của chương, không cần tìm lại bài ở lộ trình bên dưới.

Nếu chưa có bản xuất bản hiển thị, ứng dụng cung cấp **Xem thử Bài 1A** từ bản nội dung kèm ứng dụng, không lưu tiến độ. RLS không cho học viên đọc draft nên kết quả rỗng không khẳng định bài đang draft. Lỗi hoặc truy vấn chưa xong được hiển thị riêng, không kết luận “đang chờ duyệt” và không mở bài từ cache thay cho kết quả truy vấn. Có nút tải lại trạng thái. Bản không đăng nhập được ghi rõ chưa kiểm tra Supabase. Bản sửa trạng thái giao diện không cần migration hoặc sửa dữ liệu production.

Đi hết 7 màn trên điện thoại và máy tính:

1. Mục tiêu, tình huống gặp bạn mới, chữ Hán và Pinyin là gì.
2. Ba mục từ: 你, 好, 你好; nghe thường/chậm và ẩn Pinyin.
3. Nghe nói, thanh 3 và biến điệu khi hai thanh 3 đi liền nhau.
4. Năm hướng tự nhớ. Đáp án không nằm trong DOM trước khi lật thẻ; phải thử nhớ và tự đánh giá mới tiếp tục.
5. Viết vào vở, che mẫu và tự đối chiếu. Ô viết không chấm nét tự động.
6. Năm hoạt động: nghĩa, đại từ, Pinyin, xếp lời chào, ghép cặp. Sai có giải thích. Dưới 70% phải tự nhớ lại trước khi kết thúc; luyện lại không sửa điểm kiểm tra.
7. Lịch ôn và xem lại lỗi. Khi luyện nhớ lại, phần đáp án lỗi được che để không gợi đáp án.

Preview không lưu tiến độ, checkpoint, XP hoặc lịch ôn. Không cần chạy migration để xem thử. Chỉ sau khi duyệt mới nhập hoặc xuất bản trên Supabase.

Nghe dùng giọng Mandarin `zh-CN`, `zh-SG`, `zh-Hans` hoặc `cmn` của thiết bị, bỏ qua Cantonese `zh-HK`. Nếu chưa có giọng phù hợp, ứng dụng thông báo rõ; không chuyển sang tiếng Anh. Giọng TTS và tốc độ chậm phụ thuộc trình duyệt/giọng hệ điều hành; chưa có audio thu âm hay chấm phát âm.

## Các lựa chọn nội dung và SRS

- JSON đầu vào cũ được giữ nguyên làm nguồn; bản chạy dùng `curriculum/book1-lesson1a.json` theo schema v2.
- Nghĩa của 你 được chuẩn hóa thành “Bạn” để khớp vocabulary hiện có, phần đại từ được giải thích trong bài.
- Đổi lựa chọn nhiễu thành nội dung đã dạy: Bạn/Tốt/Xin chào và nǐ/hǎo/nǐ hǎo. Không yêu cầu nhận ra cách đọc sai chưa được giải thích.
- Năm thẻ là năm hướng tự nhớ, dùng chung **ba lịch ôn theo từ** để tương thích dữ liệu hiện có. Không có năm lịch độc lập. Một hướng quên làm từ đó ôn sớm.
- Kiểm tra do RPC chấm theo `private.question_bank`. Tự nhớ dùng operation `review` hiện có, không cấp XP, không mở khóa bài. Câu sai hoặc tự đánh giá chưa nhớ hẹn 10 phút; lần đầu nhớ hẹn 1 ngày, sau đó nhân đôi đến tối đa 30 ngày. Từ đã có lịch từ bài mẫu tiếp tục lịch hiện tại.
- **Luyện tập → Tự nhớ bài đã học** hiển thị các bài đã tải có thẻ tự nhớ và từ đã ôn; đánh dấu từ đến hạn, hỗ trợ đủ năm hướng của 1A. Có thể cần chọn khóa/chương Quyển 1 trong Hành trình để tải bài sau khi xuất bản.

## SQL chỉ chạy thủ công khi đã duyệt

Không có thao tác kết nối hay ghi production trong lần phát triển này. Test cơ sở dữ liệu dùng PostgreSQL PGlite cô lập với 5 tài khoản giả lập.

Điều kiện: production đã chạy `202610120001_schema.sql`, `202610120002_sample_content.sql`, `202610120003_legacy_approval.sql`, `202610120004_learning_structure.sql`. Không chạy lại các migration đã chạy. Demo `202610120005_beginner_demo.sql` không phải điều kiện để nhập Bài 1A; không chạy lại nếu đã tồn tại.

Sau khi sao lưu, dùng Supabase SQL Editor với quyền quản trị:

1. Chạy **`supabase/migrations/202610130001_book1_lesson1a_draft.sql`** đúng một lần. File thêm khóa/chương/bài ở trạng thái draft, nối thứ tự ở cuối; không sửa 10 bài mẫu hoặc bảng tiến độ. Draft bị RLS ẩn khỏi người học; duyệt qua preview trình duyệt ở trên.
2. Kiểm tra bằng câu SELECT dưới đây. Khi đã hài lòng, chủ động chạy **`supabase/manual/book1_lesson1a_publish_after_review.sql`**. File này cố ý nằm ngoài thư mục migrations để không tự xuất bản; chỉ nâng draft có nội dung khớp hoàn toàn thành published.
3. Reload trang, chọn khóa **HanziOne · Quyển 1**, tải chương **Bài 1 · Chào hỏi**, học và lưu kết quả bằng tài khoản thử. Bài 1A không yêu cầu hoàn thành bài mẫu trước.

```sql
select l.id, l.is_published, l.content_json->'learning'->>'status' as status,
       c.id as course_id, c.sort_order as course_order,
       jsonb_array_length(l.content_json->'learning'->'screens') as screens
from public.lessons l
join public.units u on u.id=l.unit_id
join public.courses c on c.id=u.course_id
where l.id='hanzione-b1-l01a';
```

Sau bước 1: `false / draft / 7`; sau bước 2: `true / published / 7`.

Nếu gặp `LESSON_ID_EXISTS_USE_NEW_REVISION`, không xóa bài hoặc bỏ guard. SELECT kiểm tra ID trên: nếu draft đã nhập đúng, chuyển sang file publish; nếu nội dung khác, cần biên soạn revision với ID mới. Toàn transaction import rollback khi có xung đột. Publish báo `DRAFT_CONTENT_MISMATCH` khi bản lưu không khớp bản đã kiểm thử.

## Biên soạn bài tiếp theo

Kiểm thử đã chạy: 33 test đơn vị/PostgreSQL; 25 test giao diện mobile/desktop; một luồng Auth mock kết hợp RPC PostgreSQL thật kiểm tra cả Bài 1A (tiếp tục thẻ sau reload, điểm 5/5, lịch ôn từ quên, cách ly tài khoản); build TypeScript/Vite và MCP smoke. Đây là kiểm thử cô lập, không xác nhận tình trạng dữ liệu hoặc triển khai Supabase production.

Schema bổ sung `theory` trên màn nội dung, `recall.cards` có `answerType`, và `assessment.items` có ID ổn định/phase/knowledge. Bài cũ vẫn đọc nguyên cấu trúc; v2 cũ vẫn dùng `exercise` từng màn như trước. Zod kiểm tra prerequisite, kiến thức đã dạy, đáp án tự nhớ khớp vocabulary, Pinyin, thanh điệu, ID trùng và đáp án câu hỏi.

```powershell
npm run curriculum -- curriculum/book1-lesson1a.json --validate
npm run curriculum -- curriculum/book1-lesson1a.json --draft-sql artifacts/new-draft.sql
```

Để tạo publish cho nội dung đã duyệt, sao chép JSON, đặt `status` khóa và bài thành `published`, rồi chạy `--promote-sql artifacts/publish.sql`. Không sửa JSON draft chỉ để mở preview; không chạy SQL tự động. Exporter bài mẫu `scripts/export-curriculum.ts --sample output.sql` nay mặc định draft; chỉ xuất published khi truyền thêm `--publish-sample`, và luôn giữ các hàng đã tồn tại.
