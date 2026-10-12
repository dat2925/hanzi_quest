import { gameSnapshotSchema } from "../game-state";
import { installCurriculum } from "../data";
import { supabase } from "./client";
export async function loadCurriculum() {
  const { data, error } = await supabase!
    .from("lessons")
    .select(
      "content_json,sort_order,units!inner(sort_order,courses!inner(sort_order))",
    )
    .eq("is_published", true)
    .order("sort_order");
  if (error)
    throw new Error(
      "Không tải được giáo trình. Kiểm tra migrations và quyền đọc.",
    );
  if (!data?.length)
    throw new Error(
      "Chưa có giáo trình đã xuất bản. Chạy migration bài mẫu trước.",
    );
  const rows = [...data] as unknown as {
    content_json: unknown;
    sort_order: number;
    units: { sort_order: number; courses: { sort_order: number } };
  }[];
  rows.sort(
    (a, b) =>
      a.units.courses.sort_order - b.units.courses.sort_order ||
      a.units.sort_order - b.units.sort_order ||
      a.sort_order - b.sort_order,
  );
  installCurriculum(
    rows.map((r) => gameSnapshotSchema.shape.lesson.parse(r.content_json)),
  );
}
