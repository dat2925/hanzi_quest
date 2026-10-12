# Giáo trình tương tác

Bài 1A Quyển 1 dùng `curriculum/book1-lesson1a.json`: 7 màn, draft, xem thử ngay trong Hành trình. Quy trình duyệt và SQL thủ công tại [BOOK1_REVIEW.md](BOOK1_REVIEW.md).

Nguồn demo: `curriculum/beginner.json`. Chỉ có **một bài mới**, 17 màn, hai từ 一 và 二. Nội dung được viết riêng, không trích giáo trình có bản quyền. Tám chương là khung chờ biên soạn, không phải giáo trình HSK đầy đủ.

## Mô hình nội dung

`Bundle → khóa và phiên bản → chương → bài → màn học`.

- `syllabus.family`: `foundation` hoặc `HSK`; `version` bắt buộc; HSK cần `level`. Dùng **courseId và version riêng** cho mỗi giáo trình. Hệ thống không coi nội dung HSK cũ và mới tương đương. Nhãn HSK trong khung nhập môn chỉ là vị trí dự kiến; tạo khóa HSK riêng khi có tài liệu thật.
- Bài: `schemaVersion: 2`, ID ổn định, `chapterId`, `title`, `description`, `minutes`, `difficulty: 1..10`, `status: draft|published`, `prerequisites: lessonId[]`, `screens`.
- Màn: ID duy nhất trong bài, `kind`, `title`, `body` tiếng Việt; tùy chọn `steps`, `examples`, `image: {url,alt}`, `audioUrl`. Media dùng HTTPS; ví dụ có `hanzi`, `pinyin`, `meaning`.
- Loại màn: `objective`, `explanation`, `vocabulary`, `pronunciation`, `exercise`, `notebook`, `review`, `srs`. Màn phát âm có `speech` để dùng giọng thiết bị. Màn viết có `checklist` tự đối chiếu. Các màn có thể lặp lại để giảng từng phần nhỏ, xen bài tập ngay sau lý thuyết.
- Bài từ 7 màn trở lên. `theory` có thể đặt cùng màn mục tiêu để giảng lý thuyết. `recall.cards` gồm ID, prompt, answer, answerType (meaning/hanzi/pinyin), hint, hanzi, knowledge; đáp án phải khớp từ đã dạy. `assessment.items` gom nhiều bài tập trong một màn, mỗi item có ID, phase và question; từng câu vẫn có khóa riêng cho RPC chấm điểm. Tự đánh giá không cấp XP.
- Từ mới có `hanzi`, `pinyin`, `meaning`, `tones` (0 là thanh nhẹ, 1..4 là bốn thanh), `example`. Tách âm tiết Pinyin bằng khoảng trắng; dùng dấu thanh khớp `tones` và số chữ.
- Màn giảng khai báo `introduces: knowledgeId[]`; câu hỏi khai báo `knowledge`. Kiến thức phải được giới thiệu ở màn trước hoặc trong prerequisite. Câu hỏi không tự giới thiệu kiến thức. Chữ Hán trong câu hỏi, lựa chọn và audio phải được giới thiệu qua từ vựng.
- Bài tập có `phase: practice|application|final`. Câu hỏi cần `type`, `prompt`, `options`, `answer`, `explanation`, `hint`, `knowledge`; câu nghe cần `audio` là văn bản tiếng Trung. Các type: `quiz`, `listen`, `sentence`, `match`, `tone`. Ghép cặp dùng `chữ|nghĩa`, đáp án `matched`; xếp câu có đáp án là chuỗi token.
- Bắt buộc có mục tiêu, giải thích, từ vựng, phát âm, nhiệm vụ vở, ứng dụng, kiểm tra cuối bài và SRS ở cuối.

Zod kiểm tra kiểu, giá trị, URL, câu hỏi và cấu trúc. Bộ kiểm tra bổ sung đối chiếu ID trùng, prerequisite thiếu/vòng lặp, đáp án, cặp ghép, dấu thanh, chữ chưa dạy và knowledge ID. Kiểm tra Pinyin là kiểm tra chính tả cơ bản, **không thay thế biên tập viên tiếng Trung**. Cần duyệt ngữ nghĩa, ví dụ, phát âm và việc câu hỏi thực sự chỉ yêu cầu kiến thức đã dạy.

## Nhập và xuất bản

Không cần service-role key trong trình duyệt. Công cụ tạo SQL để quản trị viên kiểm tra rồi chạy bằng Supabase SQL Editor hoặc quy trình migrations.

1. Biên soạn JSON theo demo, dùng ID mới và trạng thái `draft`.
2. Validate:

```sh
npm run curriculum -- curriculum/my-course.json --validate
```

3. Vào **Hành trình → Xem trước giáo trình JSON**, chọn file (tối đa 2 MB) và thử từng bài. File chỉ được đọc trong trình duyệt; không ghi tiến độ, XP, SRS hoặc checkpoint.
4. Tạo SQL lưu draft:

```sh
npm run curriculum -- curriculum/my-course.json --draft-sql supabase/migrations/NEW_TIMESTAMP_course_draft.sql
```

5. Sau khi duyệt, đặt trạng thái khóa và các bài được duyệt thành `published`. Nếu đã chạy draft SQL, tạo promotion:

```sh
npm run curriculum -- curriculum/my-course.json --promote-sql supabase/migrations/NEW_TIMESTAMP_course_publish.sql
```

Promotion đối chiếu nội dung database với JSON, bỏ qua duy nhất trạng thái. Chỉ nội dung khớp hoàn toàn mới được xuất bản; nội dung đã sửa gây `DRAFT_CONTENT_MISMATCH`. Tạo revision với ID bài mới để giữ lịch sử. Chưa có trình sửa draft tại chỗ.

Nếu chưa nhập draft vào database, có thể xuất SQL published trực tiếp:

```sh
npm run curriculum -- curriculum/my-course.json --publish-sql supabase/migrations/NEW_TIMESTAMP_course.sql
```

**Không chạy cả draft-sql và publish-sql cho cùng bài**; sau draft dùng promote-sql. Import chỉ thêm bài mới, không ghi đè bài hiện có. Trùng ID sẽ rollback transaction. Công cụ từ chối ghi đè file SQL output. Không sửa migration đã chạy trên production. Exporter cũ chỉ còn xuất bản sao bài mẫu với `on conflict do nothing`.

## Thêm bài vào khóa hiện có

Đưa bài mới vào `lessons`. Đưa nội dung đầy đủ của prerequisite đã xuất bản vào `references`, gồm các tổ tiên nếu có. Reference không được ghi lại: SQL xác nhận `content_json.learning` và trạng thái published khớp database. Không đưa bài đã tồn tại vào `lessons`. Bài và chương mới được nối sau thứ tự hiện có trong transaction. Mọi prerequisite phải có trong bundle mới hoặc references; hệ thống không suy đoán kiến thức.

Compiler mang từ vựng prerequisite vào pool của bài để SRS cập nhật cả từ cũ. UI tải danh sách khóa/chương trước, chỉ tải nội dung chương được chọn, phân trang 100 hàng, gộp các bài đã tải theo ID. Khởi động chỉ tải chương nhập môn. Kho bài mẫu riêng không nằm trong prerequisite của giáo trình mới.

Từ vựng/SRS hiện giữ ID chữ Hán của schema cũ để bảo toàn tiến độ. Nếu cùng chữ đã có nhưng Pinyin hoặc nghĩa khác, importer dừng với `VOCABULARY_CONFLICT_REVIEW_READING_AND_MEANING`, không âm thầm ghi đè hay coi hai cách dùng tương đương. Các khóa HSK vẫn có danh sách bài/từ và prerequisite riêng theo phiên bản. Nhiều cách đọc độc lập cho cùng một ID chữ cần một nâng cấp định danh từ vựng riêng khi tài liệu thật yêu cầu.

## Tương thích và tính điểm

V2 được compile thành Lesson tương thích RPC: `guide`, `words`, `questions`, `writing`, `minutes`, cộng `learning` chứa toàn bộ màn và `prerequisites`. Bài v1 và snapshot cũ vẫn đọc được. Không đổi ID 10 bài mẫu, khóa LocalStorage hoặc dữ liệu người dùng.

`screenIndex` lưu màn; `step` vẫn là chỉ số câu hỏi để server chấm điểm. Giao diện và RPC đều dùng prerequisite. Khi production chưa chạy migration mới, tài khoản vẫn dùng kho cũ và nhận thông báo chưa nhập khóa mới.

Khóa câu hỏi v2 gồm ID bài và màn để các bài có cùng lời dẫn không trùng ngân hàng ôn tập. Khóa câu hỏi legacy được giữ nguyên.

Mọi câu kiểm tra trong bài có trọng số bằng nhau; từ 70% bài được hoàn thành. Dùng gợi ý/Pinyin hoặc ghép sai không tính là nhớ đúng ngay lần đầu. XP bài lần đầu: 20..40 theo điểm; bài đã hoàn thành: 10; luyện tập độc lập: 10. Giải thích lỗi hiện sau mỗi câu. Một từ có bất kỳ lần sai nào trong phiên được ôn sau 10 phút; đúng hoàn toàn ôn sau 1, 2, 4, 8… tối đa 30 ngày. Lịch được ghi khi bấm lưu kết quả.

Demo dùng SpeechSynthesis, cần giọng zh trên thiết bị; thiếu giọng sẽ có thông báo và Pinyin. Nội dung thật có thể kèm audio HTTPS. MCP cho phép nguồn Supabase đã cấu hình; nguồn ngoài bổ sung qua `MEDIA_ASSET_ORIGINS` (các HTTPS origin, phân cách bằng dấu phẩy), không mở wildcard. Chưa chấm phát âm hoặc nhận diện thứ tự nét tự động; nhiệm vụ vở dùng checklist. Chưa có thông báo đẩy SRS.

## Kiểm chứng

- `npm test`: schema, checkpoint, SRS, prerequisite, năm tài khoản giả lập, giữ nguyên bài cũ, RLS/RPC, draft/promotion, rollback.
- `npm run build`: TypeScript/Vite.
- `npx playwright test`: mobile/desktop, bài mẫu, demo, JSON preview, luyện tập, MCP bridge.
- `npx tsx tests/mcp-smoke.ts`: client MCP thật tại local.

PostgreSQL tests dùng PGlite cách ly, không kết nối production. Chưa xác minh năm tài khoản thật hoặc Render deployment khi chưa có quyền truy cập các môi trường đó.
