# HanziOne — Hành trình chinh phục tiếng Trung

Ứng dụng React + TypeScript dành cho người Việt, với giao diện xanh lá/kem, linh vật Bao được vẽ riêng bằng SVG và trải nghiệm standalone hoặc MCP Apps.

Một sản phẩm của **SoloTech**.

## Tài khoản Supabase

Xem [SETUP_SUPABASE.md](SETUP_SUPABASE.md) để chạy migrations, cấu hình email/password, redirect, biến môi trường và triển khai Render. Không có credentials trong repository. Khi chưa cấu hình, app giữ chế độ local; khi cấu hình sẽ có Auth, cache/queue theo tài khoản và RPC đồng bộ. Chưa xác nhận hoạt động với project Supabase/SMTP hoặc ChatGPT thật.

## Chạy ứng dụng

Yêu cầu Node.js 22+.

```sh
npm ci
npm run build
npm run mcp
```

Mở **http://127.0.0.1:8787**. MCP endpoint: **http://127.0.0.1:8787/mcp**. Cổng có thể đổi bằng biến môi trường `MCP_PORT`.

Chế độ phát triển có hot reload: `npm run dev`, mở http://127.0.0.1:5173.

## Tính năng

- Thiết lập tên, kinh nghiệm, mục tiêu, số phút và giờ học; chỉnh lại bất cứ lúc nào.
- Dashboard bắt đầu từ số liệu 0; XP, thời gian, streak và lịch sử sinh từ phiên học thực tế.
- Giáo trình từ số 0 gồm một bài demo 17 màn và tám chương khung. Kho 10 bài mẫu riêng giữ nguyên tiến độ; bài mới mở theo prerequisite.
- Bài học gồm hướng dẫn, phát âm, chọn đáp án, nghe, ghép cặp, xếp câu, ghi chép và kết quả.
- 9 chế độ luyện tập: nghe, Pinyin, thanh điệu, nhận diện, ghép cặp, flashcard, xếp câu, viết, ôn lỗi sai.
- SRS: từ đúng ôn sau 1, 2, 4, 8… ngày, tối đa 30 ngày; từ sai sau 10 phút. Trong một phiên, một từ sai được ưu tiên ôn sớm dù những câu khác đúng.
- Sổ tay, từ khó, tìm từ, ngữ pháp, ghi chú tự lưu, lịch sử và checklist luyện viết theo ngày.
- Thống kê, dark mode, giảm chuyển động theo thiết bị, điều hướng bàn phím, giữ focus trong hộp thoại.
- Tiến độ LocalStorage có xác thực Zod; xuất bản sao JSON trong Cài đặt. Tài khoản Supabase dùng PostgreSQL làm nguồn chính, queue offline và checkpoint; dữ liệu local cũ chỉ chuyển sau khi xem trước/xác nhận.

## Kiến trúc

Giáo trình tương tác: xem [CURRICULUM.md](CURRICULUM.md) để biên soạn JSON, validate Zod, xem trước và xuất SQL draft/published. Production cần chạy migrations mới 004 rồi 005 theo [SETUP_SUPABASE.md](SETUP_SUPABASE.md). Chưa tự sinh giáo trình HSK đầy đủ.

| File              | Trách nhiệm                                              |
| ----------------- | -------------------------------------------------------- |
| `src/App.tsx`     | Các trang, điều hướng, thiết lập, quản lý trạng thái     |
| `src/Game.tsx`    | Luồng trò chơi, kết quả, đọc phát âm và ô thử viết       |
| `src/engine.ts`   | Xáo trộn lựa chọn độc lập với giao diện                  |
| `src/data.ts`     | Bài học, câu hỏi, chữ Hán, Pinyin, nghĩa tiếng Việt      |
| `src/progress.ts` | Schema, lịch ôn, XP, lịch sử, mở khóa, streak            |
| `src/bridge.ts`   | MCP Apps SDK: khởi tạo host, nhận kết quả công cụ, theme |
| `server/index.ts` | MCP HTTP server và giao diện standalone                  |
| `vite.config.ts`  | Đóng gói React/CSS vào một tài nguyên HTML để nhúng      |

## Kết nối ChatGPT

Thực hiện theo [OpenAI MCP quickstart](https://developers.openai.com/plugins/build/app-quickstart) và [hướng dẫn giao diện MCP Apps](https://developers.openai.com/plugins/build/chatgpt-ui). Đã đọc tài liệu chính thức và đối chiếu với khai báo kiểu SDK cài đặt. SDK hiện tại tách `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/client`; phần UI dùng `@modelcontextprotocol/ext-apps`.

1. Build và chạy MCP server như trên.
2. Đưa cổng 8787 qua HTTPS tunnel hoặc triển khai Node server. Ví dụ `ngrok http 8787` nếu đã cài ngrok.
3. Trong tài khoản ChatGPT hỗ trợ kết nối MCP tùy chỉnh, thêm URL HTTPS kết thúc bằng `/mcp`.
4. Gọi `open_hanzi_quest` để mở UI; `get_learning_path` lấy lộ trình; `preview_lesson` nhận lessonId để xem trước.
5. Kiểm thử trực tiếp việc mở UI, đổi theme, resize, toàn màn hình và lưu trữ trong host trước khi phát hành.

Server dùng Streamable HTTP stateless và công cụ chỉ đọc; không lưu tiến độ chung, không tự hoàn thành bài, không cần OpenAI API key. Resource dùng MIME `text/html;profile=mcp-app` và `_meta.ui.resourceUri`; bridge dùng SDK MCP Apps, không dùng API riêng `window.openai`. UI gửi kích thước tự động và yêu cầu fullscreen bằng phương thức chuẩn khi đã kết nối.

**Đã kiểm thử MCP bằng client thật ở local. Chưa kết nối hay xác nhận hoạt động trong tài khoản ChatGPT thật; chưa xuất bản.** LocalStorage trong iframe có thể bị host hạn chế hoặc xóa; dữ liệu không đồng bộ với bản standalone. Nếu mở công khai, cần thêm xác thực/giới hạn tốc độ và cấu hình triển khai phù hợp.

## Kiểm thử

```sh
npm test
# Sau npm run build và npm run mcp:
npx tsx tests/mcp-smoke.ts
npx playwright test
npm audit
```

Playwright dùng Microsoft Edge có sẵn (`channel: msedge`). Có thể đổi channel trong `playwright.config.ts` theo trình duyệt đã cài. E2E chạy trên bản build được server phục vụ, không chỉ kiểm tra dev server. Ảnh QA lưu trong `test-results`.

## Phạm vi và giới hạn hiện tại

- 10 bài nền tảng, trong đó HSK 1, 2, 3 là **bài mẫu chủ đề**, chưa phải toàn bộ giáo trình hoặc chuẩn bị thi đầy đủ.
- Âm thanh dùng SpeechSynthesis và cần giọng zh-CN/zh khác đã cài. Khi không có giọng phù hợp, ứng dụng báo rõ và cho xem Pinyin; không giả định giọng mặc định đọc đúng tiếng Trung.
- Ô viết nhận nét bút tự do; chưa chấm thứ tự nét, nhận diện chữ viết hoặc chấm phát âm. Hướng dẫn trong vở tập trung vào các chữ/nét đã mô tả.
- Flashcard là tự đánh giá, không thưởng XP hay tự mở khóa. XP chỉ sinh từ phiên trò chơi đã lưu.
- Giờ học là sở thích được lưu, chưa có push notification. Thời gian học ghi theo thời lượng phiên, làm tròn tối thiểu 1 phút.
- Google Fonts là tài nguyên tùy chọn; font hệ thống là phương án dự phòng. JavaScript, CSS và minh họa được nhúng trong HTML build.
- Nội dung đầu vào người dùng kết thúc giữa phần Cài đặt (“Bật/tắt hiệu…”). Đã triển khai phần thấy được và thêm bật/tắt phát âm, xuất dữ liệu.
