import { supabase } from "../cloud/client";
import { parseCurriculumResponse } from "../cloud/curriculum-data";
import { installCurriculum, lessons, type Lesson } from "../data";

// Read through the learner's RLS, never through the admin service role or draft store.
export async function publishedLesson(id: string): Promise<Lesson | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from("lessons")
    .select(
      "id,content_json,sort_order,units!inner(sort_order,course_id,courses!inner(sort_order))",
    )
    .eq("id", id)
    .eq("is_published", true);
  if (error) throw error;
  if (!data?.length) return undefined;
  const lesson = parseCurriculumResponse(data)[0];
  if (lesson.learning && lesson.learning.status !== "published")
    throw new Error("Bài học chưa được xuất bản hợp lệ.");
  const edges = await supabase
    .from("lesson_prerequisites")
    .select("requires_lesson_id")
    .eq("lesson_id", id);
  if (edges.error) throw edges.error;
  const trusted = {
    ...lesson,
    prerequisites: (edges.data || []).map((r) => r.requires_lesson_id),
  };
  installCurriculum([...lessons.filter((l) => l.id !== id), trusted]);
  return trusted;
}
