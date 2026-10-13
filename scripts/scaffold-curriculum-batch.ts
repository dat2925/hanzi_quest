import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { bundleSchema } from "../src/learning/schema";
import { lessonScaffold } from "../src/admin/template";
const [manifestPath, output] = process.argv.slice(2);
if (!manifestPath || !output)
  throw new Error(
    "Usage: npx tsx scripts/scaffold-curriculum-batch.ts manifest.json output.json",
  );
const manifestSchema = bundleSchema
  .pick({ courseId: true, title: true, syllabus: true, chapters: true })
  .extend({
    lessons: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z][a-z0-9-]{1,99}$/),
          chapterId: z.string(),
          title: z.string().min(1),
          prerequisites: z.array(z.string()),
          source: z.object({
            file: z.string().min(1),
            location: z.string().min(1),
            scanned: z.boolean(),
          }),
        }),
      )
      .min(5)
      .max(10),
  });
const manifest = manifestSchema.parse(
  JSON.parse(readFileSync(manifestPath, "utf8")),
);
if (new Set(manifest.lessons.map((l) => l.id)).size !== manifest.lessons.length)
  throw new Error("DUPLICATE_LESSON_ID");
for (const l of manifest.lessons) {
  if (!manifest.chapters.some((c) => c.id === l.chapterId))
    throw new Error(`UNKNOWN_CHAPTER: ${l.id}`);
  if (!existsSync(resolve(dirname(manifestPath), l.source.file)))
    throw new Error(`SOURCE_NOT_FOUND: ${l.source.file}`);
}
const sidecar = output + ".review.json";
if (existsSync(output) || existsSync(sidecar))
  throw new Error("OUTPUT_EXISTS_DO_NOT_OVERWRITE");
const { lessons, ...course } = manifest;
const bundle = {
  schemaVersion: 2,
  ...course,
  status: "draft",
  references: [],
  lessons: lessons.map((l) => ({
    ...lessonScaffold(l.id, l.chapterId, l.prerequisites),
    title: l.title,
  })),
};
writeFileSync(output, JSON.stringify(bundle, null, 2) + "\n", { flag: "wx" });
writeFileSync(
  sidecar,
  JSON.stringify(
    {
      status: "needs_human_review",
      instructions:
        "Biên soạn từ nguồn; kiểm tra OCR/chữ Hán/Pinyin/nghĩa; không chép nguyên văn lượng lớn. Mẫu chưa đủ nội dung và chưa thể import.",
      lessons: lessons.map((l) => ({
        id: l.id,
        source: l.source,
        hanziChecked: false,
        pinyinChecked: false,
        meaningChecked: false,
        copyrightChecked: false,
        sevenStagesPreviewed: false,
      })),
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  `Đã tạo khung ${lessons.length} bài và checklist ${sidecar}. Đây là mẫu chưa hợp lệ để nhập: cần biên soạn từ nguồn, không có nội dung tự sinh.`,
);
