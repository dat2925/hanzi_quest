import Game from "../Game";
import { validateBundle, type Bundle } from "./schema";
import { compileBundle } from "./adapter";
import type { Lesson } from "../data";
import { useEffect, useRef, useState } from "react";
import { beginner } from "./demo";
import { book1, lesson1a } from "./book1";
import { Book1BEntry } from "./Book1BEntry";
import { CurriculumLessonEntry } from "./CurriculumLessonEntry";
import { book1c, lesson1c } from "./book1c";
import {
  loadCourseIndex,
  loadChapterIndex,
  loadCurriculum,
} from "../cloud/curriculum";
export function CourseBrowser({
  cloud,
  onLoaded,
  onStudy,
  isUnlocked,
}: {
  cloud: boolean;
  onLoaded: () => void;
  onStudy: (lesson: Lesson) => void;
  isUnlocked: (lesson: Lesson) => boolean;
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
  const [indexStatus, setIndexStatus] = useState("");
  const [chapterStatus, setChapterStatus] = useState("");
  const [chapterLessons, setChapterLessons] = useState<Lesson[]>([]);
  const [selectedChapter, setSelectedChapter] = useState("");
  const chapterRequest = useRef(0);
  const [featured, setFeatured] = useState<
    | { status: "local" | "loading" | "unavailable" | "error" }
    | { status: "published"; lesson: Lesson }
  >({ status: cloud ? "loading" : "local" });
  const [retry, setRetry] = useState(0);
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;
  useEffect(() => {
    let active = true;
    setFeatured({ status: cloud ? "loading" : "local" });
    if (cloud)
      loadCurriculum(book1.courseId, lesson1a.learning!.chapterId, lesson1a.id)
        .then((rows) => {
          if (!active) return;
          const lesson = rows.find((l) => l.id === lesson1a.id);
          setFeatured(
            lesson
              ? { status: "published", lesson }
              : { status: "unavailable" },
          );
          if (lesson) loadedRef.current();
        })
        .catch(() => {
          if (active) setFeatured({ status: "error" });
        });
    return () => {
      active = false;
    };
  }, [cloud, retry]);
  useEffect(() => {
    let active = true;
    if (cloud) {
      setIndexStatus("Đang tải danh sách khóa…");
      loadCourseIndex()
        .then((x) => {
          if (active) {
            setCourses(x);
            setIndexStatus(
              x.length
                ? ""
                : "Chưa có khóa đã xuất bản hiển thị cho tài khoản này.",
            );
            setCourse((current) =>
              x.some((c) => c.id === current) ? current : x[0]?.id || "",
            );
          }
        })
        .catch(() => {
          if (active) {
            setCourses([]);
            setIndexStatus("Không tải được danh sách khóa. Hãy thử tải lại.");
          }
        });
    }
    return () => {
      active = false;
    };
  }, [cloud, retry]);
  useEffect(() => {
    let active = true;
    chapterRequest.current++;
    setBusy(false);
    setChapterLessons([]);
    setSelectedChapter("");
    if (cloud) {
      setChapters([]);
      if (!course) {
        setChapterStatus("Chọn một khóa đã xuất bản để xem chương.");
        return;
      }
      setChapterStatus("Đang tải danh sách chương…");
      loadChapterIndex(course)
        .then((x) => {
          if (active) {
            setChapters(x);
            setChapterStatus(
              x.length
                ? "Chọn chương để xem bài học."
                : "Chưa có chương hiển thị trong khóa này.",
            );
          }
        })
        .catch(() => {
          if (active)
            setChapterStatus(
              "Không tải được danh sách chương. Hãy thử tải lại.",
            );
        });
    }
    return () => {
      active = false;
      chapterRequest.current++;
    };
  }, [course, cloud, retry]);
  return (
    <section className="card curriculum-browser">
      <h2>Giáo trình cho người mới</h2>
      <section className="note-box" aria-label="Bài 1A">
        <h3>Bài 1A · 你好 – Xin chào</h3>
        <p>
          Bảy màn học: hiểu lời chào, từ mới, nghe nói, tự nhớ, viết vào vở,
          kiểm tra và ôn tập.
        </p>
        {featured.status === "published" ? (
          <>
            <p>Đã xuất bản · Kết quả học được lưu vào tài khoản.</p>
            <button
              className="primary"
              onClick={() => onStudy(featured.lesson)}
            >
              {isUnlocked(featured.lesson)
                ? "Học ngay"
                : "Xem điều kiện mở khóa"}
            </button>
          </>
        ) : featured.status === "loading" ? (
          <p role="status">Đang kiểm tra bản xuất bản trên Supabase…</p>
        ) : featured.status === "error" ? (
          <>
            <p role="status">
              Không tải được trạng thái Bài 1A từ Supabase. Chưa xác định được
              bài đã xuất bản hay chưa.
            </p>
            <button
              className="secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              Thử tải lại
            </button>
          </>
        ) : (
          <>
            <p>
              {featured.status === "local"
                ? "Bản xem thử kèm ứng dụng. Chưa kiểm tra trạng thái Supabase; đăng nhập để tải bài đã xuất bản."
                : "Chưa có bản xuất bản hiển thị cho tài khoản này. Bạn có thể xem thử bản nội dung kèm ứng dụng."}{" "}
              Xem thử không lưu tiến độ, XP hoặc lịch ôn.
            </p>
            <button className="secondary" onClick={() => setPreview(lesson1a)}>
              Xem thử Bài 1A · 你好 – Xin chào
            </button>
          </>
        )}
      </section>
      <Book1BEntry
        cloud={cloud}
        onLoaded={onLoaded}
        onStudy={onStudy}
        onPreview={setPreview}
        isUnlocked={isUnlocked}
        reloadKey={retry}
      />
      <CurriculumLessonEntry
        courseId={book1c.courseId}
        draft={lesson1c}
        label="Bài 1C"
        title="Bài 1C · Bốn thanh điệu tiếng Trung"
        description="Bảy màn học: bốn thanh điệu, hai từ 妈 và 爸, ôn 八/马, sáu thẻ tự nhớ, viết vào vở, chín hoạt động kiểm tra và SRS."
        prerequisiteLabel="Bài 1B · Làm quen với Pinyin"
        cloud={cloud}
        onLoaded={onLoaded}
        onStudy={onStudy}
        onPreview={setPreview}
        isUnlocked={isUnlocked}
        reloadKey={retry}
      />
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
      <p role="status">{indexStatus}</p>
      {cloud && (
        <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
          Tải lại trạng thái giáo trình
        </button>
      )}
      <div className="chapter-grid">
        {chapters.map((c) => (
          <button
            className="secondary"
            disabled={busy}
            key={c.id}
            aria-pressed={selectedChapter === c.id}
            onClick={async () => {
              if (!cloud) {
                setChapterLessons(
                  c.id === "beginner-intro" ? [compileBundle(beginner)[0]] : [],
                );
                setSelectedChapter(c.id);
                setChapterStatus(
                  c.id === "beginner-intro"
                    ? "Bài nhập môn đã sẵn sàng bên dưới."
                    : "Chương này đang chờ nội dung.",
                );
                return;
              }
              setBusy(true);
              setSelectedChapter(c.id);
              setChapterLessons([]);
              setChapterStatus("");
              const request = ++chapterRequest.current;
              try {
                const x = await loadCurriculum(course, c.id);
                if (request !== chapterRequest.current) return;
                setChapterLessons(x);
                setChapterStatus(
                  x.length
                    ? `Đã tải ${x.length} bài của ${c.title}.`
                    : "Chưa có bài đã xuất bản hiển thị trong chương này.",
                );
                onLoaded();
              } catch {
                if (request === chapterRequest.current)
                  setChapterStatus(
                    "Không tải được bài trong chương. Hãy chọn lại chương để thử lại.",
                  );
              } finally {
                if (request === chapterRequest.current) setBusy(false);
              }
            }}
          >
            <b>{c.title}</b>
            <small>{c.description}</small>
          </button>
        ))}
      </div>
      <p role="status">{busy ? "Đang tải bài trong chương…" : chapterStatus}</p>
      <div role="region" aria-label="Danh sách bài trong chương">
        {chapterLessons.map((l) => (
          <article key={l.id}>
            <h3>{l.title}</h3>
            <p>{l.description}</p>
            <button className="primary" onClick={() => onStudy(l)}>
              {isUnlocked(l) ? "Học ngay" : "Xem điều kiện mở khóa"}
            </button>
          </article>
        ))}
      </div>
      <p role="status">{error}</p>
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
