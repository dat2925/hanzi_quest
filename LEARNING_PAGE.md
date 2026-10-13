# Trang học riêng của HanziOne

Học ngay mở `/learn/:lessonId`; xem thử mở `/learn/preview` bằng dữ liệu trong bộ nhớ. Trang học không dùng modal, giữ màu/chữ/dark mode hiện có, có header tiến độ, vùng nội dung cuộn và footer riêng. URL ví dụ: https://hanzi-quest.onrender.com/learn/hanzione-b1-l01a

## Các file thay đổi

- `src/App.tsx`: điều hướng vào trang học, giữ giao diện trước đó được mount để bảo toàn editor chưa lưu.
- `src/learning/navigation.ts`: History API, Back/Forward, xác nhận thoát, URL trở về và phiên học; hủy preview khi đổi tài khoản hoặc mất quyền Admin.
- `src/learning/LearningWorkspace.tsx`: tải bài, kiểm tra quyền học, checkpoint, xác nhận kết quả và bài tiếp theo.
- `src/learning/published.ts`: đọc bài published và prerequisite qua Supabase với quyền/RLS của tài khoản hiện tại.
- `src/learning/learning-page.css`: layout responsive mobile/desktop, nội dung cuộn riêng để footer không che đáp án.
- `src/Game.tsx`: thêm layout trang và vùng kết quả; giữ engine học/chấm đáp án hiện có.
- `src/learning/CourseJourney.tsx`: cả xem trước từ file JSON cũng đi qua trang học.
- `src/game-state.ts`, `src/progress.ts`: timestamp chọn checkpoint mới nhất và ID phiên cho lịch sử khách trên thiết bị.
- `server/index.ts`: HTML fallback cho đúng `/learn/:id`, không bắt `/api/*` hay đường dẫn con tùy ý.
- `tests/learning-page.test.ts`, `tests/helpers/admin-fixture.ts`, `auth-e2e/learning-page.spec.ts`, `auth-e2e/admin.spec.ts`, `auth-e2e/admin-platform.spec.ts`: kiểm thử và fixture cho điều hướng mới.

## Hành vi và dữ liệu

Giữ JSON v2, bảy màn học, nghe Mandarin, che Pinyin/đáp án, tự nhớ, luyện viết, SRS, các bài mẫu, prerequisite và cơ chế RPC hiện có. Không sửa SQL, RLS hoặc dữ liệu production.

Tài khoản cloud chỉ hiển thị XP/điểm đã lưu sau khi đọc được receipt `study_sessions` của chính tài khoản. Khi mạng lỗi, giữ operation ID và kết quả để thử lại, không tự cộng XP. Refresh kết quả không tạo phiên/SRS mới. Chế độ khách vẫn lưu tiến độ trên thiết bị như trước.

Checkpoint được lưu riêng theo tài khoản và chọn bản hợp lệ mới nhất giữa bộ nhớ trình duyệt/server. Thoát giữa bài không tính hoàn thành. Nút X trở về trang gốc cả khi đã chuyển qua bài tiếp theo; thiếu lịch sử hợp lệ thì về Hành trình.

Preview không ghi XP, SRS, checkpoint hay tiến độ. Dữ liệu draft không nằm trong URL/history; refresh hoặc đổi tài khoản kết thúc phiên preview và cần mở lại từ editor. Trở lại Admin trong cùng phiên giữ nguyên JSON và trạng thái xác thực biểu mẫu chưa lưu.

## Kiểm tra

`npm test`, `npm run build` và `npx playwright test --config playwright.auth.config.ts auth-e2e/learning-page.spec.ts auth-e2e/admin.spec.ts auth-e2e/admin-platform.spec.ts`.

E2E chạy với PostgreSQL/API fixture riêng, không dùng Supabase production. Bao gồm 390px/1440px, bảy màn, refresh/checkpoint, Back/Forward/xác nhận thoát, receipt trì hoãn, XP/SRS không nhân đôi, khóa/draft/không tồn tại, editor Admin và các luồng quản trị hiện có.
