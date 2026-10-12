/**
 * Chạy trong thư mục gốc repository HanziOne:
 * node scripts/build-book1-lesson1b.mjs
 * Đọc bản chính xác Bài 1A từ repo; KHÔNG thay đổi 1A hoặc production.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const b = JSON.parse(
  readFileSync("curriculum/book1-lesson1b-base.json", "utf8"),
);
const a = JSON.parse(readFileSync("curriculum/book1-lesson1a.json", "utf8"));
if (b.courseId !== a.courseId || b.syllabus.version !== a.syllabus.version)
  throw new Error("COURSE_OR_SYLLABUS_MISMATCH");
if (a.lessons.length !== 1 || a.lessons[0].id !== "hanzione-b1-l01a")
  throw new Error("UNEXPECTED_1A_SOURCE");
const reference = structuredClone(a.lessons[0]);
reference.status = "published"; // trạng thái 1A đã xuất bản, các trường khác bất biến
b.lessons[0].prerequisites = [reference.id];
b.references = [reference];
const dest = "curriculum/book1-lesson1b.json";
if (existsSync(dest)) throw new Error("TARGET_EXISTS_DO_NOT_OVERWRITE");
writeFileSync(dest, JSON.stringify(b, null, 2) + "\n");
console.log(
  `Đã tạo ${dest}. Hãy chạy npm run curriculum -- ${dest} --validate`,
);
console.log(
  "LƯU Ý: so sánh reference 1A với DB thật trước khi chạy bất kỳ SQL nào.",
);
