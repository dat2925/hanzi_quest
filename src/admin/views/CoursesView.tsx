import { useAdminDialog } from "../use-dialog";
import React, { useEffect, useState, useRef, useId } from "react";
import {
  Layers,
  Plus,
  Edit2,
  BookOpen,
  Search,
  RefreshCw,
  AlertCircle,
  X,
  ChevronRight,
  FolderOpen,
  Hash,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  AdminApi,
  allAdminChapters,
  adminCommand,
  formatAdminErrorMessage,
  AdminApiError,
} from "../api";
import type { AdminCourseRow, AdminChapterRow } from "../platform-types";

export function CoursesView() {
  // Course state
  const [courses, setCourses] = useState<AdminCourseRow[]>([]);
  const [coursesTotal, setCoursesTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [courseLoading, setCourseLoading] = useState(true);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Selected course for chapter drill-down
  const [selectedCourse, setSelectedCourse] = useState<AdminCourseRow | null>(
    null,
  );
  const [chapters, setChapters] = useState<AdminChapterRow[]>([]);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);

  // Dialogs
  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [editCourseOpen, setEditCourseOpen] = useState(false);
  const [targetEditCourse, setTargetEditCourse] =
    useState<AdminCourseRow | null>(null);

  const [createChapterOpen, setCreateChapterOpen] = useState(false);
  const [editChapterOpen, setEditChapterOpen] = useState(false);
  const [targetEditChapter, setTargetEditChapter] =
    useState<AdminChapterRow | null>(null);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load courses
  const courseAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    courseAbortRef.current?.abort();
    const ac = new AbortController();
    courseAbortRef.current = ac;

    setCourseLoading(true);
    setCourseError(null);

    AdminApi.getCourses(
      { search: debouncedSearch.trim() || undefined, limit, offset },
      ac.signal,
    )
      .then((res) => {
        if (!ac.signal.aborted) {
          setCourses(res.items);
          setCoursesTotal(res.total);
          setCourseLoading(false);

          // Update selected course reference if open
          if (selectedCourse) {
            const updated = res.items.find((c) => c.id === selectedCourse.id);
            if (updated) setSelectedCourse(updated);
          }
        }
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          setCourseError(formatAdminErrorMessage(err));
          setCourseLoading(false);
        }
      });

    return () => ac.abort();
  }, [debouncedSearch, reloadKey, offset]);

  // Load chapters when a course is selected
  const chapterAbortRef = useRef<AbortController | null>(null);
  const loadChapters = (courseId: string) => {
    chapterAbortRef.current?.abort();
    const ac = new AbortController();
    chapterAbortRef.current = ac;

    setChapterLoading(true);
    setChapterError(null);

    allAdminChapters(courseId, ac.signal)
      .then((res) => {
        if (!ac.signal.aborted) {
          setChapters(res);
          setChapterLoading(false);
        }
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          setChapterError(formatAdminErrorMessage(err));
          setChapterLoading(false);
        }
      });
  };

  const handleSelectCourse = (course: AdminCourseRow) => {
    setChapters([]);
    setSelectedCourse(course);
    loadChapters(course.id);
  };
  useEffect(() => () => chapterAbortRef.current?.abort(), []);

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Quản lý Khóa học & Chương</h2>
          <p className="admin-page-subtitle">
            Cấu hình danh mục giáo trình, cây phân cấp khóa học và thứ tự các
            chương bài giảng.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="admin-btn secondary"
            onClick={() => setReloadKey((n) => n + 1)}
            disabled={courseLoading}
          >
            <RefreshCw size={15} className={courseLoading ? "spin" : ""} />
            <span>Làm mới</span>
          </button>
          <button
            className="admin-btn primary"
            onClick={() => setCreateCourseOpen(true)}
          >
            <Plus size={16} />
            <span>Tạo khóa học mới</span>
          </button>
        </div>
      </div>

      {/* Main 2-column layout when course selected */}
      <div className="admin-split-layout">
        {/* Left column: Courses List */}
        <div className="split-column-main">
          {/* Search bar */}
          <div className="admin-card filter-toolbar">
            <div className="search-input-wrapper">
              <Search size={16} />
              <input
                type="text"
                placeholder="Tìm khóa học theo tên hoặc ID..."
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
            <span className="count-label">{coursesTotal} khóa học</span>
          </div>

          {courseError && (
            <div className="admin-card admin-error-card">
              <AlertCircle size={20} />
              <span>{courseError}</span>
            </div>
          )}

          {/* Courses Table */}
          <div className="admin-card table-card">
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Khóa học</th>
                    <th>Giáo trình</th>
                    <th>Thứ tự</th>
                    <th>Chương</th>
                    <th>Bài</th>
                    <th>Trạng thái</th>
                    <th className="text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {courseLoading && courses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">
                        <div className="loading-spinner-row">
                          <RefreshCw size={18} className="spin" />
                          <span>Đang tải danh sách khóa học...</span>
                        </div>
                      </td>
                    </tr>
                  ) : courses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted">
                        Chưa có khóa học nào. Bấm "Tạo khóa học mới" để bắt đầu.
                      </td>
                    </tr>
                  ) : (
                    courses.map((c) => {
                      const isSelected = selectedCourse?.id === c.id;
                      return (
                        <tr
                          key={c.id}
                          className={`clickable-row ${isSelected ? "row-selected" : ""}`}
                          onClick={() => handleSelectCourse(c)}
                        >
                          <td>
                            <div className="course-title-cell">
                              <b>{c.title}</b>
                              <small>ID: {c.id}</small>
                              {c.description && (
                                <p className="course-table-desc">
                                  {c.description}
                                </p>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="family-tag">
                              {c.curriculum_family} · {c.syllabus_version}
                            </span>
                            {c.hsk_level !== null && (
                              <small className="d-block">
                                HSK {c.hsk_level}
                              </small>
                            )}
                          </td>
                          <td>
                            <span className="sort-pill">#{c.sort_order}</span>
                          </td>
                          <td>{c.chapters}</td>
                          <td>
                            <span>{c.lessons} đã xuất bản</span>
                            {c.drafts > 0 && (
                              <small className="d-block text-gold">
                                ({c.drafts} nháp)
                              </small>
                            )}
                          </td>
                          <td>
                            {c.is_published ? (
                              <span className="status-badge active">
                                <CheckCircle2 size={12} /> Đã xuất bản
                              </span>
                            ) : (
                              <span
                                className="status-badge warning"
                                title="Khóa học sẽ hiển thị với học viên sau khi có bài xuất bản"
                              >
                                <Clock size={12} /> Chưa xuất bản
                              </span>
                            )}
                          </td>
                          <td
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="action-button-group">
                              <button
                                className="admin-btn secondary mini"
                                onClick={() => {
                                  setTargetEditCourse(c);
                                  setEditCourseOpen(true);
                                }}
                                title="Sửa tên, mô tả và thứ tự"
                              >
                                <Edit2 size={13} /> Sửa
                              </button>
                              <button
                                className={`admin-btn mini ${isSelected ? "primary" : "secondary"}`}
                                onClick={() => handleSelectCourse(c)}
                              >
                                <span>Chương</span>
                                <ChevronRight size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right column: Chapters of selected course */}
        <div className="split-column-side">
          {selectedCourse ? (
            <div className="admin-card chapters-panel">
              <div className="panel-header-with-actions">
                <div>
                  <span className="panel-eyebrow">DANH SÁCH CHƯƠNG</span>
                  <h3
                    className="panel-title-strong"
                    title={selectedCourse.title}
                  >
                    {selectedCourse.title}
                  </h3>
                  <small className="text-muted">ID: {selectedCourse.id}</small>
                </div>
                <button
                  className="admin-btn primary mini"
                  onClick={() => setCreateChapterOpen(true)}
                >
                  <Plus size={14} /> Thêm chương
                </button>
              </div>

              {chapterError && (
                <div className="alert-box error mini mb-3">
                  <AlertCircle size={14} />
                  <span>{chapterError}</span>
                </div>
              )}

              {chapterLoading ? (
                <div className="loading-box py-6">
                  <RefreshCw size={18} className="spin" />
                  <span>Đang tải danh sách chương...</span>
                </div>
              ) : chapters.length === 0 ? (
                <div className="empty-state-compact py-8">
                  <FolderOpen size={24} />
                  <span>Chưa có chương nào trong khóa này.</span>
                  <button
                    className="admin-btn secondary mini mt-2"
                    onClick={() => setCreateChapterOpen(true)}
                  >
                    Thêm chương đầu tiên
                  </button>
                </div>
              ) : (
                <div className="chapters-list">
                  {chapters.map((ch) => (
                    <div key={ch.id} className="chapter-item card">
                      <div className="chapter-item-top">
                        <div className="chapter-order-badge">
                          <Hash size={12} /> {ch.sort_order}
                        </div>
                        <button
                          className="icon-button mini-edit"
                          onClick={() => {
                            setTargetEditChapter(ch);
                            setEditChapterOpen(true);
                          }}
                          title="Sửa chương"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>

                      <h4 className="chapter-title">{ch.title}</h4>
                      <code className="chapter-id">{ch.id}</code>
                      {ch.description && (
                        <p className="chapter-desc">{ch.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="admin-card chapters-panel empty-selection">
              <FolderOpen size={36} />
              <h4>Chọn một khóa học</h4>
              <p>
                Bấm vào một khóa học ở bảng bên trái để xem và quản lý danh sách
                các chương bài giảng.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="table-pagination" aria-label="Phân trang khóa học">
        <span>
          {coursesTotal} khóa học · Trang {Math.floor(offset / limit) + 1} /{" "}
          {Math.max(1, Math.ceil(coursesTotal / limit))}
        </span>
        <div className="pagination-controls">
          <button
            className="admin-btn secondary"
            disabled={offset === 0 || courseLoading}
            onClick={() => setOffset((n) => Math.max(0, n - limit))}
          >
            Trước
          </button>
          <button
            className="admin-btn secondary"
            disabled={offset + limit >= coursesTotal || courseLoading}
            onClick={() => setOffset((n) => n + limit)}
          >
            Sau
          </button>
        </div>
      </div>
      {/* Dialog: Create Course */}
      {createCourseOpen && (
        <CreateCourseDialog
          onClose={() => setCreateCourseOpen(false)}
          onSuccess={() => {
            setCreateCourseOpen(false);
            setReloadKey((n) => n + 1);
          }}
        />
      )}

      {/* Dialog: Edit Course */}
      {editCourseOpen && targetEditCourse && (
        <EditCourseDialog
          course={targetEditCourse}
          onClose={() => {
            setEditCourseOpen(false);
            setTargetEditCourse(null);
          }}
          onSuccess={() => {
            setEditCourseOpen(false);
            setTargetEditCourse(null);
            setReloadKey((n) => n + 1);
          }}
        />
      )}

      {/* Dialog: Create Chapter */}
      {createChapterOpen && selectedCourse && (
        <CreateChapterDialog
          courseId={selectedCourse.id}
          existingOrders={chapters.map((c) => c.sort_order)}
          onClose={() => setCreateChapterOpen(false)}
          onSuccess={() => {
            setCreateChapterOpen(false);
            loadChapters(selectedCourse.id);
            setReloadKey((n) => n + 1);
          }}
        />
      )}

      {/* Dialog: Edit Chapter */}
      {editChapterOpen && targetEditChapter && selectedCourse && (
        <EditChapterDialog
          courseId={selectedCourse.id}
          chapter={targetEditChapter}
          existingOrders={chapters
            .filter((c) => c.id !== targetEditChapter.id)
            .map((c) => c.sort_order)}
          onClose={() => {
            setEditChapterOpen(false);
            setTargetEditChapter(null);
          }}
          onSuccess={() => {
            setEditChapterOpen(false);
            setTargetEditChapter(null);
            loadChapters(selectedCourse.id);
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Sub-Dialog: Create Course
// -------------------------------------------------------------
function CreateCourseDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(1);
  const [family, setFamily] = useState<"foundation" | "HSK">("foundation");
  const [syllabusVersion, setSyllabusVersion] = useState("v1");
  const [hskLevel, setHskLevel] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());
  const titleId = useId();
  useAdminDialog(onClose, busy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = id.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,99}$/.test(cleanId)) {
      setError(
        "ID khóa học phải bắt đầu bằng chữ cái thường và chỉ chứa ký tự a-z, 0-9, gạch ngang (2–100 ký tự).",
      );
      return;
    }
    if (!title.trim()) {
      setError("Tên khóa học không được để trống.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await adminCommand("course.save", {
        requestId: requestIdRef.current,
        id: cleanId,
        expectedRevision: 0,
        title: title.trim(),
        description: description.trim(),
        sortOrder: Number(sortOrder),
        family,
        syllabusVersion: syllabusVersion.trim(),
        hskLevel: family === "HSK" && hskLevel !== "" ? Number(hskLevel) : null,
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
          <h3 id={titleId}>Tạo khóa học mới</h3>
          <button
            className="icon-button"
            onClick={busy ? undefined : onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-form">
          {error && (
            <div className="alert-box error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <p className="dialog-hint-text">
            Khóa học mới được tạo ở trạng thái <b>chưa xuất bản</b> và sẽ tự
            động hiển thị với học viên sau khi bạn xuất bản bài học đầu tiên
            trong khóa.
          </p>

          <label>
            <span>Mã định danh (ID khóa học, chữ thường & gạch ngang) *</span>
            <input
              type="text"
              required
              placeholder="ví dụ: hsk1-standard, beginner-speak"
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase())}
              disabled={busy}
            />
          </label>

          <label>
            <span>Tên khóa học (1–200 ký tự) *</span>
            <input
              type="text"
              required
              maxLength={200}
              placeholder="ví dụ: HSK 1 Tiêu chuẩn"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            <span>Mô tả khóa học</span>
            <textarea
              rows={3}
              maxLength={5000}
              placeholder="Mục tiêu và đối tượng của khóa học..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </label>

          <div className="form-grid-2">
            <label>
              <span>Nhóm giáo trình (Family) *</span>
              <select
                value={family}
                onChange={(e) =>
                  setFamily(e.target.value as "foundation" | "HSK")
                }
                disabled={busy}
              >
                <option value="foundation">
                  foundation (Nhập môn nền tảng)
                </option>
                <option value="HSK">HSK (Tiêu chuẩn HSK)</option>
              </select>
            </label>

            <label>
              <span>Phiên bản giáo trình *</span>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="ví dụ: hsk-2026-v1"
                value={syllabusVersion}
                onChange={(e) => setSyllabusVersion(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>

          <div className="form-grid-2">
            {family === "HSK" && (
              <label>
                <span>Cấp độ HSK (1–9)</span>
                <input
                  type="number"
                  required
                  min={1}
                  max={9}
                  placeholder="1"
                  value={hskLevel}
                  onChange={(e) =>
                    setHskLevel(e.target.value ? Number(e.target.value) : "")
                  }
                  disabled={busy}
                />
              </label>
            )}

            <label>
              <span>Thứ tự hiển thị (sortOrder) *</span>
              <input
                type="number"
                min={0}
                max={1000000}
                required
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                disabled={busy}
              />
            </label>
          </div>

          <div className="dialog-footer">
            <button
              type="button"
              className="admin-btn secondary"
              onClick={busy ? undefined : onClose}
              disabled={busy}
            >
              Hủy
            </button>
            <button type="submit" className="admin-btn primary" disabled={busy}>
              {busy ? "Đang tạo..." : "Tạo khóa học"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Sub-Dialog: Edit Course
// -------------------------------------------------------------
function EditCourseDialog({
  course,
  onClose,
  onSuccess,
}: {
  course: AdminCourseRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description || "");
  const [sortOrder, setSortOrder] = useState(course.sort_order);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());
  const titleId = useId();
  useAdminDialog(onClose, busy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Tên khóa học không được để trống.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await adminCommand("course.save", {
        requestId: requestIdRef.current,
        id: course.id,
        expectedRevision: course.admin_revision,
        title: title.trim(),
        description: description.trim(),
        sortOrder: Number(sortOrder),
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
          <h3 id={titleId}>Sửa thông tin khóa học</h3>
          <button
            className="icon-button"
            onClick={busy ? undefined : onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-form">
          {error && (
            <div className="alert-box error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="readonly-fields-banner">
            <div>
              <small>ID khóa học (Bất biến)</small>
              <code>{course.id}</code>
            </div>
            <div>
              <small>Giáo trình (Bất biến)</small>
              <span>
                {course.curriculum_family} · {course.syllabus_version}
                {course.hsk_level !== null && ` (HSK ${course.hsk_level})`}
              </span>
            </div>
          </div>

          <label>
            <span>Tên khóa học (1–200 ký tự) *</span>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            <span>Mô tả khóa học</span>
            <textarea
              rows={3}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            <span>Thứ tự hiển thị (sortOrder) *</span>
            <input
              type="number"
              min={0}
              max={1000000}
              required
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              disabled={busy}
            />
          </label>

          <div className="dialog-footer">
            <button
              type="button"
              className="admin-btn secondary"
              onClick={busy ? undefined : onClose}
              disabled={busy}
            >
              Hủy
            </button>
            <button type="submit" className="admin-btn primary" disabled={busy}>
              {busy ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Sub-Dialog: Create Chapter
// -------------------------------------------------------------
function CreateChapterDialog({
  courseId,
  existingOrders,
  onClose,
  onSuccess,
}: {
  courseId: string;
  existingOrders: number[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const nextOrder =
    existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 0;
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(nextOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());
  const titleId = useId();
  useAdminDialog(onClose, busy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = id.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,99}$/.test(cleanId)) {
      setError(
        "ID chương phải bắt đầu bằng chữ cái thường và chỉ chứa ký tự a-z, 0-9, gạch ngang.",
      );
      return;
    }
    if (!title.trim()) {
      setError("Tên chương không được để trống.");
      return;
    }
    if (existingOrders.includes(Number(sortOrder))) {
      setError(
        `Thứ tự chương #${sortOrder} đã tồn tại trong khóa này. Vui lòng chọn số thứ tự khác.`,
      );
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await adminCommand("chapter.save", {
        requestId: requestIdRef.current,
        id: cleanId,
        courseId,
        expectedRevision: 0,
        title: title.trim(),
        description: description.trim(),
        sortOrder: Number(sortOrder),
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
          <h3 id={titleId}>Thêm chương mới</h3>
          <button
            className="icon-button"
            onClick={busy ? undefined : onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-form">
          {error && (
            <div className="alert-box error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <p className="dialog-hint-text">
            Thêm chương học vào khóa <code>{courseId}</code>. Thứ tự chương phải
            là duy nhất.
          </p>

          <label>
            <span>Mã định danh chương (ID) *</span>
            <input
              type="text"
              required
              placeholder="ví dụ: ch01-greetings, ch02-pinyin"
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase())}
              disabled={busy}
            />
          </label>

          <label>
            <span>Tên chương *</span>
            <input
              type="text"
              required
              maxLength={200}
              placeholder="ví dụ: Bài 1 · Chào hỏi và làm quen"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            <span>Mô tả chương</span>
            <textarea
              rows={2}
              maxLength={5000}
              placeholder="Tóm tắt nội dung trọng tâm của chương..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            <span>Thứ tự chương trong khóa (duy nhất) *</span>
            <input
              type="number"
              min={0}
              max={1000000}
              required
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              disabled={busy}
            />
          </label>

          <div className="dialog-footer">
            <button
              type="button"
              className="admin-btn secondary"
              onClick={busy ? undefined : onClose}
              disabled={busy}
            >
              Hủy
            </button>
            <button type="submit" className="admin-btn primary" disabled={busy}>
              {busy ? "Đang thêm..." : "Thêm chương"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Sub-Dialog: Edit Chapter
// -------------------------------------------------------------
function EditChapterDialog({
  courseId,
  chapter,
  existingOrders,
  onClose,
  onSuccess,
}: {
  courseId: string;
  chapter: AdminChapterRow;
  existingOrders: number[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(chapter.title);
  const [description, setDescription] = useState(chapter.description || "");
  const [sortOrder, setSortOrder] = useState(chapter.sort_order);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());
  const titleId = useId();
  useAdminDialog(onClose, busy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Tên chương không được để trống.");
      return;
    }
    if (existingOrders.includes(Number(sortOrder))) {
      setError(
        `Thứ tự chương #${sortOrder} đã bị trùng với chương khác trong khóa.`,
      );
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await adminCommand("chapter.save", {
        requestId: requestIdRef.current,
        id: chapter.id,
        courseId,
        expectedRevision: chapter.admin_revision,
        title: title.trim(),
        description: description.trim(),
        sortOrder: Number(sortOrder),
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
          <h3 id={titleId}>Sửa thông tin chương</h3>
          <button
            className="icon-button"
            onClick={busy ? undefined : onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-form">
          {error && (
            <div className="alert-box error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="readonly-fields-banner">
            <div>
              <small>ID chương</small>
              <code>{chapter.id}</code>
            </div>
            <div>
              <small>Thuộc khóa</small>
              <code>{courseId}</code>
            </div>
          </div>

          <label>
            <span>Tên chương *</span>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            <span>Mô tả chương</span>
            <textarea
              rows={2}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            <span>Thứ tự chương trong khóa *</span>
            <input
              type="number"
              min={0}
              max={1000000}
              required
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              disabled={busy}
            />
          </label>

          <div className="dialog-footer">
            <button
              type="button"
              className="admin-btn secondary"
              onClick={busy ? undefined : onClose}
              disabled={busy}
            >
              Hủy
            </button>
            <button type="submit" className="admin-btn primary" disabled={busy}>
              {busy ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
