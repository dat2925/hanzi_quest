import { lessons, installCurriculum } from "../data";
import { supabase } from "./client";
import {
  CurriculumError,
  installCurriculumResponse,
  safeErrorMessage,
} from "./curriculum-data";
export async function loadCurriculum(
  courseId = "beginner-v1",
  chapterId?: string,
  lessonId?: string,
) {
  if (!supabase)
    throw new CurriculumError("request", "Supabase client chưa được cấu hình.");
  let query = supabase!
    .from("lessons")
    .select(
      "id,content_json,sort_order,units!inner(sort_order,course_id,courses!inner(sort_order))",
    )
    .eq("is_published", true)
    .eq("units.course_id", courseId)
    .order("sort_order");
  if (chapterId) query = query.eq("unit_id", chapterId);
  if (lessonId) query = query.eq("id", lessonId);
  // Page to avoid PostgREST default row caps; one chapter/course only.
  const rows: unknown[] = [];
  for (let from = 0; ; from += 100) {
    const { data, error } = await query.range(from, from + 99);
    if (error)
      throw new CurriculumError(
        "request",
        `Supabase lessons: ${safeErrorMessage(error)}`,
      );
    rows.push(...(data || []));
    if (!data || data.length < 100) break;
  }
  if (!rows.length) return [];
  return installCurriculumResponse(rows, (incoming) =>
    installCurriculum([
      ...lessons.filter((l) => !incoming.some((n) => n.id === l.id)),
      ...incoming,
    ]),
  );
}

export async function loadCourseIndex() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("courses")
    .select("id,title,syllabus_version")
    .eq("is_published", true)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}
export async function loadChapterIndex(courseId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("units")
    .select("id,title,description")
    .eq("course_id", courseId)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}
