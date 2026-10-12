import { writeFileSync, readFileSync } from "node:fs";
import { z } from "zod";
import { lessons, allWords, type Question } from "../src/data";
import { assessedWords } from "../src/engine";
import { questionKey } from "../src/cloud/operations";
import { gameSnapshotSchema } from "../src/game-state";
const lessonSchema = gameSnapshotSchema.shape.lesson;
const bundleSchema = z.object({
  courseId: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  lessons: z.array(lessonSchema).min(1),
});
const [input, output] = process.argv.slice(2);
// Sample export is a recovery tool, never an implicit publication command.
const published = process.argv.includes("--publish-sample");
if (input && input !== "--sample")
  throw new Error(
    "Dùng scripts/import-curriculum.ts để validate và nhập giáo trình mới. Script này chỉ xuất bản sao bài mẫu.",
  );
const bundle = bundleSchema.parse(
  input && input !== "--sample"
    ? JSON.parse(readFileSync(input, "utf8"))
    : {
        courseId: "sample",
        version: "sample-1",
        title: "Hanzi Quest · 10 bài mẫu",
        lessons,
      },
);
if (new Set(bundle.lessons.map((l) => l.id)).size !== bundle.lessons.length)
  throw new Error("Duplicate lesson IDs");
const words = [
  ...new Map(
    [...allWords, ...bundle.lessons.flatMap((l) => l.words)].map((w) => [
      w.hanzi,
      w,
    ]),
  ).values(),
];
const quote = (v: unknown) => "'" + String(v).replaceAll("'", "''") + "'";
const json = (v: unknown) => quote(JSON.stringify(v)) + "::jsonb";
const bank = new Map<string, unknown>();
function trusted(q: Question) {
  const key = questionKey(q);
  const result = {
    ...q,
    key,
    targets: assessedWords(q, words).map((w) => w.hanzi),
  };
  bank.set(key, result);
  return result;
}
const unit = bundle.courseId + "-unit";
const sql = [
  "-- Generated from the source curriculum; run only as database administrator.",
  "begin;",
  "select pg_advisory_xact_lock(72631012);",
  `insert into public.courses(id,title,syllabus_version,sort_order,is_published) values(${quote(bundle.courseId)},${quote(bundle.title)},${quote(bundle.version)},(select coalesce(max(sort_order),-1)+1 from public.courses),${published}) on conflict(id) do update set title=excluded.title,syllabus_version=excluded.syllabus_version;`,
  `insert into public.units(id,course_id,title,sort_order) values(${quote(unit)},${quote(bundle.courseId)},${quote(bundle.title)},0) on conflict(id) do update set title=excluded.title;`,
];
for (const [i, l] of bundle.lessons.entries())
  sql.push(
    `insert into public.lessons(id,unit_id,title,description,estimated_minutes,sort_order,content_json,is_published) values(${quote(l.id)},${quote(unit)},${quote(l.title)},${quote(l.description)},${l.minutes},${i},${json({ ...l, questions: l.questions.map(trusted) })},${published}) on conflict(id) do update set title=excluded.title,description=excluded.description,estimated_minutes=excluded.estimated_minutes,content_json=excluded.content_json;`,
  );
for (const w of words) {
  sql.push(
    `insert into public.vocabulary(id,hanzi,pinyin,meaning_vi,syllabus_version,is_published) values(${quote(w.hanzi)},${quote(w.hanzi)},${quote(w.pinyin)},${quote(w.meaning)},${quote(bundle.version)},${published}) on conflict(id) do update set pinyin=excluded.pinyin,meaning_vi=excluded.meaning_vi;`,
  );
  for (const mode of ["meaning", "pinyin", "listen"])
    trusted({
      type: mode === "listen" ? "listen" : "quiz",
      prompt:
        mode === "listen"
          ? "Nghe và chọn chữ Hán"
          : mode === "pinyin"
            ? `Pinyin của ${w.hanzi} là gì?`
            : `“${w.hanzi}” có nghĩa là gì?`,
      audio: w.hanzi,
      answer:
        mode === "listen" ? w.hanzi : mode === "pinyin" ? w.pinyin : w.meaning,
      options: [],
      explanation: "",
    });
}
for (const [key, q] of bank)
  sql.push(
    `insert into private.question_bank(question_key,question_json) values(${quote(key)},${json(q)}) on conflict(question_key) do update set question_json=excluded.question_json;`,
  );
sql.push("commit;", "");
if (!output)
  throw new Error(
    "Usage: npx tsx scripts/export-curriculum.ts --sample output.sql (or input.json output.sql)",
  );
writeFileSync(
  output,
  sql
    .join("\n")
    .replace(
      /on conflict\([^)]*\) do update set [^;]+/g,
      "on conflict do nothing",
    ),
  { encoding: "utf8", flag: "wx" },
);
console.log(
  `Exported ${bundle.lessons.length} lessons, ${words.length} vocabulary items to ${output}`,
);
