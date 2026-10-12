import type { Question } from "../data";
import type { Progress } from "../progress";
import type { GameSnapshot } from "../game-state";
import type { Json, Operation } from "./database.types";
export function questionKey(
  q: Pick<Question, "type" | "prompt" | "audio" | "contentId">,
) {
  const parts = [q.type, q.prompt, q.audio || ""];
  // Keep all legacy keys stable; v2 activities have identity independent of their wording.
  if (q.contentId) parts.push(q.contentId);
  return JSON.stringify(parts);
}
export function operation(
  kind: Operation["kind"],
  payload: unknown,
  id: string = crypto.randomUUID(),
): Operation {
  return { id, kind, payload: payload as Json };
}
export function finishOperation(
  state: GameSnapshot,
  seconds: number,
): Operation {
  return operation(
    "finish",
    {
      lessonId: state.lesson.id,
      seconds: Math.round(seconds),
      endedAt: Date.now(),
      questions: state.questions.map((q, i) => ({
        key: questionKey(q),
        selection: state.responses[i]?.selection || "",
        assisted: state.responses[i]?.assisted || false,
      })),
    },
    state.sessionId,
  );
}
export function patchOperations(
  previous: Progress,
  patch: Partial<Progress>,
): Operation[] {
  const ops: Operation[] = [];
  const profile: Record<string, unknown> = {};
  for (const key of [
    "name",
    "goal",
    "daily",
    "time",
    "experience",
    "onboarded",
    "dark",
    "sound",
  ] as const)
    if (key in patch && patch[key] !== previous[key]) profile[key] = patch[key];
  if (Object.keys(profile).length) ops.push(operation("profile", profile));
  if (patch.notes !== undefined && patch.notes !== previous.notes)
    ops.push(operation("note", { base: previous.notes, value: patch.notes }));
  if (patch.reviews)
    for (const [hanzi, r] of Object.entries(patch.reviews))
      if (r.attempts > (previous.reviews[hanzi]?.attempts || 0))
        ops.push(
          operation("review", {
            hanzi,
            correct: r.correct > (previous.reviews[hanzi]?.correct || 0),
          }),
        );
  if (patch.difficult)
    for (const hanzi of new Set([...previous.difficult, ...patch.difficult]))
      if (
        previous.difficult.includes(hanzi) !== patch.difficult.includes(hanzi)
      )
        ops.push(
          operation("difficult", {
            hanzi,
            value: patch.difficult.includes(hanzi),
          }),
        );
  if (patch.written)
    for (const key of new Set([...previous.written, ...patch.written]))
      if (previous.written.includes(key) !== patch.written.includes(key))
        ops.push(
          operation("task", { key, completed: patch.written.includes(key) }),
        );
  return ops;
}
export function optimistic(p: Progress, op: Operation): Progress {
  const payload = op.payload as Record<string, any>;
  if (op.kind === "profile") return { ...p, ...payload };
  if (op.kind === "note") return { ...p, notes: payload.value };
  if (op.kind === "task")
    return {
      ...p,
      written: payload.completed
        ? [...new Set([...p.written, payload.key])]
        : p.written.filter((k) => k !== payload.key),
    };
  if (op.kind === "difficult")
    return {
      ...p,
      difficult: payload.value
        ? [...new Set([...p.difficult, payload.hanzi])]
        : p.difficult.filter((k) => k !== payload.hanzi),
    };
  return p;
}
