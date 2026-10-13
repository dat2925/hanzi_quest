import { useEffect, useRef, useState } from "react";
import type { Lesson } from "../data";
import { loadCurriculum } from "../cloud/curriculum";

// Only the local draft uses preview; study always uses the server-published content.
export function CurriculumLessonEntry({
  courseId,
  draft,
  label,
  title,
  description,
  prerequisiteLabel,
  cloud,
  onLoaded,
  onStudy,
  onPreview,
  isUnlocked,
  reloadKey,
}: {
  courseId: string;
  draft: Lesson;
  label: string;
  title: string;
  description: string;
  prerequisiteLabel: string;
  cloud: boolean;
  onLoaded: () => void;
  onStudy: (lesson: Lesson) => void;
  onPreview: (lesson: Lesson) => void;
  isUnlocked: (lesson: Lesson) => boolean;
  reloadKey: number;
}) {
  const [state, setState] = useState<
    | { status: "loading" | "local" | "unavailable" | "error" }
    | { status: "published"; lesson: Lesson }
  >({ status: cloud ? "loading" : "local" });
  const [retry, setRetry] = useState(0);
  const loaded = useRef(onLoaded);
  loaded.current = onLoaded;
  useEffect(() => {
    let active = true;
    setState({ status: cloud ? "loading" : "local" });
    if (cloud)
      loadCurriculum(courseId, draft.learning!.chapterId, draft.id)
        .then((rows) => {
          if (!active) return;
          const lesson = rows.find((l) => l.id === draft.id);
          setState(
            lesson
              ? { status: "published", lesson }
              : { status: "unavailable" },
          );
          if (lesson) loaded.current();
        })
        .catch(() => {
          if (active) setState({ status: "error" });
        });
    return () => {
      active = false;
    };
  }, [cloud, retry, reloadKey, courseId, draft]);
  return (
    <section className="note-box" aria-label={label}>
      <h3>{title}</h3>
      <p>{description}</p>
      {state.status === "published" ? (
        <>
          <p>Đã xuất bản · Kết quả học được lưu vào tài khoản.</p>
          {!isUnlocked(state.lesson) && (
            <p>
              Hoàn thành {prerequisiteLabel} để mở khóa {label}.
            </p>
          )}
          <button
            className="primary"
            disabled={!isUnlocked(state.lesson)}
            onClick={() => onStudy(state.lesson)}
          >
            Học ngay
          </button>
        </>
      ) : state.status === "loading" ? (
        <p role="status">Đang kiểm tra bản xuất bản {label} trên Supabase…</p>
      ) : state.status === "error" ? (
        <>
          <p role="status">
            Không tải được trạng thái {label} từ Supabase. Chưa xác định được
            bài đã xuất bản hay chưa.
          </p>
          <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
            Thử tải lại {label}
          </button>
        </>
      ) : (
        <>
          <p>
            {state.status === "local"
              ? "Bản draft kèm ứng dụng để duyệt. Đăng nhập để kiểm tra bản xuất bản trên Supabase."
              : `Chưa có bản xuất bản ${label} hiển thị cho tài khoản này. Có thể xem thử bản draft kèm ứng dụng.`}{" "}
            Xem thử không lưu tiến độ, XP hoặc lịch ôn.
          </p>
          <button className="secondary" onClick={() => onPreview(draft)}>
            Xem thử {title}
          </button>
        </>
      )}
    </section>
  );
}
