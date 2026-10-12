import { useEffect, useRef, useState } from "react";
import type { Lesson } from "../data";
import { loadCurriculum } from "../cloud/curriculum";
import { book1b, lesson1b } from "./book1b";

// Local drafts are previewed directly; only a server-published lesson can be studied.
export function Book1BEntry({
  cloud,
  onLoaded,
  onStudy,
  onPreview,
  isUnlocked,
  reloadKey,
}: {
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
      loadCurriculum(book1b.courseId, lesson1b.learning!.chapterId, lesson1b.id)
        .then((rows) => {
          if (!active) return;
          const lesson = rows.find((l) => l.id === lesson1b.id);
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
  }, [cloud, retry, reloadKey]);
  return (
    <section className="note-box" aria-label="Bài 1B">
      <h3>Bài 1B · Làm quen với Pinyin</h3>
      <p>
        Bảy màn học: Pinyin, khẩu hình b/p/m/f và a/o, hai từ 八 và 马, tự nhớ,
        viết vào vở, kiểm tra và SRS.
      </p>
      {state.status === "published" ? (
        <>
          <p>Đã xuất bản · Kết quả học được lưu vào tài khoản.</p>
          {!isUnlocked(state.lesson) && (
            <p>Hoàn thành Bài 1A · 你好 – Xin chào để mở khóa Bài 1B.</p>
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
        <p role="status">Đang kiểm tra bản xuất bản Bài 1B trên Supabase…</p>
      ) : state.status === "error" ? (
        <>
          <p role="status">
            Không tải được trạng thái Bài 1B từ Supabase. Chưa xác định được bài
            đã xuất bản hay chưa.
          </p>
          <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
            Thử tải lại Bài 1B
          </button>
        </>
      ) : (
        <>
          <p>
            {state.status === "local"
              ? "Bản draft kèm ứng dụng để duyệt. Đăng nhập để kiểm tra bản xuất bản trên Supabase."
              : "Chưa có bản xuất bản Bài 1B hiển thị cho tài khoản này. Có thể xem thử bản draft kèm ứng dụng."}{" "}
            Xem thử không lưu tiến độ, XP hoặc lịch ôn.
          </p>
          <button className="secondary" onClick={() => onPreview(lesson1b)}>
            Xem thử Bài 1B · Làm quen với Pinyin
          </button>
        </>
      )}
    </section>
  );
}
