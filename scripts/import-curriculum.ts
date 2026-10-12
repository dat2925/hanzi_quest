import { readFileSync, writeFileSync } from "node:fs";
import { validateBundle } from "../src/learning/schema";
import { compileBundle } from "../src/learning/adapter";
import { assessedWords } from "../src/engine";
import { questionKey } from "../src/cloud/operations";
const [file, mode = "--validate", output] = process.argv.slice(2);
if (!file)
  throw new Error(
    "Usage: tsx scripts/import-curriculum.ts input.json [--validate | --draft-sql output.sql | --publish-sql output.sql]",
  );
const b = validateBundle(JSON.parse(readFileSync(file, "utf8")));
const compiled = compileBundle(b);
if (
  !["--validate", "--draft-sql", "--publish-sql", "--promote-sql"].includes(
    mode,
  )
)
  throw new Error("Chế độ không hợp lệ");
if (mode === "--validate") {
  console.log(
    `${b.title}: ${b.chapters.length} chương, ${b.lessons.length} bài hợp lệ. Xem trước JSON trong trang Lộ trình trước khi xuất bản.`,
  );
  process.exit(0);
}
if (!output) throw new Error("Thiếu đường dẫn SQL output");
if (mode === "--promote-sql") {
  if (b.status !== "published")
    throw new Error("Khóa chưa được duyệt published");
  const quote = (v: unknown) => "'" + String(v).replaceAll("'", "''") + "'";
  const json = (v: unknown) => quote(JSON.stringify(v)) + "::jsonb";
  if (JSON.stringify(b).includes("$$"))
    throw new Error("Nội dung chứa $$ không được hỗ trợ");
  const sql = [
    "begin;",
    "set local standard_conforming_strings = on;",
    "select pg_advisory_xact_lock(72631012);",
  ];
  sql.push(
    `do $$ begin if not exists(select 1 from public.courses where id=${quote(b.courseId)} and syllabus_version=${quote(b.syllabus.version)} and curriculum_family=${quote(b.syllabus.family)}) then raise exception 'COURSE_MISMATCH'; end if; end $$;`,
  );
  for (const ref of b.references)
    sql.push(
      `do $$ begin if not exists(select 1 from public.lessons where id=${quote(ref.id)} and is_published and content_json->'learning'=${json(ref)}) then raise exception 'REFERENCE_MISMATCH'; end if; end $$;`,
    );
  for (const raw of b.lessons.filter((l) => l.status === "published")) {
    const original = compiled.find((l) => l.id === raw.id)!;
    const l = { ...original, learning: { ...raw, status: "draft" as const } };
    const questions = l.questions.map((q) => ({
      ...q,
      key: questionKey(q),
      targets: assessedWords(q, l.words).map((w) => w.hanzi),
    }));
    const expected = { ...l, questions };
    sql.push(
      `do $$ begin if not exists(select 1 from public.lessons where id=${quote(l.id)} and unit_id=${quote(raw.chapterId)} and content_json #- '{learning,status}' = ${json(expected)} #- '{learning,status}') then raise exception 'DRAFT_CONTENT_MISMATCH'; end if; end $$;`,
    );
    sql.push(
      `update public.lessons set is_published=true,content_json=jsonb_set(content_json,'{learning,status}','"published"') where id=${quote(l.id)};`,
    );
    for (const w of l.words)
      sql.push(
        `update public.vocabulary set is_published=true where id=${quote(w.hanzi)};`,
      );
  }
  sql.push(
    `update public.courses set is_published=true where id=${quote(b.courseId)};`,
    "commit;",
    "",
  );
  writeFileSync(output, sql.join("\n"), { encoding: "utf8", flag: "wx" });
  console.log(
    `Đã tạo ${output}: chỉ xuất bản draft khớp hoàn toàn, không đổi nội dung bài.`,
  );
  process.exit(0);
}
const publish = mode === "--publish-sql";
if (publish && b.status !== "published")
  throw new Error(
    "Khóa đang draft; duyệt nội dung và đặt status published trước",
  );
const quote = (v: unknown) => "'" + String(v).replaceAll("'", "''") + "'";
const json = (v: unknown) => quote(JSON.stringify(v)) + "::jsonb";
// SQL string literals use standard_conforming_strings; dollar quotes are never used for input.
const sql = [
  "-- Additive import; no user/progress data is modified. Back up production first.",
  "begin;",
  "set local standard_conforming_strings = on;",
  "select pg_advisory_xact_lock(72631012);",
];
const guard = (condition: string, message: string) =>
  sql.push(
    `do $$ begin if ${condition} then raise exception ${quote(message)}; end if; end $$;`,
  );
// Ensure input cannot terminate a DO dollar quote, even inside its SQL string literals.
for (const value of [JSON.stringify(b)])
  if (value.includes("$$"))
    throw new Error("Nội dung chứa ký hiệu SQL không được hỗ trợ: $$");
for (const ref of b.references)
  guard(
    `not exists(select 1 from public.lessons where id=${quote(ref.id)} and is_published and content_json->'learning'=${json(ref)})`,
    "REFERENCE_MISMATCH",
  );
guard(
  `exists(select 1 from public.courses where id=${quote(b.courseId)} and (syllabus_version<>${quote(b.syllabus.version)} or curriculum_family<>${quote(b.syllabus.family)}))`,
  "COURSE_VERSION_CONFLICT",
);
sql.push(
  `insert into public.courses(id,title,syllabus_version,curriculum_family,hsk_level,sort_order,is_published) values(${quote(b.courseId)},${quote(b.title)},${quote(b.syllabus.version)},${quote(b.syllabus.family)},${b.syllabus.level ?? "null"},0,${publish}) on conflict(id) do nothing;`,
);
for (const c of b.chapters) {
  guard(
    `exists(select 1 from public.units where id=${quote(c.id)} and course_id<>${quote(b.courseId)})`,
    "CHAPTER_ID_CONFLICT",
  );
  sql.push(
    `insert into public.units(id,course_id,title,description,sort_order) values(${quote(c.id)},${quote(b.courseId)},${quote(c.title)},${quote(c.description)},(select coalesce(max(sort_order),-1)+1 from public.units where course_id=${quote(b.courseId)})) on conflict(id) do nothing;`,
  );
}
const allWords = [
  ...new Map(
    compiled.flatMap((l) => l.words).map((w) => [w.hanzi, w]),
  ).values(),
];
for (const w of allWords) {
  guard(
    `exists(select 1 from public.vocabulary where id=${quote(w.hanzi)} and (pinyin<>${quote(w.pinyin)} or meaning_vi<>${quote(w.meaning)}))`,
    "VOCABULARY_CONFLICT_REVIEW_READING_AND_MEANING",
  );
  const visible =
    publish &&
    compiled.some(
      (l) =>
        l.learning?.status === "published" &&
        l.words.some((word) => word.hanzi === w.hanzi),
    );
  sql.push(
    `insert into public.vocabulary(id,hanzi,pinyin,meaning_vi,syllabus_version,is_published) values(${quote(w.hanzi)},${quote(w.hanzi)},${quote(w.pinyin)},${quote(w.meaning)},${quote(b.syllabus.version)},${visible}) on conflict(id) do nothing;`,
  );
}
for (const raw of b.lessons) {
  const published = publish && raw.status === "published";
  const original = compiled.find((l) => l.id === raw.id)!;
  const l = {
    ...original,
    learning: {
      ...raw,
      status: published ? ("published" as const) : ("draft" as const),
    },
  };
  // Existing lessons are immutable in this import path, including the ten samples.
  guard(
    `exists(select 1 from public.lessons where id=${quote(l.id)})`,
    "LESSON_ID_EXISTS_USE_NEW_REVISION",
  );
  const questions = l.questions.map((q) => ({
    ...q,
    key: questionKey(q),
    targets: assessedWords(q, l.words).map((w) => w.hanzi),
  }));
  sql.push(
    `insert into public.lessons(id,unit_id,title,description,estimated_minutes,sort_order,content_json,is_published) values(${quote(l.id)},${quote(raw.chapterId)},${quote(l.title)},${quote(l.description)},${l.minutes},(select coalesce(max(sort_order),-1)+1 from public.lessons where unit_id=${quote(raw.chapterId)}),${json({ ...l, questions })},${published});`,
  );
  for (const q of questions)
    sql.push(
      `insert into private.question_bank(question_key,question_json) values(${quote(q.key)},${json(q)}) on conflict(question_key) do nothing;`,
    );
}
for (const l of b.lessons)
  for (const required of l.prerequisites)
    sql.push(
      `insert into public.lesson_prerequisites(lesson_id,requires_lesson_id) values(${quote(l.id)},${quote(required)});`,
    );
// Practice bank: use the same canonical questions as the existing client.
for (const w of allWords)
  for (const mode of ["meaning", "pinyin", "listen"]) {
    const q = {
      type: mode === "listen" ? ("listen" as const) : ("quiz" as const),
      prompt:
        mode === "listen"
          ? "Nghe và chọn chữ Hán"
          : mode === "pinyin"
            ? `Pinyin của ${w.hanzi} là gì?`
            : `“${w.hanzi}” có nghĩa là gì?`,
      audio: w.hanzi,
      answer:
        mode === "listen" ? w.hanzi : mode === "pinyin" ? w.pinyin : w.meaning,
      targets: [w.hanzi],
    };
    sql.push(
      `insert into private.question_bank(question_key,question_json) values(${quote(questionKey(q))},${json(q)}) on conflict(question_key) do nothing;`,
    );
  }
sql.push("commit;", "");
writeFileSync(output, sql.join("\n"), { encoding: "utf8", flag: "wx" });
console.log(
  `Đã tạo ${output}; trạng thái ${publish ? "published" : "draft"}. Không ghi đè file SQL hay bài đã tồn tại.`,
);
