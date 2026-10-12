# Prompt cho Codex – Nhập thử giáo trình quyển 1 vào HanziOne

Repository: https://github.com/dat2925/hanzi_quest (kiểm tra URL thực tế trước khi thao tác nếu repo đã đổi tên).

Tôi có bộ tài liệu tham chiếu `Han 1 TV.pdf`. Tôi đã biên soạn hai file `HanziOne_Bai1A_kich_ban_hoc.md` (kịch bản 7 màn) và `HanziOne_Bai1A_curriculum.json` (định dạng tương thích importer hiện tại), cùng mục lục `HanziOne_Quyen1_15_bai.csv`.

Hãy:
1. Tạo chế độ *preview/draft* cho bài học mới. Không tự ý ghi vào Supabase production.
2. Xây dựng cấu trúc lesson steps gồm lý thuyết, từ mới, luyện nghe-nói, tự nhớ, viết vào vở, quiz và SRS. Tích hợp từng bước vào UI hiện có.
3. Dùng bài 1A `你好` làm mẫu thực tế. Chỉ hỏi kiến thức đã dạy, cho phép xem gợi ý, xem lại lỗi, nghe lại và tự nhớ.
4. Giữ nguyên 10 bài mẫu đã có và các lesson ID/tiến độ của 5 tài khoản. Lộ trình quyển 1 và các bài mẫu phải phân biệt rõ; quản lý order của course/units/lessons để không trộn thứ tự.
5. Kiểm tra script `scripts/export-curriculum.ts`: hiện mặc định `is_published=true`, course sort_order=0; hãy hỗ trợ draft và thứ tự course an toàn, cung cấp migration mới thay vì sửa migration đã chạy.
6. TTS/nghe phải chọn tiếng Trung phổ thông; không giả vờ đã chấm phát âm hay nét viết nếu chưa có hệ thống đánh giá đáng tin cậy.
7. Tách XP được server kiểm chứng và thao tác tự đánh giá nhớ/chưa nhớ. Giữ RLS và ngân hàng đáp án riêng.
8. Thêm tests đơn vị, tests import/Zod, tests E2E cho bài 1A; chạy npm test && npm run build.
9. Tạo Pull Request hoặc commit code khi được phép, báo rõ SQL migration nào *tôi phải chủ động chạy* để xem trước rồi mới xuất bản bài.

**Chưa tạo 15 bài tự động**. Chỉ triển khai bài 1A hoàn chỉnh, đợi tôi duyệt trải nghiệm rồi mở rộng.
