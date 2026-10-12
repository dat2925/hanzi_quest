import type { Lesson } from "../data";
import type { Learning } from "./schema";
import { assessedWords } from "../engine";
export function adaptLesson(l: Learning): Lesson {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    minutes: l.minutes,
    guide: l.screens[0].body,
    words: [
      ...new Map(
        l.screens
          .flatMap((s) => (s.kind === "vocabulary" ? s.words : []))
          .map((w) => [w.hanzi, w]),
      ).values(),
    ],
    questions: l.screens.flatMap((s) =>
      s.kind === "exercise"
        ? [{ ...s.question, contentId: `${l.id}:${s.id}` }]
        : [],
    ),
    writing: l.screens.find((s) => s.kind === "notebook")?.body || "",
    learning: l,
    prerequisites: l.prerequisites,
  };
}

// Carry prerequisite vocabulary into a compiled lesson so SRS also covers recall of older words.
export function compileBundle(b: import("./schema").Bundle): Lesson[] {
  const source = new Map([...b.lessons, ...b.references].map((l) => [l.id, l]));
  const collect = (l: Learning): Lesson["words"] => [
    ...adaptLesson(l).words,
    ...l.prerequisites.flatMap((id) => collect(source.get(id)!)),
  ];
  return b.lessons.map((l) => {
    const lesson = adaptLesson(l);
    const required = collect(l).filter(
      (w) =>
        lesson.words.some((taught) => taught.hanzi === w.hanzi) ||
        lesson.questions.some((q) => assessedWords(q, [w]).length),
    );
    return {
      ...lesson,
      words: [...new Map(required.map((w) => [w.hanzi, w])).values()],
    };
  });
}
