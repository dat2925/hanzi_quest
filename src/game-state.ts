import { z } from "zod";
import { learningSchema } from "./learning/schema";
import type { Lesson, Question } from "./data";
const question = z.object({
  contentId: z.string().optional(),
  type: z.enum(["quiz", "listen", "sentence", "match", "tone"]),
  prompt: z.string(),
  options: z.array(z.string()),
  answer: z.string(),
  explanation: z.string(),
  audio: z.string().optional(),
  hint: z.string().optional(),
});
export const gameSnapshotSchema = z.object({
  sessionId: z.uuid(),
  lesson: z.object({
    learning: learningSchema.optional(),
    prerequisites: z.array(z.string()).optional(),
    id: z.string(),
    title: z.string(),
    description: z.string(),
    guide: z.string(),
    words: z.array(
      z.object({ hanzi: z.string(), pinyin: z.string(), meaning: z.string() }),
    ),
    questions: z.array(question),
    writing: z.string(),
    minutes: z.number(),
  }),
  screenIndex: z.number().int().nonnegative().default(0),
  practice: z.boolean(),
  step: z.number().int().min(-1),
  score: z.number().int().nonnegative(),
  startedAt: z.number(),
  questions: z.array(question),
  responses: z.array(
    z.object({ selection: z.string(), assisted: z.boolean() }),
  ),
  results: z.array(z.object({ hanzi: z.string(), correct: z.boolean() })),
  wrote: z.boolean(),
  feedback: z.boolean().nullable().default(null),
  selection: z.string().default(""),
  tokens: z.array(z.number().int()).default([]),
  assisted: z.boolean().default(false),
  recallRatings: z
    .record(z.string(), z.object({ hanzi: z.string(), correct: z.boolean() }))
    .default({}),
});
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;
export function newGame(
  lesson: Lesson,
  practice: boolean,
  questions: Question[],
): GameSnapshot {
  return {
    sessionId: crypto.randomUUID(),
    lesson,
    practice,
    step: lesson.learning ? 0 : -1,
    screenIndex: 0,
    score: 0,
    startedAt: Date.now(),
    questions,
    responses: [],
    results: [],
    wrote: false,
    feedback: null,
    selection: "",
    tokens: [],
    assisted: false,
    recallRatings: {},
  };
}
