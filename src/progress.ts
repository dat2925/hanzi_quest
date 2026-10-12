import { z } from "zod";
const reviewSchema = z.object({
  due: z.number(),
  interval: z.number(),
  attempts: z.number(),
  correct: z.number(),
});
export const progressSchema = z.object({
  name: z.string(),
  goal: z.string(),
  daily: z.number().positive(),
  time: z.string(),
  experience: z.string(),
  onboarded: z.boolean(),
  xp: z.number().nonnegative(),
  completed: z.array(z.string()),
  history: z.array(
    z.object({
      date: z.string(),
      minutes: z.number(),
      xp: z.number(),
      lesson: z.string(),
      accuracy: z.number(),
    }),
  ),
  reviews: z.record(z.string(), reviewSchema),
  difficult: z.array(z.string()),
  notes: z.string(),
  written: z.array(z.string()),
  dark: z.boolean(),
  sound: z.boolean(),
});
export type Progress = z.infer<typeof progressSchema>;
export const initial: Progress = {
  name: "bạn",
  goal: "HSK 1",
  daily: 15,
  time: "20:00",
  experience: "Mới bắt đầu",
  onboarded: false,
  xp: 0,
  completed: [],
  history: [],
  reviews: {},
  difficult: [],
  notes: "",
  written: [],
  dark: false,
  sound: true,
};
export const STORAGE_KEY = "hanzi-quest-v1";
export const dateKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function load(): Progress {
  try {
    return progressSchema.parse(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
    );
  } catch {
    return { ...initial };
  }
}
export function schedule(
  previous: Progress["reviews"][string] | undefined,
  correct: boolean,
  now = Date.now(),
) {
  const interval = correct
    ? previous
      ? Math.min(30, Math.max(1, previous.interval * 2))
      : 1
    : 0;
  return {
    due: now + (correct ? interval * 86400000 : 600000),
    interval,
    attempts: (previous?.attempts || 0) + 1,
    correct: (previous?.correct || 0) + (correct ? 1 : 0),
  };
}
export function complete(
  p: Progress,
  id: string,
  accuracy: number,
  seconds: number,
  answers: { hanzi: string; correct: boolean }[],
  now = Date.now(),
): Progress {
  const first = !p.completed.includes(id);
  const xp =
    id === "practice" ? 10 : first ? Math.round(20 + accuracy * 20) : 10;
  const reviews = { ...p.reviews };
  const assessed = new Map<string, boolean>();
  for (const a of answers)
    assessed.set(a.hanzi, (assessed.get(a.hanzi) ?? true) && a.correct);
  for (const [hanzi, correct] of assessed)
    reviews[hanzi] = schedule(reviews[hanzi], correct, now);
  return {
    ...p,
    xp: p.xp + xp,
    completed:
      first && accuracy >= 0.7 && id !== "practice"
        ? [...p.completed, id]
        : p.completed,
    reviews,
    history: [
      ...p.history,
      {
        date: dateKey(new Date(now)),
        minutes: Math.max(1, Math.round(seconds / 60)),
        xp,
        lesson: id,
        accuracy,
      },
    ],
    difficult: [
      ...new Set([
        ...p.difficult,
        ...answers.filter((a) => !a.correct).map((a) => a.hanzi),
      ]),
    ],
  };
}
export function streak(p: Progress, now = new Date()) {
  const dates = new Set(p.history.map((h) => h.date));
  let n = 0;
  const d = new Date(now);
  if (!dates.has(dateKey(d))) d.setDate(d.getDate() - 1);
  while (dates.has(dateKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
export function available(p: Progress, index: number, ids: string[]) {
  return (
    index === 0 ||
    p.completed.includes(ids[index - 1]) ||
    p.completed.includes(ids[index])
  );
}

// Legacy samples keep their own sequence; foundation lessons use explicit prerequisites.
export function canStudy(
  p: Progress,
  lesson: import("./data").Lesson,
  catalog: import("./data").Lesson[],
) {
  if (p.completed.includes(lesson.id)) return true;
  const required = lesson.prerequisites ?? lesson.learning?.prerequisites;
  if (required) return required.every((id) => p.completed.includes(id));
  const samples = catalog.filter((l) => !l.learning);
  const index = samples.findIndex((l) => l.id === lesson.id);
  return (
    index === 0 || (index > 0 && p.completed.includes(samples[index - 1].id))
  );
}
