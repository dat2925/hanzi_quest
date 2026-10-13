import { useEffect, useRef, useState } from "react";
import { useAccount } from "../cloud/Account";
import { supabase } from "../cloud/client";
import { compileBundle } from "../learning/adapter";
import { courseBundle } from "./batch";
import { adminRequest } from "./client";
import type { AdminCatalog } from "./types";
import type { Bundle } from "../learning/schema";
import type { Lesson } from "../data";
import { lessonScaffold } from "./template";

export function AdminCurriculumLink({ onOpen }: { onOpen: () => void }) {
  const { manager } = useAccount();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    setAllowed(false);
    if (manager)
      void supabase?.rpc("curriculum_admin_access").then(({ data }) => {
        if (active) setAllowed(data === true);
      });
    return () => {
      active = false;
    };
  }, [manager?.userId]);
  return allowed ? (
    <button className="secondary" onClick={onOpen}>
      Admin Curriculum
    </button>
  ) : null;
}

const empty: AdminCatalog = {
  courses: [],
  chapters: [],
  lessons: [],
  drafts: [],
};
export function AdminCurriculum({
  onPreview,
}: {
  onPreview: (lesson: Lesson) => void;
}) {
  const account = useAccount();
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">(
    "loading",
  );
  const [catalog, setCatalog] = useState<AdminCatalog>(empty);
  const [course, setCourse] = useState("");
  const [editor, setEditor] = useState("");
  const [expected, setExpected] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Bundle>();
  const [selected, setSelected] = useState<string[]>([]);
  const [sourceChecked, setSourceChecked] = useState(false);
  const [previewsChecked, setPreviewsChecked] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requests = useRef(new Map<string, string>());
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = async (id: string) => {
    const request = ++generation.current;
    const data = await adminRequest(
      id ? `?course=${encodeURIComponent(id)}` : "",
    );
    if (request === generation.current) {
      setCatalog(data);
      setSourceChecked(false);
      setPreviewsChecked(false);
      setConfirm(false);
    }
  };
  useEffect(() => {
    let active = true;
    setAccess("loading");
    setCatalog(empty);
    setEditor("");
    setSelected([]);
    setChecked(undefined);
    setExpected({});
    requests.current.clear();
    void adminRequest("/access")
      .then(async () => {
        if (!active) return;
        setAccess("allowed");
        await load("");
      })
      .catch((e) => {
        if (active) {
          setAccess("denied");
          setMessage(e.message);
        }
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, [account.manager?.userId]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Không thực hiện được.");
    } finally {
      setBusy(false);
    }
  }
  function command(action: string, data: Record<string, unknown>) {
    const fingerprint = JSON.stringify({ action, ...data });
    const id = requests.current.get(fingerprint) || crypto.randomUUID();
    requests.current.set(fingerprint, id);
    return adminRequest(`/${action}`, { ...data, requestId: id });
  }
  const publicRows = new Map(catalog.lessons.map((l) => [l.id, l]));
  const drafts = new Map(catalog.drafts.map((d) => [d.lesson_id, d]));
  const ids = [...new Set([...publicRows.keys(), ...drafts.keys()])];
  function editing(id: string) {
    const d = drafts.get(id),
      old = publicRows.get(id);
    const b = courseBundle(catalog, course);
    b.lessons = [d?.learning_json || old!.content_json.learning!];
    setEditor(JSON.stringify(b, null, 2));
    setExpected({ [id]: d?.revision ?? 0 });
    setChecked(undefined);
    setSourceChecked(false);
    setPreviewsChecked(false);
    setConfirm(false);
  }
  async function previewStored(id: string) {
    const old = publicRows.get(id);
    if (old?.is_published) {
      onPreview(old.content_json);
      return;
    }
    const b = courseBundle(catalog, course);
    b.lessons = [drafts.get(id)?.learning_json || old!.content_json.learning!];
    const result = await command("validate", {
      bundle: b,
      expected: { [id]: drafts.get(id)?.revision ?? 0 },
    });
    if (alive.current) onPreview(compileBundle(result.bundle)[0]);
  }
  const selectedExpected = Object.fromEntries(
    selected.map((id) => [id, drafts.get(id)?.revision ?? 0]),
  );
  const allReviewed =
    selected.length > 0 &&
    selected.every((id) => {
      const d = drafts.get(id);
      return d && d.reviewed_revision === d.revision;
    });
  if (access === "loading")
    return (
      <section className="card">
        <h1>Admin Curriculum</h1>
        <p role="status">Đang xác minh quyền quản trị…</p>
      </section>
    );
  if (access === "denied")
    return (
      <section className="card">
        <h1>Admin Curriculum</h1>
        <p role="alert">{message || "Tài khoản không có quyền quản trị."}</p>
        {!account.manager && <button onClick={account.login}>Đăng nhập</button>}
      </section>
    );
  return (
    <section className="admin-curriculum">
      <h1>Admin Curriculum</h1>
      <p>
        Nhập bản nháp → kiểm tra và xem thử → duyệt đúng phiên bản → xuất bản.
        Bài đã xuất bản chỉ đọc; sửa nội dung bằng lesson ID mới.
      </p>
      <p role="status" className="admin-message">
        {message}
      </p>
      <fieldset disabled={busy} className="card">
        <legend>Khóa, chương và bài trên Supabase</legend>
        <label>
          Khóa quản trị
          <select
            value={course}
            onChange={(e) => {
              const id = e.target.value;
              setCourse(id);
              setSelected([]);
              setConfirm(false);
              setEditor("");
              setChecked(undefined);
              void run(() => load(id));
            }}
          >
            <option value="">Chọn khóa</option>
            {catalog.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · {c.syllabus_version} ·{" "}
                {c.is_published ? "published" : "draft"}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => void run(() => load(course))}
        >
          Tải lại dữ liệu quản trị
        </button>
        <div className="chapter-grid">
          {catalog.chapters.map((c) => (
            <p key={c.id}>
              <b>{c.title}</b>
              <br />
              {c.description}
            </p>
          ))}
        </div>
        <div className="admin-lessons">
          {ids.map((id) => {
            const old = publicRows.get(id),
              d = drafts.get(id);
            const published = old?.is_published,
              legacy = old && !old.content_json.learning;
            const title = d?.learning_json.title || old!.content_json.title;
            return (
              <article className="note-box" key={id}>
                <h3>{title}</h3>
                <small>{id}</small>
                <p>
                  {published
                    ? "published · chỉ đọc"
                    : legacy
                      ? "Bài mẫu · chỉ đọc"
                      : `draft · phiên bản ${d?.revision ?? 0} · ${d?.reviewed_revision === d?.revision && d ? "đã duyệt" : "chưa duyệt"}`}
                </p>
                {!published && !legacy && d && (
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={(e) => {
                        setSelected(
                          e.target.checked
                            ? [...selected, id]
                            : selected.filter((x) => x !== id),
                        );
                        setSourceChecked(false);
                        setPreviewsChecked(false);
                        setConfirm(false);
                      }}
                    />
                    Chọn duyệt / xuất bản
                  </label>
                )}
                {!published && !legacy && !d && (
                  <p>
                    Sửa nháp rồi lưu để đưa bản nháp SQL hiện có vào vùng biên
                    tập.
                  </p>
                )}
                {!legacy && (
                  <div className="row">
                    <button
                      className="secondary"
                      onClick={() => void run(() => previewStored(id))}
                    >
                      Xem thử {id}
                    </button>
                    {!published && (
                      <button className="secondary" onClick={() => editing(id)}>
                        Sửa nháp {id}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </fieldset>
      <fieldset disabled={busy} className="card">
        <legend>Biên soạn / nhập JSON theo lô</legend>
        <p>
          Khuyến nghị 5–10 bài/file, tối đa 20 bài và 4 MB. References được đối
          chiếu/tải từ Supabase. Không nhập lại các ID đã có.
        </p>
        <button
          className="secondary"
          disabled={
            catalog.courses.find((c) => c.id === course)?.curriculum_family ===
            "sample"
          }
          onClick={() => {
            const b = course
              ? courseBundle(catalog, course)
              : {
                  schemaVersion: 2,
                  courseId: "new-course-id",
                  title: "Tên khóa",
                  syllabus: { family: "foundation", version: "version-1" },
                  status: "draft",
                  chapters: [
                    {
                      id: "new-chapter-id",
                      title: "Tên chương",
                      description: "Mô tả chương",
                    },
                  ],
                  lessons: [],
                  references: [],
                };
            setEditor(
              JSON.stringify(
                {
                  ...b,
                  lessons: [
                    lessonScaffold(
                      "new-lesson-id",
                      b.chapters[0]?.id || "new-chapter-id",
                    ),
                  ],
                },
                null,
                2,
              ),
            );
            setExpected({});
            setChecked(undefined);
          }}
        >
          Tạo bản nháp / lô mới
        </button>
        <label>
          File curriculum JSON
          <input
            aria-label="File curriculum quản trị"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void run(async () => {
                if (file.size > 4000000) throw new Error("File tối đa 4 MB.");
                setEditor(await file.text());
                setExpected({});
                setChecked(undefined);
              });
            }}
          />
        </label>
        <label>
          JSON giáo trình
          <textarea
            aria-label="JSON giáo trình"
            rows={18}
            value={editor}
            spellCheck={false}
            onChange={(e) => {
              setEditor(e.target.value);
              setChecked(undefined);
            }}
          />
        </label>
        <div className="row">
          <button
            className="secondary"
            disabled={!editor}
            onClick={() =>
              void run(async () => {
                const result = await command("validate", {
                  bundle: JSON.parse(editor),
                  expected,
                });
                setChecked(result.bundle);
                setEditor(JSON.stringify(result.bundle, null, 2));
                setMessage(
                  `JSON hợp lệ: ${result.ids.length} bài. Đã sắp prerequisite trước bài phụ thuộc. Chưa ghi dữ liệu.`,
                );
              })
            }
          >
            Kiểm tra toàn bộ JSON
          </button>
          <button
            className="primary"
            disabled={!checked}
            onClick={() =>
              void run(async () => {
                await command("save", { bundle: checked, expected });
                setCourse(checked!.courseId);
                await load(checked!.courseId);
                setEditor("");
                setExpected({});
                setChecked(undefined);
                setSelected([]);
                setConfirm(false);
                setSourceChecked(false);
                setPreviewsChecked(false);
                setMessage("Đã lưu toàn bộ lô dưới dạng draft. Chưa xuất bản.");
              })
            }
          >
            Lưu lô bản nháp
          </button>
        </div>
        {checked &&
          compileBundle(checked).map((l) => (
            <button
              className="secondary"
              key={l.id}
              onClick={() => onPreview(l)}
            >
              Xem thử: {l.title}
            </button>
          ))}
      </fieldset>
      <fieldset disabled={busy} className="card">
        <legend>Duyệt và xuất bản {selected.length} bài đã chọn</legend>
        <label className="checkline">
          <input
            type="checkbox"
            checked={sourceChecked}
            onChange={(e) => setSourceChecked(e.target.checked)}
          />
          Đã đối chiếu nguồn, chữ Hán, Pinyin, nghĩa và quyền sử dụng; nội dung
          từ PDF scan đã được kiểm tra thủ công.
        </label>
        <label className="checkline">
          <input
            type="checkbox"
            checked={previewsChecked}
            onChange={(e) => setPreviewsChecked(e.target.checked)}
          />
          Đã xem thử từng bài đủ 7 màn, nghe, che đáp án, viết và kiểm tra; chỉ
          hỏi kiến thức đã dạy.
        </label>
        <button
          className="secondary"
          disabled={!selected.length || !sourceChecked || !previewsChecked}
          onClick={() =>
            void run(async () => {
              await command("review", {
                courseId: course,
                ids: selected,
                expected: selectedExpected,
                sourceChecked,
                previewsChecked,
              });
              await load(course);
              setMessage(
                "Đã duyệt phiên bản hiện tại. Sửa nháp sẽ hủy duyệt và cần xem lại.",
              );
            })
          }
        >
          Duyệt các bản nháp đã chọn
        </button>
        <button
          className="primary"
          disabled={!allReviewed}
          onClick={() => setConfirm(true)}
        >
          Chuẩn bị xuất bản
        </button>
        {confirm && (
          <div className="note-box">
            <h3>Xác nhận xuất bản {selected.length} bài</h3>
            <p>{selected.join(", ")}</p>
            <p>
              Các bài sẽ xuất hiện trong Hành trình. Mọi prerequisite bên ngoài
              lô phải đã published.
            </p>
            <button
              className="primary"
              onClick={() =>
                void run(async () => {
                  await command("publish", {
                    courseId: course,
                    ids: selected,
                    expected: selectedExpected,
                  });
                  await load(course);
                  setSelected([]);
                  setConfirm(false);
                  setMessage(
                    "Đã xuất bản. Mở Hành trình, chọn khóa và chương để học bài mới.",
                  );
                })
              }
            >
              Xác nhận xuất bản lô đã duyệt
            </button>
            <button className="secondary" onClick={() => setConfirm(false)}>
              Hủy
            </button>
          </div>
        )}
      </fieldset>
    </section>
  );
}
