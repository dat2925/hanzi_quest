/**
 * Chạy trong ROOT repository HanziOne:
 * node scripts/build-book1-lesson1c.mjs
 * Tạo bundle với references 1A + 1B từ chính repo. KHÔNG gọi production.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const base = JSON.parse(
  readFileSync("curriculum/book1-lesson1c-base.json", "utf8"),
);
const b = JSON.parse(readFileSync("curriculum/book1-lesson1b.json", "utf8"));
if (
  base.courseId !== b.courseId ||
  base.syllabus.version !== b.syllabus.version ||
  base.syllabus.family !== b.syllabus.family
)
  throw new Error("COURSE_OR_SYLLABUS_MISMATCH");
if (
  b.lessons?.length !== 1 ||
  b.lessons[0].id !== "hanzione-b1-l01b" ||
  b.lessons[0].chapterId !== "hanzione-b1-ch01"
)
  throw new Error("UNEXPECTED_1B_SOURCE");
const a = b.references?.find((r) => r.id === "hanzione-b1-l01a");
if (
  !a ||
  a.status !== "published" ||
  b.lessons[0].prerequisites?.join(",") !== a.id
)
  throw new Error("MISSING_OR_UNEXPECTED_1A_REFERENCE");
const reference1a = structuredClone(a);
const reference1b = structuredClone(b.lessons[0]);
reference1b.status = "published"; // chỉ phản ánh 1B ĐÃ được user publish
base.lessons[0].prerequisites = [reference1b.id];
base.references = [reference1a, reference1b];
const dest = "curriculum/book1-lesson1c.json";
if (existsSync(dest)) throw new Error("TARGET_EXISTS_DO_NOT_OVERWRITE");
writeFileSync(dest, JSON.stringify(base, null, 2) + "\n", { flag: "wx" });
console.log(
  `Đã tạo ${dest}; chỉ chứa bài mới 1C, 1A/1B là REFERENCES bất biến.`,
);
console.log(
  "Kiểm tra: npm run curriculum -- curriculum/book1-lesson1c.json --validate",
);
console.log(
  "CẢNH BÁO: so sánh references 1A/1B với Supabase production trước khi xuất SQL.",
);
