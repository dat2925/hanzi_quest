import { supabase } from "./client";
import {
  CurriculumError,
  installCurriculumResponse,
  safeErrorMessage,
} from "./curriculum-data";
export async function loadCurriculum() {
  if (!supabase)
    throw new CurriculumError("request", "Supabase client chưa được cấu hình.");
  const { data, error } = await supabase!
    .from("lessons")
    .select(
      "id,content_json,sort_order,units!inner(sort_order,courses!inner(sort_order))",
    )
    .eq("is_published", true)
    .order("sort_order");
  if (error)
    throw new CurriculumError(
      "request",
      `Supabase lessons: ${safeErrorMessage(error)}`,
    );
  return installCurriculumResponse(data);
}
