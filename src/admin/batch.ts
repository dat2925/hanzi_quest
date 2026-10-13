import {
  bundleSchema,
  learningSchema,
  validateBundle,
  type Bundle,
  type Learning,
} from "../learning/schema";
import { compileBundle } from "../learning/adapter";
import { assessedWords } from "../engine";
import { questionKey } from "../cloud/operations";
import type { AdminCatalog } from "./types";

export function courseBundle(catalog: AdminCatalog, courseId: string): Bundle {
  const c = catalog.courses.find((c) => c.id === courseId);
  if (!c || c.curriculum_family === "sample")
    throw new Error("SELECT_V2_COURSE");
  return {
    schemaVersion: 2,
    courseId,
    title: c.title,
    syllabus: {
      family: c.curriculum_family,
      version: c.syllabus_version,
      ...(c.hsk_level ? { level: c.hsk_level } : {}),
    },
    status: "draft",
    chapters: catalog.chapters,
    lessons: [],
    references: [],
  };
}

export function prepareBatch(
  value: unknown,
  catalog: AdminCatalog,
  mode: "save" | "review" | "publish",
  expected: Record<string, number> = {},
) {
  const b = bundleSchema.parse(value);
  const course = catalog.courses.find((c) => c.id === b.courseId);
  if (
    course &&
    (course.curriculum_family !== b.syllabus.family ||
      course.syllabus_version !== b.syllabus.version ||
      (course.hsk_level ?? null) !== (b.syllabus.level ?? null))
  )
    throw new Error("COURSE_VERSION_CONFLICT");
  if (b.lessons.length < 1 || b.lessons.length > 20)
    throw new Error("BATCH_SIZE_1_TO_20");
  if (b.status !== "draft" || b.lessons.some((l) => l.status !== "draft"))
    throw new Error("IMPORT_DRAFT_ONLY");
  if (
    /TODO|CẦN ĐỐI CHIẾU|Điền lời giảng|Điền lý thuyết trước khi hỏi|Điền mục tiêu và phạm vi từ tài liệu nguồn|Bản nháp chưa biên soạn/i.test(
      JSON.stringify(b.lessons),
    )
  )
    throw new Error(
      "Nội dung còn placeholder hoặc OCR chưa đối chiếu; cần hoàn thiện trước khi nhập.",
    );
  // New editorial lessons follow the seven-stage HanziOne format. Existing references may be older v2 lessons.
  const sequence = [
    "objective",
    "pronunciation",
    "vocabulary",
    "recall",
    "notebook",
    "assessment",
    "srs",
  ];
  for (const l of b.lessons)
    if (l.screens.map((s) => s.kind).join() !== sequence.join())
      throw new Error(
        `${l.id}: Cần đủ 7 màn theo thứ tự mục tiêu, phát âm, từ vựng, tự nhớ, viết, kiểm tra, SRS.`,
      );
  const existing = new Map<string, Learning>();
  const guards = new Map<string, unknown>();
  for (const row of catalog.lessons)
    if (row.content_json.learning) {
      existing.set(
        row.id,
        learningSchema.parse({
          ...row.content_json.learning,
          status: row.is_published ? "published" : "draft",
        }),
      );
      guards.set(row.id, {
        kind: "public",
        id: row.id,
        content: row.content_json,
        published: row.is_published,
      });
    }
  for (const d of catalog.drafts) {
    if (catalog.lessons.some((l) => l.id === d.lesson_id && l.is_published))
      continue;
    existing.set(d.lesson_id, learningSchema.parse(d.learning_json));
    guards.set(d.lesson_id, {
      kind: "draft",
      id: d.lesson_id,
      revision: d.revision,
      learning: d.learning_json,
    });
  }
  const incoming = new Map(b.lessons.map((l) => [l.id, l]));
  if (incoming.size !== b.lessons.length)
    throw new Error("DUPLICATE_LESSON_ID");
  for (const l of b.lessons) {
    const old = catalog.lessons.find((r) => r.id === l.id);
    const d = catalog.drafts.find((r) => r.lesson_id === l.id);
    if (old && (old.is_published || !old.content_json.learning))
      throw new Error(`${l.id}: PUBLISHED_OR_LEGACY_IMMUTABLE`);
    if (d || old) {
      if (expected[l.id] !== (d?.revision ?? 0))
        throw new Error(
          `${l.id}: LESSON_ID_EXISTS_USE_NEW_REVISION hoặc DRAFT_REVISION_CONFLICT`,
        );
    } else if (mode !== "save" || expected[l.id] !== undefined)
      throw new Error(`${l.id}: DRAFT_REVISION_CONFLICT`);
  }
  // Resolve prerequisites from authoritative DB sources, never trust uploaded references as facts.
  const refs = new Map<string, Learning>();
  const usedGuards: unknown[] = [];
  const visit = (id: string, path: string[] = []) => {
    if (path.includes(id))
      throw new Error(`prerequisite có vòng lặp: ${[...path, id].join(" → ")}`);
    const l = incoming.get(id) || existing.get(id);
    if (!l) throw new Error(`Thiếu prerequisite ${id}`);
    if (!incoming.has(id) && !refs.has(id)) {
      refs.set(id, l);
      usedGuards.push(guards.get(id));
    }
    for (const dep of l.prerequisites) visit(dep, [...path, id]);
  };
  b.lessons.forEach((l) => visit(l.id));
  for (const supplied of b.references) {
    const actual = existing.get(supplied.id);
    if (!actual || JSON.stringify(actual) !== JSON.stringify(supplied))
      throw new Error(`${supplied.id}: REFERENCE_MISMATCH`);
  }
  b.references = [...refs.values()];
  const checked = validateBundle(b);
  if (mode === "publish")
    validateBundle({
      ...checked,
      status: "published",
      lessons: checked.lessons.map((l) => ({ ...l, status: "published" })),
    });
  const ordered: Learning[] = [],
    seen = new Set<string>();
  const order = (l: Learning) => {
    if (seen.has(l.id)) return;
    seen.add(l.id);
    for (const id of l.prerequisites)
      if (incoming.has(id)) order(incoming.get(id)!);
    ordered.push(l);
  };
  checked.lessons.forEach(order);
  checked.lessons = ordered;
  const compiled = compileBundle(checked);
  const rows = compiled.map((l) => {
    const questions = l.questions.map((q) => ({
      ...q,
      key: questionKey(q),
      targets: assessedWords(q, l.words).map((w) => w.hanzi),
    }));
    const bank = questions.map((q) => ({ key: q.key, question: q }));
    for (const w of l.words)
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
            mode === "listen"
              ? w.hanzi
              : mode === "pinyin"
                ? w.pinyin
                : w.meaning,
          targets: [w.hanzi],
        };
        bank.push({
          key: questionKey(q),
          question: q as (typeof questions)[number],
        });
      }
    return {
      id: l.id,
      learning: l.learning!,
      course: {
        id: checked.courseId,
        title: checked.title,
        syllabus: checked.syllabus,
      },
      chapter: checked.chapters.find((c) => c.id === l.learning!.chapterId)!,
      expected_revision: expected[l.id] ?? null,
      base_content:
        catalog.lessons.find((r) => r.id === l.id)?.content_json ?? null,
      content: { ...l, questions },
      bank,
    };
  });
  return { bundle: checked, rows, refs: usedGuards, lessons: compiled };
}

export function selectedBatch(
  catalog: AdminCatalog,
  courseId: string,
  ids: string[],
) {
  const b = courseBundle(catalog, courseId);
  b.lessons = ids.map((id) => {
    const d = catalog.drafts.find((d) => d.lesson_id === id);
    if (!d) throw new Error(`${id}: DRAFT_NOT_FOUND`);
    return d.learning_json;
  });
  return b;
}
