import { z } from "zod";
const text = z.string().trim().min(1).max(10000);
const id = z.string().regex(/^[a-z][a-z0-9-]{1,99}$/);
const url = z
  .url()
  .refine((v) => v.startsWith("https://"), "Media phải dùng HTTPS");
const pinyin = text
  .regex(
    /^[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňḿ\s'’-]+$/u,
    "Pinyin dùng chữ Latin và dấu thanh",
  )
  .refine(
    (value) =>
      value.split(/[\s'’-]+/).every((s) => {
        const plain = s
          .toLowerCase()
          .replace(/[üǖǘǚǜ]/g, "v")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return /^(?:(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:a|o|e|ai|ei|ao|ou|an|en|ang|eng|ong|i|ia|ie|iao|iu|ian|in|iang|ing|iong|u|ua|uo|uai|ui|uan|un|uang|ueng|v|ve|van|vn)|er|m|n|ng)$/.test(
          plain,
        );
      }),
    "Pinyin cần âm tiết hợp lệ, tách âm tiết bằng khoảng trắng",
  );
export const wordSchema = z.object({
  hanzi: text.regex(/^[\p{Script=Han}]+$/u),
  pinyin,
  meaning: text,
  tones: z.array(z.number().int().min(0).max(4)).min(1),
  example: z.object({ hanzi: text, pinyin, meaning: text }),
});
export const questionSchema = z
  .object({
    type: z.enum(["quiz", "listen", "sentence", "match", "tone"]),
    prompt: text,
    options: z.array(text).min(2),
    answer: text,
    explanation: text,
    hint: text,
    audio: text.optional(),
    knowledge: z.array(id).min(1),
  })
  .superRefine((q, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (new Set(q.options).size !== q.options.length) issue("Lựa chọn trùng");
    if (q.type === "match") {
      const pairs = q.options.map((x) => x.split("|"));
      if (
        q.answer !== "matched" ||
        pairs.some((x) => x.length !== 2 || x.some((v) => !v.trim())) ||
        new Set(pairs.map((x) => x[0])).size !== pairs.length ||
        new Set(pairs.map((x) => x[1])).size !== pairs.length
      )
        issue("Cặp ghép không hợp lệ");
    } else if (q.type === "sentence") {
      const tokens = [...q.options];
      let rest = q.answer;
      while (rest) {
        const i = tokens.findIndex((t) => rest.startsWith(t));
        if (i < 0) break;
        rest = rest.slice(tokens[i].length);
        tokens.splice(i, 1);
      }
      if (rest || tokens.length) issue("Đáp án xếp câu không khớp các từ");
    } else if (!q.options.includes(q.answer))
      issue("Đáp án không nằm trong lựa chọn");
    if (q.type === "listen" && !q.audio) issue("Câu nghe thiếu nội dung audio");
  });
const common = {
  id,
  title: text,
  body: text,
  introduces: z.array(id).default([]),
  image: z.object({ url, alt: text }).optional(),
  audioUrl: url.optional(),
  examples: z
    .array(z.object({ hanzi: text, pinyin, meaning: text }))
    .default([]),
  steps: z.array(text).default([]),
};
export const screenSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.enum([
      "objective",
      "explanation",
      "pronunciation",
      "review",
      "srs",
    ]),
    speech: text.optional(),
  }),
  z.object({
    ...common,
    kind: z.literal("vocabulary"),
    words: z.array(wordSchema).min(1),
  }),
  z.object({
    ...common,
    kind: z.literal("notebook"),
    checklist: z.array(text).min(1),
  }),
  z.object({
    ...common,
    kind: z.literal("exercise"),
    phase: z.enum(["practice", "application", "final"]),
    question: questionSchema,
  }),
]);
export const learningSchema = z.object({
  schemaVersion: z.literal(2),
  id,
  chapterId: id,
  title: text,
  description: text,
  minutes: z.number().int().min(1).max(120),
  difficulty: z.number().int().min(1).max(10),
  status: z.enum(["draft", "published"]),
  prerequisites: z.array(id),
  screens: z.array(screenSchema).min(9),
});
export const bundleSchema = z.object({
  schemaVersion: z.literal(2),
  courseId: id,
  title: text,
  syllabus: z.object({
    family: z.enum(["foundation", "HSK"]),
    version: text,
    level: z.number().int().min(1).max(9).optional(),
  }),
  status: z.enum(["draft", "published"]),
  chapters: z.array(z.object({ id, title: text, description: text })).min(1),
  lessons: z.array(learningSchema),
  references: z.array(learningSchema).default([]),
});
export type Learning = z.infer<typeof learningSchema>;
export type Screen = z.infer<typeof screenSchema>;
export type Bundle = z.infer<typeof bundleSchema>;
export function validateBundle(value: unknown): Bundle {
  const b = bundleSchema.parse(value);
  const errors: string[] = [];
  if (b.syllabus.family === "HSK" && !b.syllabus.level)
    errors.push("HSK cần khai báo level và version cụ thể");
  const unique = (ids: string[], name: string) => {
    if (new Set(ids).size !== ids.length) errors.push(`${name}: ID trùng`);
  };
  unique(
    b.chapters.map((c) => c.id),
    "chapters",
  );
  unique(
    [...b.lessons, ...b.references].map((l) => l.id),
    "lessons/references",
  );
  const map = new Map([...b.lessons, ...b.references].map((l) => [l.id, l]));
  const ancestors = (l: Learning, path: string[] = []): Learning[] => {
    if (path.includes(l.id)) {
      errors.push(`${l.id}: prerequisite có vòng lặp`);
      return [];
    }
    return l.prerequisites.flatMap((id) => {
      const p = map.get(id);
      if (!p) {
        errors.push(`${l.id}: thiếu prerequisite ${id}`);
        return [];
      }
      if (l.status === "published" && p.status !== "published")
        errors.push(`${l.id}: prerequisite chưa xuất bản`);
      return [p, ...ancestors(p, [...path, l.id])];
    });
  };
  for (const l of [...b.lessons, ...b.references]) {
    if (l.screens[0].kind !== "objective")
      errors.push(`${l.id}: màn đầu cần là mục tiêu`);
    if (l.screens.filter((s) => s.kind === "exercise").length > 100)
      errors.push(`${l.id}: tối đa 100 câu hỏi, hãy chia thành bài nhỏ`);
    if (new TextEncoder().encode(JSON.stringify(l)).length > 100000)
      errors.push(`${l.id}: nội dung quá lớn, hãy chia thành bài nhỏ`);
    if (b.lessons.includes(l) && !b.chapters.some((c) => c.id === l.chapterId))
      errors.push(`${l.id}: chương không tồn tại`);
    unique(
      l.screens.map((s) => s.id),
      l.id + ".screens",
    );
    const parents = ancestors(l);
    const taughtPinyin = (screens: Screen[]) =>
      screens
        .flatMap((s) => [
          ...s.examples.map((e) => e.pinyin),
          ...(s.kind === "vocabulary" ? s.words.map((w) => w.pinyin) : []),
        ])
        .map((p) => p.toLowerCase());
    const knownPinyin = new Set(
      parents.flatMap((p) => taughtPinyin(p.screens)),
    );
    const known = new Set(
      parents.flatMap((p) => p.screens.flatMap((s) => s.introduces)),
    );
    const chars = new Set(
      parents.flatMap((p) =>
        p.screens.flatMap((s) =>
          s.kind === "vocabulary" ? s.words.flatMap((w) => [...w.hanzi]) : [],
        ),
      ),
    );
    let finals = 0;
    for (const s of l.screens) {
      if (s.kind === "exercise") {
        if (s.introduces.length)
          errors.push(
            `${s.id}: không được tự giới thiệu kiến thức trong câu hỏi`,
          );
        for (const k of s.question.knowledge)
          if (!known.has(k))
            errors.push(`${l.id}/${s.id}: kiến thức chưa dạy ${k}`);
        const q = s.question;
        if (
          q.type === "tone" ||
          (knownPinyin.has(q.answer.toLowerCase()) &&
            q.options.every((p) => pinyin.safeParse(p).success))
        ) {
          for (const p of q.options)
            if (!knownPinyin.has(p.toLowerCase()))
              errors.push(`${l.id}/${s.id}: Pinyin chưa giới thiệu ${p}`);
        }
        for (const ch of [q.prompt, ...q.options, q.answer, q.audio || ""]
          .join("")
          .match(/\p{Script=Han}/gu) || [])
          if (!chars.has(ch))
            errors.push(`${l.id}/${s.id}: chữ chưa giới thiệu ${ch}`);
        if (s.phase === "final") finals++;
      } else {
        taughtPinyin([s]).forEach((p) => knownPinyin.add(p));
        s.introduces.forEach((k) => known.add(k));
        if (s.kind === "vocabulary")
          for (const w of s.words) {
            if (
              w.tones.length !== w.pinyin.split(/[\s’'-]+/).length ||
              w.tones.length !== [...w.hanzi].length
            )
              errors.push(`${s.id}: số thanh điệu không khớp chữ Hán`);
            const marks = [/[āēīōūǖ]/, /[áéíóúǘńḿ]/, /[ǎěǐǒǔǚň]/, /[àèìòùǜ]/];
            w.pinyin.split(/[\s’'-]+/).forEach((syllable, i) => {
              const tone = marks.findIndex((re) => re.test(syllable)) + 1;
              if (tone !== w.tones[i])
                errors.push(`${s.id}: dấu thanh Pinyin không khớp tones`);
            });
            [...w.hanzi].forEach((c) => chars.add(c));
          }
      }
    }
    for (const kind of [
      "objective",
      "explanation",
      "vocabulary",
      "pronunciation",
      "notebook",
      "srs",
    ])
      if (!l.screens.some((s) => s.kind === kind))
        errors.push(`${l.id}: thiếu màn ${kind}`);
    if (
      !finals ||
      !l.screens.some((s) => s.kind === "exercise" && s.phase === "application")
    )
      errors.push(`${l.id}: thiếu luyện ứng dụng hoặc kiểm tra cuối bài`);
    if (l.screens.at(-1)?.kind !== "srs")
      errors.push(`${l.id}: SRS phải ở cuối bài`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return b;
}
