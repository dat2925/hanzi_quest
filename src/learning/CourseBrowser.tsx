import Game from "../Game";
import { validateBundle, type Bundle } from "./schema";
import { compileBundle } from "./adapter";
import type { Lesson } from "../data";
import { useEffect, useState } from "react";
import { beginner } from "./demo";
import {
  loadCourseIndex,
  loadChapterIndex,
  loadCurriculum,
} from "../cloud/curriculum";
export function CourseBrowser({
  cloud,
  onLoaded,
}: {
  cloud: boolean;
  onLoaded: () => void;
}) {
  const [courses, setCourses] = useState([
    {
      id: beginner.courseId,
      title: beginner.title,
      syllabus_version: beginner.syllabus.version,
    },
  ]);
  const [course, setCourse] = useState(beginner.courseId);
  const [chapters, setChapters] = useState(beginner.chapters);
  const [error, setError] = useState("");
  const [previewBundle, setPreviewBundle] = useState<Bundle>();
  const [preview, setPreview] = useState<Lesson>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (cloud)
      loadCourseIndex()
        .then((x) => {
          if (active) {
            setCourses(x);
            if (!x.some((c) => c.id === beginner.courseId)) {
              setCourse(x[0]?.id || beginner.courseId);
              setError(
                "Giáo trình nhập môn chưa được nhập. Quản trị viên cần chạy migrations 004 và 005; tiến độ và kho bài mẫu vẫn được giữ nguyên.",
              );
            }
          }
        })
        .catch(() => {
          if (active) setError("Chưa tải được danh sách khóa.");
        });
    return () => {
      active = false;
    };
  }, [cloud]);
  useEffect(() => {
    let active = true;
    if (cloud)
      loadChapterIndex(course)
        .then((x) => {
          if (active) setChapters(x);
        })
        .catch(() => {
          if (active) setError("Chưa tải được danh sách chương.");
        });
    return () => {
      active = false;
    };
  }, [course, cloud]);
  return (
    <section className="card curriculum-browser">
      <h2>Giáo trình cho người mới</h2>
      <p>
        Chọn khóa và phiên bản giáo trình. Các chương chưa có bài được để trống
        để chờ nội dung đã duyệt.
      </p>
      <label>
        Khóa học
        <select value={course} onChange={(e) => setCourse(e.target.value)}>
          {courses.map((c) => (
            <option value={c.id} key={c.id}>
              {c.title} · {c.syllabus_version}
            </option>
          ))}
        </select>
      </label>
      <div className="chapter-grid">
        {chapters.map((c) => (
          <button
            className="secondary"
            disabled={busy}
            key={c.id}
            onClick={async () => {
              if (!cloud) {
                setError(
                  c.id === "beginner-intro"
                    ? "Bài nhập môn đã sẵn sàng bên dưới."
                    : "Chương này đang chờ nội dung.",
                );
                return;
              }
              setBusy(true);
              setError("");
              try {
                const x = await loadCurriculum(course, c.id);
                setError(
                  x.length
                    ? `Đã tải ${x.length} bài của ${c.title}.`
                    : "Chương này đang chờ nội dung.",
                );
                onLoaded();
              } catch {
                setError("Không tải được chương. Hãy thử lại.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <b>{c.title}</b>
            <small>{c.description}</small>
          </button>
        ))}
      </div>
      <p role="status">{busy ? "Đang tải chương…" : error}</p>
      <details className="curriculum-preview">
        <summary>Xem trước giáo trình JSON (không lưu tiến độ)</summary>
        <p>
          Chọn file đã biên soạn để kiểm tra bài và trò chơi trước khi xuất SQL.
          File chỉ được đọc trong trình duyệt.
        </p>
        <input
          aria-label="File giáo trình JSON"
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setPreviewBundle(undefined);
            if (!file) return;
            try {
              if (file.size > 2000000)
                throw new Error("File tối đa 2 MB cho bản xem trước.");
              const b = validateBundle(JSON.parse(await file.text()));
              setPreviewBundle(b);
              setError("JSON hợp lệ. Chọn bài để xem trước.");
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "JSON không hợp lệ",
              );
            }
          }}
        />
        {previewBundle && (
          <>
            <p>
              {previewBundle.title} · {previewBundle.status} ·{" "}
              {previewBundle.syllabus.version}
            </p>
            {previewBundle.lessons.map((l) => (
              <button
                className="secondary"
                key={l.id}
                onClick={() =>
                  setPreview(
                    compileBundle(previewBundle).find(
                      (compiled) => compiled.id === l.id,
                    ),
                  )
                }
              >
                Xem thử: {l.title} ({l.status})
              </button>
            ))}
          </>
        )}
      </details>
      {preview && (
        <Game
          lesson={preview}
          sound={true}
          onClose={() => setPreview(undefined)}
          onComplete={() => setPreview(undefined)}
          previewMode
        />
      )}
    </section>
  );
}
