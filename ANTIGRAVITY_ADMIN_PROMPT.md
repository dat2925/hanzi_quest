# Prompt gửi Antigravity

Bạn đang làm frontend cho repo **HanziOne** tại `D:\hsk_online`, React + TypeScript + Vite. Xây khu vực quản trị hoàn chỉnh, tiếng Việt, cùng màu sắc và phong cách với ứng dụng học tiếng Trung hiện tại. Backend đã có; chỉ làm FE, nối API thật, không sửa backend/migrations hoặc tự tạo API thay thế. Không deploy, chạy SQL, cấp quyền thật hay gửi email.

## Đọc trước khi code

- `ADMIN_BACKEND.md`: nguồn đúng về endpoint, payload, revision, lỗi và giới hạn.
- `src/admin/platform-types.ts`: types của API admin mới.
- `src/admin/AdminCurriculum.tsx`, `src/admin/client.ts`, `src/admin/types.ts`, `ADMIN_CURRICULUM.md`: workflow biên tập/preview/duyệt/xuất bản đang chạy.
- `src/App.tsx`, `src/cloud/Account.tsx`, `src/cloud/client.ts`: điều hướng, tài khoản và Supabase session.
- `src/style.css`, `src/Art.tsx`, `src/ProductCredit.tsx`: design tokens, linh vật Bao, thương hiệu SoloTech.

Không thay toàn bộ giao diện học viên để làm admin. Tích hợp một khu vực admin riêng, có nút quay về ứng dụng học. Repo hiện nhận `?admin=curriculum` để mở trình biên tập; giữ đường dẫn này hoạt động. Có thể thêm `?admin=dashboard`/users/courses/lessons/audit bằng cơ chế điều hướng hiện tại, không buộc thay router. Có link truy cập admin trong tài khoản/điều hướng sau khi kiểm tra quyền; không dựa vào email hay user_metadata để suy role.

## Phong cách cần giữ

Phong cách hiện có: nền kem/trắng, xanh lá trầm, chữ xanh than, khối bo tròn, viền mảnh, bóng nhẹ, khoảng trắng thoáng. Admin nên gọn và dễ đọc số liệu, cùng sản phẩm với trang học viên.

Dùng lại biến trong `src/style.css`, không khai báo global mới đè toàn bộ theme:

```css
--bg: #fafbf7;
--surface: #ffffff;
--green: #39794c;
--green-dark: #2f6240;
--text: #283e31;
--muted: #899087;
--line: #e9ece3;
--soft: #edf3e6;
--shadow: 0 5px 20px #2d4e3610;
```

Font **Be Vietnam Pro** cho UI, **Noto Sans SC** cho chữ Hán; icons `lucide-react` sẵn có. Bo card khoảng 16–20px, input/button 10–12px, khoảng cách theo 8px, nút tối thiểu 44px ở mobile. Dùng font-size nhỏ có chủ đích cho bảng, header rõ cấp bậc. Không tự thay sang giao diện tím/xanh dương, nền neon hoặc gradient lớn. Bao chỉ xuất hiện nhỏ ở header/empty state, không chiếm bảng dữ liệu. Giữ credit SoloTech.

Dark mode phải dùng hệ `[data-theme="dark"]` hiện có, tự kế thừa tokens: nền `#1c2820`, surface `#253329`, text `#e1e8d9`, muted `#a7b09c`, line `#3b493b`, soft `#35432e`, green `#679455`. Không dùng background trắng cố định trong bảng/modal. Nhãn và số liệu cần đủ tương phản; đừng dùng màu muted nhạt cho nội dung quan trọng. Scope CSS mới bằng `.admin-shell` hoặc tên tương đương để không ảnh hưởng lớp học.

## Các trang phải xây

1. **Tổng quan**: cards dữ liệu thật từ `/overview`: user, user học trong 7 ngày, bài đã published, nháp/chờ duyệt; nhật ký gần đây từ `/audit`. Có hành động mở quản lý user/nhập bài. Không tạo biểu đồ xu hướng nếu API chưa có dữ liệu chuỗi thời gian.
2. **Người dùng**: bảng email/tên, role, trạng thái, XP, bài hoàn thành, thời điểm đăng nhập; search debounce khoảng 300ms, filter role/trạng thái, phân trang server. Chi tiết user mở drawer hoặc trang con: hồ sơ, mục tiêu, thống kê và tiến độ theo bài có phân trang. Sửa tên/mục tiêu/phút học; khóa/mở quyền sử dụng ứng dụng có lý do; đổi learner/editor/admin. Không có nút reset XP, xóa user, gửi email hay sửa mật khẩu. Ẩn/disable tự khóa và tự đổi quyền dựa vào userId từ access, nhưng vẫn xử lý lỗi backend. Admin khác cần hạ role trước khi khóa; giải thích rõ trong dialog. Khóa tài khoản dùng wording “Tạm khóa sử dụng HanziOne”, không nói đã xóa Supabase session.
3. **Khóa học & chương**: danh sách khóa có tổng chương/bài/nháp, tạo khóa mới, sửa title/description/sortOrder; form tạo mới có family/phiên bản/HSK level theo API. Sau khi tạo, hiện đang chưa xuất bản cho tới khi có bài published. Khóa đã có giữ family/phiên bản/level ở chế độ đọc. Drill-down chương theo khóa; tạo/sửa metadata và thứ tự chương. Số thứ tự chương cần duy nhất; không làm kéo thả vì backend chưa có API reorder cả lô. Cho nhập số thứ tự và xử lý lỗi trùng.
4. **Bài học**: bảng có search, filter khóa/chương và 4 trạng thái draft/reviewed/published/hidden, thời lượng và số học viên. Tải danh sách từ `/lessons`, chỉ khi xem/sửa mới tải catalog curriculum theo khóa. Dùng lại editor JSON/validate/preview hiện tại; có thể bọc lại bố cục để thuận tiện nhưng giữ logic biên tập đã có. Nhập file JSON → validate → preview 7 màn → lưu nháp → chọn bài → checklist duyệt nguồn + preview → review → xác nhận publish. Không auto-review/auto-publish. Nội dung published/hidden chỉ đọc; nút ẩn/hiện gọi `lesson.visibility`, không dùng nó xuất bản draft. Khi có phụ thuộc, giải thích lỗi, không tự ẩn dây chuyền. Xóa draft cần dialog xác nhận; chỉ có thể xóa draft chưa có lesson row và không bị phụ thuộc. Bài SQL draft không xóa được thì hiện giải thích backend. Dùng **revision** cho editor/xóa draft và **admin_revision** cho ẩn/hiện; không nhầm hai loại.
5. **Nhật ký**: bảng có thời điểm, actor UUID, action, target, mở chi tiết thay đổi dạng text/JSON an toàn. API gồm cả `curriculum.save/review/publish`. Search/pagination server. Không tự tải thông tin user riêng cho từng dòng tạo N+1 requests.

Layout desktop: sidebar admin có Tổng quan / Người dùng / Khóa học / Bài học / Nhật ký; topbar breadcrumb và tài khoản. Mobile: sidebar gọn mở bằng nút, nội dung một cột, bảng cuộn ngang có nhãn và drawer/modal không vượt viewport. Kiểm tra 390px và 1440px. Bảng dùng HTML table đúng semantics; header sticky nếu cần. Hành động chính xanh lá, hủy phụ, thao tác khóa/xóa nháp có màu cảnh báo rõ nhưng không biến toàn bộ trang thành màu đỏ.

## Nối API và trạng thái

- Dùng Supabase session hiện có để lấy access_token. Dùng fetch cùng origin `/api/admin/...` với Bearer token, Content-Type JSON cho POST, `credentials:"omit"`, `cache:"no-store"`. Secret/service_role không bao giờ xuất hiện ở browser.
- Gọi `/api/admin/access` trước khi mở vùng admin. Nếu 403, có thể gọi `/api/admin/curriculum/access`: editor chỉ thấy khu vực biên tập cũ, không thấy user/nhật ký/toàn hệ thống. Nếu không có quyền thì có màn 403 và nút quay về học. Phân biệt 401, 403, 503, lỗi mạng; không biến lỗi thành “0 user”.
- Mỗi thao tác tạo UUID `requestId`; giữ cùng ID + payload khi retry lỗi mạng. Sửa payload phải tạo ID mới. Disable nút lúc đang gửi, tránh submit kép.
- Mọi mutation cần expectedRevision từ dữ liệu mới nhất. Sửa profile còn cần `profileUpdatedAt=profile.updated_at` hoặc null khi chưa có profile. Khi 409, giữ form người dùng đang nhập và báo đã có bản mới; tải lại để đối chiếu, không tự ghi đè bằng revision mới.
- Success xong refetch danh sách/detail/overview liên quan. Filter thay đổi reset offset. Hủy/loại bỏ response cũ khi search, filter, chuyển tab hoặc đổi tài khoản; không để response đến chậm ghi đè trang mới. Khi logout/401 phải bỏ dữ liệu admin khỏi bộ nhớ.
- Có skeleton/loading, empty state đúng tình huống, error + retry riêng cho từng khu vực. Không làm optimistic update cho khóa user, role, publish hoặc xóa nháp.
- Lỗi từ vựng là multiline; giữ tên bài, Hanzi và Pinyin/nghĩa hai bản, hiển thị `white-space:pre-wrap`. Hiện dưới dạng text React, không inject HTML. Không tự thay nghĩa hoặc tự bỏ guard để publish.
- Dữ liệu null (`profile`, `stats`, `last_sign_in_at`) có nhãn rõ “Chưa thiết lập”/“Chưa đăng nhập”; không bịa giá trị. Ngày hiển thị `vi-VN`, timezone `Asia/Ho_Chi_Minh`.
- Dialog có label, focus trap, đóng Escape, focus quay lại nút mở, aria-live cho trạng thái. Hỗ trợ bàn phím, prefers-reduced-motion.

## Hoàn thành và kiểm tra

- Chỉ thêm/sửa frontend và kiểm thử FE; giữ backend, migration và types hợp đồng đúng như tài liệu. Nếu thiếu endpoint, ghi rõ phần thiếu thay vì tạo nút thao tác giả.
- `npm run build` phải đạt. Thêm Playwright cho quyền admin/editor/member, search/pagination, sửa user với revision conflict, lock/unlock, danh sách bài đủ tới bài mới, validate/preview/review/publish và lỗi từ vựng. Mock API theo đúng contract hoặc dùng fixture DB cô lập, không dùng production.
- Kiểm tra light/dark, desktop/mobile, loading/empty/error/success và màn 401/403/503. Không đưa dữ liệu mock vào bản production.
- Bàn giao danh sách file thay đổi, các luồng đã nối thật, ảnh giao diện và kết quả tests; ghi rõ phần chưa làm. Backend đã có để bạn tập trung hoàn thiện trải nghiệm quản trị đồng nhất với HanziOne.
