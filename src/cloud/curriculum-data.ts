import { z } from "zod";
import { gameSnapshotSchema } from "../game-state";
import { installCurriculum, type Lesson } from "../data";
type Issue = { lesson: string; path: string; code: string; message: string };
export function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "Lỗi không có thông điệp.";
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED_JWT]",
    )
    .replace(
      /\b(?:sb_(?:secret|publishable)_|gh[pousr]_)[A-Za-z0-9_-]+/g,
      "[REDACTED_KEY]",
    )
    .replace(
      /((?:access_token|refresh_token|token|api_key)=)[^\s&]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 2000);
}
export class CurriculumError extends Error {
  constructor(
    readonly stage: "response" | "validation" | "install" | "request" | "cache",
    message: string,
    readonly issues: Issue[] = [],
  ) {
    super(safeErrorMessage(new Error(message)));
    this.name = "CurriculumError";
  }
}
export function logCurriculumError(error: unknown, stage = "load") {
  // Deliberately do not log the error object, request, response, headers, session or payload.
  console.error("[HanziOne] curriculum", {
    stage: error instanceof CurriculumError ? error.stage : stage,
    name: error instanceof Error ? error.name : "Error",
    message: safeErrorMessage(error),
    issues: error instanceof CurriculumError ? error.issues : [],
  });
}
const order = z.number().int().nonnegative();
const rowSchema = z.object({
  id: z.string().optional(),
  sort_order: order,
  content_json: z.unknown(),
  units: z.object({
    sort_order: order,
    courses: z.object({ sort_order: order }),
  }),
});
function label(value: unknown, index: number) {
  const row = value as { id?: unknown; content_json?: { id?: unknown } } | null;
  const id =
    row && typeof row === "object"
      ? (row.id ?? row.content_json?.id)
      : undefined;
  return typeof id === "string"
    ? safeErrorMessage(new Error(id)).slice(0, 100)
    : `row[${index}]`;
}
function issuesFor(
  result: z.ZodError,
  lesson: string,
  prefix: string,
): Issue[] {
  return result.issues.map((i) => ({
    lesson,
    path: [prefix, ...i.path].filter(String).join("."),
    code: i.code,
    message: safeErrorMessage(new Error(i.message)),
  }));
}
export function parseCurriculumResponse(data: unknown): Lesson[] {
  const collection = z.array(z.unknown()).min(1).safeParse(data);
  if (!collection.success)
    throw new CurriculumError(
      "response",
      "Response lessons phải là một mảng không rỗng.",
      issuesFor(collection.error, "lessons", "response"),
    );
  const rows: {
    lesson: Lesson;
    course: number;
    unit: number;
    order: number;
    index: number;
  }[] = [];
  const issues: Issue[] = [];
  const ids = new Set<string>();
  for (const [index, value] of collection.data.entries()) {
    const name = label(value, index),
      row = rowSchema.safeParse(value);
    if (!row.success) {
      issues.push(...issuesFor(row.error, name, `rows.${index}`));
      continue;
    }
    const lesson = gameSnapshotSchema.shape.lesson.safeParse(
      row.data.content_json,
    );
    if (!lesson.success) {
      issues.push(
        ...issuesFor(lesson.error, name, `rows.${index}.content_json`),
      );
      continue;
    }
    if (row.data.id && row.data.id !== lesson.data.id)
      issues.push({
        lesson: name,
        path: `rows.${index}.content_json.id`,
        code: "id_mismatch",
        message: "ID content_json không khớp ID lessons.",
      });
    if (ids.has(lesson.data.id))
      issues.push({
        lesson: name,
        path: `rows.${index}.content_json.id`,
        code: "duplicate_id",
        message: "ID bài học bị trùng.",
      });
    ids.add(lesson.data.id);
    rows.push({
      lesson: lesson.data,
      course: row.data.units.courses.sort_order,
      unit: row.data.units.sort_order,
      order: row.data.sort_order,
      index,
    });
  }
  if (issues.length)
    throw new CurriculumError(
      "validation",
      `Giáo trình không hợp lệ: ${issues.map((i) => `${i.lesson}: ${i.path} (${i.message})`).join("; ")}`,
      issues,
    );
  return rows
    .sort(
      (a, b) =>
        a.course - b.course ||
        a.unit - b.unit ||
        a.order - b.order ||
        a.index - b.index,
    )
    .map((r) => r.lesson);
}
export function installCurriculumResponse(
  data: unknown,
  install: (lessons: Lesson[]) => void = installCurriculum,
): Lesson[] {
  const lessons = parseCurriculumResponse(data);
  try {
    install(lessons);
  } catch (error) {
    throw new CurriculumError(
      "install",
      `installCurriculum: ${safeErrorMessage(error)}`,
    );
  }
  return lessons;
}
