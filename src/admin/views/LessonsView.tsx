import { useAdminDialog } from "../use-dialog";
import { useEffect, useState, useRef, useId } from "react";
import {
  BookOpen,
  Filter,
  Search,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  AlertCircle,
  X,
  FileCode,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import {
  AdminApi,
  adminCommand,
  formatAdminErrorMessage,
  AdminApiError,
  allAdminCourses,
  allAdminChapters,
  adminFetch,
} from "../api";
import type {
  AdminLessonRow,
  LessonAdminStatus,
  AdminCourseRow,
  AdminChapterRow,
} from "../platform-types";
import type { AdminCatalog } from "../types";
import { courseBundle } from "../batch";
import { adminRequest } from "../client";
import { compileBundle } from "../../learning/adapter";
import type { Lesson } from "../../data";
import { AdminCurriculum } from "../AdminCurriculum";

interface LessonsViewProps {
  onPreviewLesson: (lesson: Lesson) => void;
  defaultSubTab?: "list" | "editor";
}

export function LessonsView({
  onPreviewLesson,
  defaultSubTab = "list",
}: LessonsViewProps) {
  const [subTab, setSubTab] = useState<"list" | "editor">(defaultSubTab);

  // List filters & pagination
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LessonAdminStatus>(
    "all",
  );
  const [courseFilter, setCourseFilter] = useState<string>("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [courses, setCourses] = useState<AdminCourseRow[]>([]);
  const [chapters, setChapters] = useState<AdminChapterRow[]>([]);
  const [filterError, setFilterError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [editorTarget, setEditorTarget] = useState<AdminLessonRow>();
  const [previewBusy, setPreviewBusy] = useState("");
  const previewAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    setFilterError("");
    allAdminCourses(ac.signal)
      .then((rows) => {
        if (!ac.signal.aborted) setCourses(rows);
      })
      .catch((err) => {
        if (!ac.signal.aborted) setFilterError(formatAdminErrorMessage(err));
      });
    return () => ac.abort();
  }, [reloadKey]);
  useEffect(() => {
    const ac = new AbortController();
    setChapters([]);
    if (courseFilter)
      allAdminChapters(courseFilter, ac.signal)
        .then((rows) => {
          if (!ac.signal.aborted) setChapters(rows);
        })
        .catch((err) => {
          if (!ac.signal.aborted) setFilterError(formatAdminErrorMessage(err));
        });
    return () => ac.abort();
  }, [courseFilter, reloadKey]);
  useEffect(() => () => previewAbort.current?.abort(), []);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Data state
  const [lessons, setLessons] = useState<AdminLessonRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Visibility toggle dialog
  const [visibilityTarget, setVisibilityTarget] =
    useState<AdminLessonRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminLessonRow | null>(null);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load lessons list
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (subTab !== "list") return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    AdminApi.getLessons(
      {
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        courseId: courseFilter.trim() || undefined,
        chapterId: chapterFilter || undefined,
        limit,
        offset,
      },
      ac.signal,
    )
      .then((res) => {
        if (!ac.signal.aborted) {
          setLessons(res.items);
          setTotal(res.total);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          setError(formatAdminErrorMessage(err));
          setLoading(false);
        }
      });

    return () => ac.abort();
  }, [
    subTab,
    debouncedSearch,
    statusFilter,
    courseFilter,
    chapterFilter,
    offset,
    reloadKey,
  ]);
  async function previewLesson(row: AdminLessonRow) {
    previewAbort.current?.abort();
    const ac = new AbortController();
    previewAbort.current = ac;
    setPreviewBusy(row.id);
    setError(null);
    try {
      const catalog = await adminFetch<AdminCatalog>("/curriculum", {
        query: { course: row.course_id },
        signal: ac.signal,
      });
      let lesson = catalog.lessons.find((l) => l.id === row.id)?.content_json;
      if (row.status === "draft" || row.status === "reviewed") {
        const b = courseBundle(catalog, row.course_id);
        const draft = catalog.drafts.find((d) => d.lesson_id === row.id);
        b.lessons = [draft?.learning_json || lesson!.learning!];
        const checked = await adminRequest("/validate", {
          bundle: b,
          requestId: crypto.randomUUID(),
          expected: { [row.id]: draft?.revision ?? 0 },
        });
        lesson = compileBundle(checked.bundle).find((l) => l.id === row.id);
      }
      if (!ac.signal.aborted && lesson) onPreviewLesson(lesson);
    } catch (err) {
      if (!ac.signal.aborted) setError(formatAdminErrorMessage(err));
    } finally {
      if (!ac.signal.aborted) setPreviewBusy("");
    }
  }

  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Quản lý Bài học & Giáo trình</h2>
          <p className="admin-page-subtitle">
            Theo dõi trạng thái xuất bản, ẩn/khôi phục bài học và trình biên tập
            giáo trình 7 màn.
          </p>
        </div>

        {/* Sub-tab Switcher */}
        <div className="admin-subtabs-nav">
          <button
            className={`admin-subtab-btn ${subTab === "list" ? "active" : ""}`}
            onClick={() => setSubTab("list")}
          >
            <BookOpen size={16} />
            <span>Danh mục bài học</span>
          </button>
          <button
            className={`admin-subtab-btn ${subTab === "editor" ? "active" : ""}`}
            onClick={() => {
              setEditorTarget(undefined);
              setSubTab("editor");
            }}
          >
            <FileCode size={16} />
            <span>Trình biên tập & Xuất bản lô</span>
          </button>
        </div>
      </div>

      {subTab === "editor" ? (
        /* SubTab 2: Editorial Batch Workflow */
        <div className="admin-card editorial-wrapper-card">
          <div className="editorial-banner">
            <Sparkles size={18} />
            <div>
              <b>Quy trình biên tập & xuất bản lô bài học</b>
              <p>
                Nhập file JSON v2 → Kiểm tra → Xem trước 7 màn → Lưu nháp →
                Checklist duyệt nguồn → Duyệt → Xác nhận xuất bản.
              </p>
            </div>
          </div>
          <AdminCurriculum
            key={editorTarget?.id || "new-batch"}
            onPreview={onPreviewLesson}
            initialCourseId={editorTarget?.course_id}
            initialLessonId={editorTarget?.id}
          />
        </div>
      ) : (
        /* SubTab 1: Lessons List & Visibility */
        <>
          {/* Toolbar */}
          <div className="admin-card filter-toolbar">
            <div className="search-input-wrapper">
              <Search size={16} />
              <input
                type="text"
                placeholder="Tìm bài học theo tên hoặc ID..."
                aria-label="Tìm bài học"
                maxLength={100}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="icon-button mini-clear"
                  onClick={() => setSearch("")}
                  aria-label="Xóa tìm kiếm"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="filter-group">
              <select
                aria-label="Lọc theo khóa học"
                value={courseFilter}
                onChange={(e) => {
                  setCourseFilter(e.target.value);
                  setChapterFilter("");
                  setOffset(0);
                }}
              >
                <option value="">Tất cả khóa học</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lọc theo chương"
                disabled={!courseFilter}
                value={chapterFilter}
                onChange={(e) => {
                  setChapterFilter(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Tất cả chương</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <div className="select-with-icon">
                <Filter size={14} />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(
                      e.target.value as "all" | LessonAdminStatus,
                    );
                    setOffset(0);
                  }}
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="published">Đã xuất bản (Published)</option>
                  <option value="hidden">Đang ẩn (Hidden)</option>
                  <option value="reviewed">Đã duyệt (Reviewed)</option>
                  <option value="draft">Bản nháp (Draft)</option>
                </select>
              </div>

              <button
                className="admin-btn secondary mini"
                onClick={() => setReloadKey((n) => n + 1)}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? "spin" : ""} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {(error || filterError) && (
            <div className="admin-card admin-error-card">
              <AlertCircle size={20} />
              <span>{error || filterError}</span>
            </div>
          )}

          {/* Lessons Table */}
          <div className="admin-card table-card">
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Bài học</th>
                    <th>Khóa / Chương</th>
                    <th>Thời lượng</th>
                    <th>Trạng thái</th>
                    <th>Số học viên</th>
                    <th>Thứ tự</th>
                    <th className="text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && lessons.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">
                        <div className="loading-spinner-row">
                          <RefreshCw size={18} className="spin" />
                          <span>Đang tải danh sách bài học...</span>
                        </div>
                      </td>
                    </tr>
                  ) : lessons.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted">
                        Không tìm thấy bài học nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    lessons.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <div className="lesson-title-cell">
                            <b>{l.title}</b>
                            <small>ID: {l.id}</small>
                            {l.description && (
                              <p className="lesson-table-desc">
                                {l.description}
                              </p>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="course-tag">{l.course_id}</span>
                          <small className="d-block text-muted">
                            {l.chapter_id}
                          </small>
                        </td>
                        <td>
                          <span className="time-badge">
                            <Clock size={12} /> {l.estimated_minutes}p
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={l.status} />
                        </td>
                        <td>
                          <b>{l.learners}</b> người
                        </td>
                        <td>
                          <span className="sort-pill">#{l.sort_order}</span>
                        </td>
                        <td className="text-right">
                          <div className="action-button-group">
                            <button
                              className="admin-btn secondary mini"
                              disabled={!!previewBusy}
                              onClick={() => void previewLesson(l)}
                            >
                              <Eye size={13} />
                              {previewBusy === l.id ? "Đang tải…" : "Xem thử"}
                            </button>
                            {(l.status === "draft" ||
                              l.status === "reviewed") && (
                              <button
                                className="admin-btn secondary mini"
                                onClick={() => {
                                  setEditorTarget(l);
                                  setSubTab("editor");
                                }}
                              >
                                Sửa nháp
                              </button>
                            )}
                            {/* Toggle visibility for published or hidden lessons */}
                            {(l.status === "published" ||
                              l.status === "hidden") && (
                              <button
                                className={`admin-btn mini ${l.status === "published" ? "secondary" : "primary"}`}
                                onClick={() => setVisibilityTarget(l)}
                                title={
                                  l.status === "published"
                                    ? "Ẩn bài học khỏi học viên"
                                    : "Khôi phục bài học hiển thị"
                                }
                              >
                                {l.status === "published" ? (
                                  <>
                                    <EyeOff size={13} /> Ẩn bài
                                  </>
                                ) : (
                                  <>
                                    <Eye size={13} /> Hiện bài
                                  </>
                                )}
                              </button>
                            )}

                            {/* Delete draft button */}
                            {l.status === "draft" && l.revision !== null && (
                              <button
                                className="admin-btn secondary mini alert-btn"
                                onClick={() => setDeleteTarget(l)}
                                title="Xóa bản nháp này"
                              >
                                <Trash2 size={13} /> Xóa nháp
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="table-pagination">
              <span className="pagination-info">
                Hiển thị <b>{lessons.length}</b> trên tổng số <b>{total}</b> bài
                học
              </span>
              <div className="pagination-controls">
                <button
                  className="admin-btn secondary mini"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset((o) => Math.max(0, o - limit))}
                >
                  <ChevronLeft size={14} /> Trước
                </button>
                <span className="page-number">
                  Trang {currentPage} / {totalPages}
                </span>
                <button
                  className="admin-btn secondary mini"
                  disabled={offset + limit >= total || loading}
                  onClick={() => setOffset((o) => o + limit)}
                >
                  Sau <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Visibility Toggle Dialog */}
      {visibilityTarget && (
        <VisibilityDialog
          lesson={visibilityTarget}
          onClose={() => setVisibilityTarget(null)}
          onSuccess={() => {
            setVisibilityTarget(null);
            setReloadKey((n) => n + 1);
          }}
        />
      )}

      {/* Delete Draft Dialog */}
      {deleteTarget && (
        <DeleteDraftDialog
          lesson={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            setReloadKey((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: LessonAdminStatus }) {
  switch (status) {
    case "published":
      return (
        <span className="status-badge active">
          <CheckCircle2 size={12} /> Đã xuất bản
        </span>
      );
    case "hidden":
      return (
        <span className="status-badge suspended">
          <EyeOff size={12} /> Đang ẩn
        </span>
      );
    case "reviewed":
      return (
        <span className="status-badge success">
          <Sparkles size={12} /> Đã duyệt
        </span>
      );
    case "draft":
      return (
        <span className="status-badge warning">
          <Clock size={12} /> Bản nháp
        </span>
      );
  }
}

// -------------------------------------------------------------
// Sub-Dialog: Visibility (Ẩn/Hiện bài học)
// -------------------------------------------------------------
function VisibilityDialog({
  lesson,
  onClose,
  onSuccess,
}: {
  lesson: AdminLessonRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isHiding = lesson.status === "published";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());
  const titleId = useId();
  useAdminDialog(onClose, busy);

  const handleToggle = async () => {
    setBusy(true);
    setError(null);

    try {
      await adminCommand("lesson.visibility", {
        requestId: requestIdRef.current,
        id: lesson.id,
        expectedRevision: lesson.admin_revision,
        published: !isHiding,
      });
      onSuccess();
    } catch (err) {
      setError(formatAdminErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="admin-dialog card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-header">
          <h3 id={titleId}>
            {isHiding ? "Xác nhận ẩn bài học" : "Khôi phục hiển thị bài học"}
          </h3>
          <button
            className="icon-button"
            onClick={busy ? undefined : onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="dialog-form">
          {error && (
            <div className="alert-box error">
              <AlertCircle size={16} />
              <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
            </div>
          )}

          <div className="lesson-target-preview">
            <b>{lesson.title}</b>
            <code>{lesson.id}</code>
          </div>

          {isHiding ? (
            <p className="dialog-hint-text">
              Thao tác này sẽ <b>ẩn bài học</b> khỏi danh sách của học viên. Nội
              dung và dữ liệu tiến độ học tập của người học vẫn được giữ nguyên
              không thay đổi. Nếu có bài học khác phụ thuộc vào bài này, bạn cần
              ẩn các bài phụ thuộc trước.
            </p>
          ) : (
            <p className="dialog-hint-text">
              Khôi phục hiển thị bài học này cho học viên. Lưu ý rằng bài học
              điều kiện tiên quyết của nó cũng phải đang ở trạng thái đã xuất
              bản.
            </p>
          )}

          <div className="dialog-footer">
            <button
              type="button"
              className="admin-btn secondary"
              onClick={busy ? undefined : onClose}
              disabled={busy}
            >
              Hủy
            </button>
            <button
              type="button"
              className={`admin-btn ${isHiding ? "alert-btn" : "primary"}`}
              onClick={handleToggle}
              disabled={busy}
            >
              {busy
                ? "Đang xử lý..."
                : isHiding
                  ? "Xác nhận ẩn bài"
                  : "Xác nhận khôi phục"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Sub-Dialog: Xóa bản nháp
// -------------------------------------------------------------
function DeleteDraftDialog({
  lesson,
  onClose,
  onSuccess,
}: {
  lesson: AdminLessonRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());
  const titleId = useId();
  useAdminDialog(onClose, busy);

  const handleDelete = async () => {
    if (lesson.revision === null) {
      setError("Không tìm thấy số revision của bản nháp.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      await adminCommand("draft.delete", {
        requestId: requestIdRef.current,
        id: lesson.id,
        expectedRevision: lesson.revision,
      });
      onSuccess();
    } catch (err) {
      setError(formatAdminErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="admin-dialog card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-header">
          <h3 id={titleId}>Xóa bản nháp bài học</h3>
          <button
            className="icon-button"
            onClick={busy ? undefined : onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="dialog-form">
          {error && (
            <div className="alert-box error">
              <ShieldAlert size={16} />
              <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
            </div>
          )}

          <div className="lesson-target-preview alert">
            <b>{lesson.title}</b>
            <code>{lesson.id}</code>
          </div>

          <p className="dialog-hint-text">
            Bạn có chắc chắn muốn xóa bản nháp này? Bản nháp chỉ có thể xóa nếu
            chưa có bài học tương ứng trong danh mục bài học và không có bản
            nháp khác phụ thuộc vào nó.
          </p>

          <div className="dialog-footer">
            <button
              type="button"
              className="admin-btn secondary"
              onClick={busy ? undefined : onClose}
              disabled={busy}
            >
              Hủy
            </button>
            <button
              type="button"
              className="admin-btn alert-btn"
              onClick={handleDelete}
              disabled={busy}
            >
              {busy ? "Đang xóa..." : "Xác nhận xóa bản nháp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
