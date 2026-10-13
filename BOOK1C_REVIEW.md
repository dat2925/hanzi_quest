# Duyệt Bài 1C · Bốn thanh điệu tiếng Trung

Chỉ thêm `hanzione-b1-l01c`, prerequisite `hanzione-b1-l01b`, giữ course `hanzione-book1-preview`, chapter `hanzione-b1-ch01`, syllabus `foundation / book1-preview-v1`. JSON Bài 1A/1B và các migration đã có được giữ nguyên. Không gọi hoặc chạy SQL trên Supabase production.

Đã giải nén và đọc đủ 6 file trong ZIP: README, prompt, kịch bản, QA, JSON và script. Đây là tài liệu đầu vào để biên soạn, không phải chỉ dẫn thay thế phạm vi người dùng đã cho phép. ZIP không chứa `Han 1 TV.pdf`, nên chưa đọc/đối chiếu sách gốc hoặc các số trang được nhắc tới. Không lấy ảnh hay audio có bản quyền từ sách.

## Xem thử ngay, chưa cần SQL

Sau khi Render deploy commit mới, mở **Hành trình → Bài 1C · Bốn thanh điệu tiếng Trung → Xem thử Bài 1C**. Không cần hoàn thành 1B để duyệt preview. Bản kèm ứng dụng ở trạng thái draft; preview không lưu XP, checkpoint, tiến độ hoặc SRS, kể cả khi đang đăng nhập.

Thẻ Bài 1C kiểm tra trạng thái published thật khi đăng nhập. Nếu truy vấn không trả bài, chỉ báo chưa có bản xuất bản hiển thị cho tài khoản; kết quả rỗng dưới RLS không chứng minh draft. Đang tải/lỗi được hiển thị riêng; có nút thử lại, không hardcode “đang chờ duyệt”. Khi published, thẻ chuyển sang **Học ngay**, dùng bài tải từ Supabase và cơ chế đồng bộ/chấm điểm hiện có. Chưa hoàn thành 1B thì nút học bị khóa và nêu rõ điều kiện.

Sau publish có thể chọn **HanziOne · Quyển 1 → Bài 1 · Chào hỏi → Bài 1C → Học ngay**. Nút 1A và 1B vẫn kiểm tra trạng thái thật và mở bài thật như trước.

## Nội dung 7 màn

1. Mục tiêu, vai trò dấu thanh trên Pinyin, ôn 八 / 马 đã học.
2. Bốn đường giọng: thanh 1 cao ngang, thanh 2 đi lên, thanh 3 hạ thấp (có thể lên khi đọc riêng), thanh 4 đi xuống. Minh họa mā/má/mǎ/mà, nghe từng chữ riêng bằng giọng Mandarin. Không hỏi nghĩa/chữ 麻 hoặc 骂.
3. Chỉ hai từ mới cần nhớ: 妈 — mā — Mẹ; 爸 — bà — Bố. Hai ví dụ 八 — bā và 马 — mǎ được đánh dấu là từ cũ. Có nghe thường/chậm và ẩn Pinyin.
4. Sáu thẻ tự nhớ: chữ → nghĩa, nghĩa → chữ, chữ → Pinyin cho từng từ mới. Đáp án chỉ hiện sau khi lật; tự đánh giá không cộng XP.
5. Viết vào vở, tập bốn dấu trên a, che mẫu để viết từ nghĩa Mẹ/Bố rồi hiện mẫu đối chiếu; checklist tự kiểm tra. Chưa chấm phát âm hoặc nét viết.
6. Chín hoạt động: hai câu nghĩa, hai câu đường giọng thanh 1/2, hai câu nhận dấu thanh 3/4, hai câu Pinyin và ghép cặp. Mỗi câu có gợi ý và giải thích, kiến thức được giới thiệu trước.
7. SRS hai từ mới; nhắc tự ôn 八/马 riêng. Lịch cũ giữ nguyên khi học 1C; ví dụ 麻/骂 không được thêm vào lịch từ 1C. Ba hướng tự nhớ của mỗi từ dùng chung lịch ôn hiện tại.

Đã chỉnh nguồn cung cấp để Pinyin không lộ trong đoạn hướng dẫn khi ẩn, mẫu chữ không lộ trong body/checklist khi che. Đã bỏ speech đọc liền bốn chữ; thêm thuộc tính schema v2 tùy chọn `listenToExamples` để nghe riêng từng ví dụ thường/chậm. Thuộc tính không có giá trị mặc định và không xuất hiện trong bản parsed 1A/1B, nên reference cũ không bị thay đổi.

## SQL thủ công sau khi duyệt

**Chưa thực thi production.** Hai file được tạo bằng importer hiện tại, có transaction/khóa advisory, kiểm tra nội dung reference published 1A **và** 1B. Không sửa metadata chương, bài cũ, profile, tiến độ hoặc chính sách RLS.

1. `supabase/migrations/202610130003_book1_lesson1c_draft.sql`: thêm đúng một bài draft, đáp án chấm server và prerequisite. Từ vựng đã tồn tại chỉ được kiểm tra rồi giữ nguyên bằng `ON CONFLICT DO NOTHING`.
2. `supabase/manual/book1_lesson1c_publish_after_review.sql`: dùng sau khi duyệt; chỉ publish bản 1C khớp nội dung đã kiểm thử và bật hiển thị từ vựng cần học/khóa. Không cập nhật lại 1A/1B.

Trước khi chạy, sao lưu theo quy trình của bạn và SELECT read-only trong SQL Editor:

```sql
select l.id, l.is_published,
       l.content_json->'learning' as learning,
       c.id as course_id, c.is_published as course_published
from public.lessons l
join public.units u on u.id=l.unit_id
join public.courses c on c.id=u.course_id
where l.id in ('hanzione-b1-l01a','hanzione-b1-l01b','hanzione-b1-l01c')
order by l.id;
```

Đối chiếu `learning` của 1A/1B với `references` trong `curriculum/book1-lesson1c.json`, không chỉ kiểm tra cờ published. Chưa xác minh sự khớp này trên production; SQL giữ nguyên guard và sẽ dừng nếu khác. Khi gặp:

- `REFERENCE_MISMATCH`: dừng để đối chiếu reference; không ghi đè 1A/1B hoặc bỏ guard.
- `LESSON_ID_EXISTS_USE_NEW_REVISION`: không nhập lại, không xóa hàng. Nếu draft đã nhập đúng thì chuyển sang publish; nếu khác cần revision mới.
- `DRAFT_CONTENT_MISMATCH`: nội dung lưu khác bản đã duyệt; đối chiếu trước khi publish. Sau lỗi transaction, rollback trước thao tác tiếp theo.

Sau khi duyệt preview: nhập **draft một lần**, kiểm tra `false / draft / 7 màn` và prerequisite 1B. Sau đó mới chạy **publish riêng**, kiểm tra `true / published / 7 màn`. Đăng nhập tài khoản đã hoàn thành 1B, tải lại Hành trình, học thật và reload để kiểm tra XP, hoàn thành bài, lịch ôn 妈/爸. Tài khoản chưa hoàn thành 1B phải vẫn bị khóa.

Metadata chương cũ có thể vẫn nhắc chỉ 1A; migration này cố ý giữ nguyên. Đề xuất duyệt riêng tên “Bài 1 · Chào hỏi, Pinyin và thanh điệu” cùng mô tả 1A/1B/1C trong JSON; chưa tạo hoặc chạy cập nhật metadata production.

## Validate và kiểm thử

```powershell
npm run curriculum -- curriculum/book1-lesson1c.json --validate
npm test
npm run build
# Bật npm run mcp trước khi chạy E2E build/MCP:
npx playwright test
npx tsx tests/mcp-smoke.ts
# Dev QA 5174 dùng URL/key giả, mọi request Supabase được mock:
npx playwright test --config playwright.auth.config.ts
```

`scripts/build-book1-lesson1c.mjs` đọc bundle 1B tại repo, sao chép reference 1A và 1B published, gắn prerequisite rồi tạo bundle 1C; từ chối ghi đè file đã có. Nguồn biên soạn là `curriculum/book1-lesson1c-base.json`. Khi sửa nội dung đã nhập, dùng revision/output mới, không sửa migration đã chạy.

Kiểm thử SQL chạy trong PostgreSQL/PGlite cô lập với 5 tài khoản, 10 bài mẫu và hai bài published: kiểm tra cả reference thiếu published/lệch nội dung, RLS draft, publish đúng nội dung, prerequisite server/client, chấm 8/9 = 38 XP, retry không nhân đôi, SRS hai từ, từ quên ôn sớm không cộng XP, giữ lịch cũ và cách ly tài khoản. Test cũng so sánh SQL sinh lại với file giao và kiểm tra importer từ chối ID trùng.

Kết quả ngày 13/10/2026: validate JSON và build TypeScript/Vite đạt; **36 unit/PostgreSQL tests**, **30 E2E giao diện**, **13 E2E tài khoản** (12 CourseBrowser + 1 Auth mock/RPC PostgreSQL) và MCP smoke đạt. Một test `auth-e2e/production.spec.ts` yêu cầu QA production build với `AUTH_E2E_URL` được bỏ qua vì phiên này dùng dev QA 5174; không phải xác nhận Render/Supabase production. Đã kiểm tra ảnh và độ rộng mobile 390px/desktop 1440px, nghe từng ví dụ qua Mandarin zh-SG mock, từ chối giọng English/Cantonese, ẩn đáp án/Pinyin/mẫu, đủ 9 hoạt động, điểm 8/9 và preview không lưu sau reload.

Giới hạn: audio là TTS Mandarin trên thiết bị, chưa có bản thu đã kiểm chứng; độ rõ thanh điệu cần bạn nghe và duyệt trên thiết bị thực. Không dùng giọng Anh/Cantonese thay Mandarin; thiếu giọng thì báo rõ. Chưa chấm giọng hoặc thứ tự nét. Kiểm thử cô lập không xác nhận nội dung Supabase production hay việc Render deploy hoàn tất.
