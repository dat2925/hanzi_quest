import { useAdminDialog } from "../use-dialog";
import React, { useEffect, useState, useRef, useId } from "react";
import {
  Search,
  Filter,
  UserX,
  UserCheck,
  Shield,
  Edit2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  X,
  Clock,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import {
  AdminApi,
  adminCommand,
  formatAdminErrorMessage,
  formatVietnamDateTime,
  AdminApiError,
} from "../api";
import type {
  AdminUserRow,
  AdminUserDetail,
  AdminRole,
} from "../platform-types";

interface UsersViewProps {
  currentUserId?: string;
}

export function UsersView({ currentUserId }: UsersViewProps) {
  // Filters & Pagination
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "suspended"
  >("all");
  const [roleFilter, setRoleFilter] = useState<"all" | AdminRole>("all");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  // Detail Drawer state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lessonOffset, setLessonOffset] = useState(0);
  const lessonLimit = 10;

  // Dialog states
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editAccessOpen, setEditAccessOpen] = useState(false);
  const [editRoleOpen, setEditRoleOpen] = useState(false);

  // Search debounce 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset offset on filter change
  const handleStatusChange = (val: "all" | "active" | "suspended") => {
    setStatusFilter(val);
    setOffset(0);
  };

  const handleRoleChange = (val: "all" | AdminRole) => {
    setRoleFilter(val);
    setOffset(0);
  };

  // Fetch users list with cancellation
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    AdminApi.getUsers(
      {
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        role: roleFilter === "all" ? undefined : roleFilter,
        limit,
        offset,
      },
      ac.signal,
    )
      .then((res) => {
        if (!ac.signal.aborted) {
          setUsers(res.items);
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
  }, [debouncedSearch, statusFilter, roleFilter, offset, reloadKey]);

  // Fetch user detail
  const detailAbortRef = useRef<AbortController | null>(null);
  const loadUserDetail = (userId: string, lOffset = 0) => {
    detailAbortRef.current?.abort();
    const ac = new AbortController();
    detailAbortRef.current = ac;

    setDetailLoading(true);
    setDetailError(null);

    AdminApi.getUserDetail(
      userId,
      { limit: lessonLimit, offset: lOffset },
      ac.signal,
    )
      .then((res) => {
        if (!ac.signal.aborted) {
          setDetail(res);
          setDetailLoading(false);
        }
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          setDetailError(formatAdminErrorMessage(err));
          setDetailLoading(false);
        }
      });
  };

  const handleOpenDetail = (userId: string) => {
    setDetail(null);
    setEditProfileOpen(false);
    setEditAccessOpen(false);
    setEditRoleOpen(false);
    setSelectedUserId(userId);
    setLessonOffset(0);
    loadUserDetail(userId, 0);
  };

  const handleCloseDetail = () => {
    detailAbortRef.current?.abort();
    setSelectedUserId(null);
    setDetail(null);
    setEditProfileOpen(false);
    setEditAccessOpen(false);
    setEditRoleOpen(false);
  };
  useEffect(() => () => detailAbortRef.current?.abort(), []);
  useAdminDialog(handleCloseDetail, false, !!selectedUserId);

  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="admin-page-container">
      {/* Page Title & Search/Filter Controls */}
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Quản lý người dùng</h2>
          <p className="admin-page-subtitle">
            Tra cứu tài khoản, quản lý vai trò và trạng thái quyền sử dụng
            HanziOne.
          </p>
        </div>
        <button
          className="admin-btn secondary"
          onClick={() => setReloadKey((n) => n + 1)}
          disabled={loading}
          title="Tải lại danh sách"
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="admin-card filter-toolbar">
        <div className="search-input-wrapper">
          <Search size={16} />
          <input
            type="text"
            placeholder="Tìm theo email, tên hiển thị hoặc UUID..."
            aria-label="Tìm người dùng"
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
          <div className="select-with-icon">
            <Filter size={14} />
            <select
              aria-label="Lọc trạng thái người dùng"
              value={statusFilter}
              onChange={(e) =>
                handleStatusChange(
                  e.target.value as "all" | "active" | "suspended",
                )
              }
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="suspended">Tạm khóa</option>
            </select>
          </div>

          <div className="select-with-icon">
            <Shield size={14} />
            <select
              aria-label="Lọc vai trò người dùng"
              value={roleFilter}
              onChange={(e) =>
                handleRoleChange(e.target.value as "all" | AdminRole)
              }
            >
              <option value="all">Tất cả vai trò</option>
              <option value="learner">Người học (Learner)</option>
              <option value="editor">Biên tập viên (Editor)</option>
              <option value="admin">Quản trị viên (Admin)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="admin-card admin-error-card">
          <AlertCircle size={24} />
          <div>
            <h3>Lỗi tải danh sách người dùng</h3>
            <p>{error}</p>
          </div>
          <button
            className="admin-btn secondary"
            onClick={() => setReloadKey((n) => n + 1)}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="admin-card table-card">
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Tổng XP</th>
                <th>Bài xong</th>
                <th>Đăng nhập cuối</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <div className="loading-spinner-row">
                      <RefreshCw size={18} className="spin" />
                      <span>Đang tải danh sách người dùng...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted">
                    Không tìm thấy người dùng nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = u.id === currentUserId;
                  return (
                    <tr
                      key={u.id}
                      className={u.suspended ? "row-suspended" : ""}
                    >
                      <td>
                        <div className="user-cell">
                          <b>{u.display_name || "Chưa thiết lập"}</b>
                          <small className="user-email" title={u.email || u.id}>
                            {u.email || `UUID: ${u.id.slice(0, 12)}...`}
                          </small>
                          {isCurrent && (
                            <span className="self-tag">
                              (Tài khoản của bạn)
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`role-badge ${u.role}`}>
                          {u.role === "admin"
                            ? "Admin"
                            : u.role === "editor"
                              ? "Editor"
                              : "Learner"}
                        </span>
                      </td>
                      <td>
                        {u.suspended ? (
                          <span className="status-badge suspended">
                            <UserX size={12} /> Tạm khóa
                          </span>
                        ) : (
                          <span className="status-badge active">
                            <UserCheck size={12} /> Hoạt động
                          </span>
                        )}
                      </td>
                      <td>
                        <b>{u.total_xp}</b> <small>XP</small>
                      </td>
                      <td>
                        <b>{u.completed_lessons}</b> bài
                      </td>
                      <td className="text-muted text-sm">
                        {formatVietnamDateTime(u.last_sign_in_at)}
                      </td>
                      <td className="text-right">
                        <button
                          className="admin-btn secondary mini"
                          onClick={() => handleOpenDetail(u.id)}
                        >
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        <div className="table-pagination">
          <span className="pagination-info">
            Hiển thị <b>{users.length}</b> trên tổng số <b>{total}</b> người
            dùng
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

      {/* User Detail Drawer / Modal */}
      {selectedUserId && (
        <div className="admin-modal-backdrop" onClick={handleCloseDetail}>
          <div
            className="admin-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-drawer-title"
          >
            <div className="drawer-header">
              <div>
                <span className="drawer-eyebrow">CHI TIẾT TÀI KHOẢN</span>
                <h3 id="user-drawer-title">
                  {detail?.profile?.display_name ||
                    detail?.email ||
                    "Người dùng"}
                </h3>
              </div>
              <button
                className="icon-button"
                onClick={handleCloseDetail}
                aria-label="Đóng chi tiết"
              >
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              {detailLoading && !detail ? (
                <div className="loading-box">
                  <RefreshCw size={24} className="spin" />
                  <span>Đang tải thông tin chi tiết người dùng...</span>
                </div>
              ) : detailError ? (
                <div className="admin-error-card">
                  <AlertCircle size={20} />
                  <span>{detailError}</span>
                </div>
              ) : detail ? (
                <>
                  {/* Account Overview Card */}
                  <div className="drawer-section card">
                    <div className="section-title-row">
                      <h4>Thông tin tài khoản</h4>
                      <div className="section-badges">
                        <span className={`role-badge ${detail.role}`}>
                          {detail.role.toUpperCase()}
                        </span>
                        {detail.suspended ? (
                          <span className="status-badge suspended">
                            Tạm khóa
                          </span>
                        ) : (
                          <span className="status-badge active">Hoạt động</span>
                        )}
                      </div>
                    </div>

                    <div className="info-kv-grid">
                      <div>
                        <small>UUID</small>
                        <code title={detail.id}>{detail.id}</code>
                      </div>
                      <div>
                        <small>Email</small>
                        <b>{detail.email || "Chưa có email"}</b>
                      </div>
                      <div>
                        <small>Ngày tạo</small>
                        <span>{formatVietnamDateTime(detail.created_at)}</span>
                      </div>
                      <div>
                        <small>Đăng nhập cuối</small>
                        <span>
                          {formatVietnamDateTime(detail.last_sign_in_at)}
                        </span>
                      </div>
                      <div>
                        <small>Phiên bản dữ liệu (Revision)</small>
                        <span>#{detail.revision}</span>
                      </div>
                      {detail.suspended && (
                        <div className="full-width-kv text-alert">
                          <small>Lý do tạm khóa</small>
                          <b>{detail.reason || "Không ghi rõ"}</b>
                        </div>
                      )}
                    </div>

                    {/* Action buttons on user */}
                    <div className="drawer-actions-row">
                      <button
                        className="admin-btn secondary"
                        onClick={() => setEditProfileOpen(true)}
                      >
                        <Edit2 size={14} /> Sửa hồ sơ
                      </button>

                      <button
                        className="admin-btn secondary"
                        onClick={() => setEditRoleOpen(true)}
                        disabled={detail.id === currentUserId}
                        title={
                          detail.id === currentUserId
                            ? "Không thể tự đổi vai trò của chính mình"
                            : "Đổi vai trò người dùng"
                        }
                      >
                        <Shield size={14} /> Đổi vai trò
                      </button>

                      <button
                        className={`admin-btn ${detail.suspended ? "primary" : "secondary alert-btn"}`}
                        onClick={() => setEditAccessOpen(true)}
                        disabled={detail.id === currentUserId}
                        title={
                          detail.id === currentUserId
                            ? "Không thể tự khóa tài khoản của chính mình"
                            : detail.suspended
                              ? "Mở lại quyền sử dụng HanziOne"
                              : "Tạm khóa quyền sử dụng HanziOne"
                        }
                      >
                        {detail.suspended ? (
                          <>
                            <UserCheck size={14} /> Mở khóa sử dụng
                          </>
                        ) : (
                          <>
                            <UserX size={14} /> Tạm khóa sử dụng
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Profile & Settings Details */}
                  <div className="drawer-section card">
                    <h4>Hồ sơ & Mục tiêu học tập</h4>
                    {detail.profile ? (
                      <div className="info-kv-grid">
                        <div>
                          <small>Tên hiển thị</small>
                          <b>{detail.profile.display_name || "Chưa đặt"}</b>
                        </div>
                        <div>
                          <small>Mục tiêu HSK</small>
                          <b>{detail.profile.target_hsk || "Chưa đặt"}</b>
                        </div>
                        <div>
                          <small>Mục tiêu học mỗi ngày</small>
                          <span>
                            {detail.profile.daily_goal_minutes} phút/ngày
                          </span>
                        </div>
                        <div>
                          <small>Khung giờ học ưa thích</small>
                          <span>
                            {detail.profile.preferred_study_time || "Chưa đặt"}
                          </span>
                        </div>
                        <div>
                          <small>Kinh nghiệm tiếng Trung</small>
                          <span>{detail.profile.experience || "Chưa đặt"}</span>
                        </div>
                        <div>
                          <small>Cập nhật hồ sơ lần cuối</small>
                          <span>
                            {formatVietnamDateTime(detail.profile.updated_at)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-notice">
                        Người dùng chưa hoàn thành thiết lập hồ sơ cá nhân.
                      </div>
                    )}
                  </div>

                  {/* Study Statistics */}
                  <div className="drawer-section card">
                    <h4>Thống kê học tập</h4>
                    {detail.stats ? (
                      <div className="stats-metric-row">
                        <div className="mini-stat-box">
                          <Award size={18} />
                          <div>
                            <b>{detail.stats.total_xp}</b>
                            <small>Tổng XP</small>
                          </div>
                        </div>
                        <div className="mini-stat-box">
                          <Clock size={18} />
                          <div>
                            <b>
                              {Math.round(
                                detail.stats.total_study_seconds / 60,
                              )}
                            </b>
                            <small>Phút học</small>
                          </div>
                        </div>
                        <div className="mini-stat-box">
                          <Calendar size={18} />
                          <div>
                            <b>{detail.stats.current_streak}</b>
                            <small>Chuỗi ngày</small>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-notice">
                        Chưa có bản ghi thống kê học tập.
                      </div>
                    )}
                  </div>

                  {/* Lesson Progress Table */}
                  <div className="drawer-section card">
                    <div className="section-title-row">
                      <h4>Tiến độ bài học ({detail.progressTotal} bản ghi)</h4>
                    </div>

                    {detail.lessonProgress.length === 0 ? (
                      <div className="empty-notice">
                        Chưa tham gia học bài nào.
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="admin-table mini-table">
                          <thead>
                            <tr>
                              <th>Bài học</th>
                              <th>Trạng thái</th>
                              <th>Điểm cao nhất</th>
                              <th>Lần thử</th>
                              <th>Hoàn thành</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.lessonProgress.map((lp) => (
                              <tr key={lp.lesson_id}>
                                <td>
                                  <b>{lp.title || lp.lesson_id}</b>
                                </td>
                                <td>
                                  {lp.completion_status === "completed" ? (
                                    <span className="status-badge active">
                                      <CheckCircle2 size={12} /> Hoàn thành
                                    </span>
                                  ) : (
                                    <span className="status-badge warning">
                                      Đang học
                                    </span>
                                  )}
                                </td>
                                <td>{Math.round(lp.best_score * 100)}%</td>
                                <td>{lp.attempt_count} lần</td>
                                <td>
                                  {formatVietnamDateTime(lp.completed_at)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Lesson Pagination */}
                    {detail.progressTotal > lessonLimit && (
                      <div className="table-pagination mini">
                        <span>
                          {lessonOffset + 1} -{" "}
                          {Math.min(
                            lessonOffset + lessonLimit,
                            detail.progressTotal,
                          )}{" "}
                          / {detail.progressTotal}
                        </span>
                        <div className="pagination-controls">
                          <button
                            className="admin-btn secondary mini"
                            disabled={lessonOffset === 0}
                            onClick={() => {
                              const nextOffset = Math.max(
                                0,
                                lessonOffset - lessonLimit,
                              );
                              setLessonOffset(nextOffset);
                              loadUserDetail(detail.id, nextOffset);
                            }}
                          >
                            Trước
                          </button>
                          <button
                            className="admin-btn secondary mini"
                            disabled={
                              lessonOffset + lessonLimit >= detail.progressTotal
                            }
                            onClick={() => {
                              const nextOffset = lessonOffset + lessonLimit;
                              setLessonOffset(nextOffset);
                              loadUserDetail(detail.id, nextOffset);
                            }}
                          >
                            Sau
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Dialog */}
      {editProfileOpen && detail && (
        <EditProfileDialog
          user={detail}
          onClose={() => setEditProfileOpen(false)}
          onSuccess={() => {
            setEditProfileOpen(false);
            loadUserDetail(detail.id, lessonOffset);
            setReloadKey((n) => n + 1);
          }}
        />
      )}

      {/* Edit Access (Suspend/Unsuspend) Dialog */}
      {editAccessOpen && detail && (
        <EditAccessDialog
          user={detail}
          onClose={() => setEditAccessOpen(false)}
          onSuccess={() => {
            setEditAccessOpen(false);
            loadUserDetail(detail.id, lessonOffset);
            setReloadKey((n) => n + 1);
          }}
        />
      )}

      {/* Edit Role Dialog */}
      {editRoleOpen && detail && (
        <EditRoleDialog
          user={detail}
          onClose={() => setEditRoleOpen(false)}
          onSuccess={() => {
            setEditRoleOpen(false);
            loadUserDetail(detail.id, lessonOffset);
            setReloadKey((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Sub-Dialog 1: Sửa hồ sơ
// -------------------------------------------------------------
function EditProfileDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUserDetail;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [displayName, setDisplayName] = useState(
    user.profile?.display_name || user.email?.split("@")[0] || "",
  );
  const [targetHsk, setTargetHsk] = useState(
    user.profile?.target_hsk || "HSK 1",
  );
  const [dailyMinutes, setDailyMinutes] = useState(
    user.profile?.daily_goal_minutes || 15,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [snapshot, setSnapshot] = useState(user);
  const [compared, setCompared] = useState(false);
  const requestIdRef = useRef(crypto.randomUUID());
  const titleId = useId();
  useAdminDialog(onClose, busy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Tên hiển thị không được để trống");
      return;
    }
    setBusy(true);
    setError(null);
    setHasConflict(false);

    try {
      await adminCommand("user.update", {
        requestId: requestIdRef.current,
        id: user.id,
        expectedRevision: snapshot.revision,
        displayName: displayName.trim(),
        targetHsk: targetHsk.trim(),
        dailyGoalMinutes: Number(dailyMinutes),
        profileUpdatedAt: snapshot.profile?.updated_at ?? null,
      });
      onSuccess();
    } catch (err) {
      if (
        err instanceof AdminApiError &&
        (err.status === 409 ||
          err.code.includes("CONFLICT") ||
          err.code.includes("PROFILE_CHANGED"))
      ) {
        setHasConflict(true);
        requestIdRef.current = crypto.randomUUID();
      }
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
          <h3 id={titleId}>Sửa hồ sơ người dùng</h3>
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
            <div className={`alert-box ${hasConflict ? "warning" : "error"}`}>
              <AlertCircle size={16} />
              <div>
                <b>{error}</b>
                {hasConflict && (
                  <div>
                    <p>
                      Dữ liệu người dùng đã có thay đổi mới từ học viên hoặc
                      quản trị viên khác. Dữ liệu bạn vừa nhập vẫn được giữ
                      trong form. Vui lòng kiểm tra lại trước khi gửi.
                    </p>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const latest = await AdminApi.getUserDetail(user.id);
                          setSnapshot(latest);
                          setCompared(true);
                          setHasConflict(false);
                          setError(null);
                        } catch (err) {
                          setError(formatAdminErrorMessage(err));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Tải bản mới, giữ nội dung đang sửa
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {compared && (
            <div className="readonly-fields-banner" role="status">
              Bản mới trên máy chủ:{" "}
              {snapshot.profile?.display_name || "Chưa có tên"} ·{" "}
              {snapshot.profile?.target_hsk || "Chưa thiết lập"} ·{" "}
              {snapshot.profile?.daily_goal_minutes ?? 15} phút/ngày. Nội dung
              bạn nhập bên dưới được giữ nguyên. Đối chiếu rồi bấm Lưu thay đổi
              nếu muốn áp dụng.
            </div>
          )}

          <label>
            <span>Tên hiển thị (1–100 ký tự) *</span>
            <input
              type="text"
              required
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            <span>Mục tiêu HSK *</span>
            <select
              value={targetHsk}
              onChange={(e) => setTargetHsk(e.target.value)}
              disabled={busy}
            >
              <option value="Học cơ bản">Học cơ bản</option>
              <option value="HSK 1">HSK 1</option>
              <option value="HSK 2">HSK 2</option>
              <option value="HSK 3">HSK 3</option>
              <option value="HSK 4">HSK 4</option>
              <option value="HSK 5">HSK 5</option>
              <option value="HSK 6">HSK 6</option>
            </select>
          </label>

          <label>
            <span>Thời gian học mong muốn mỗi ngày (1–180 phút) *</span>
            <input
              type="number"
              min={1}
              max={180}
              required
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
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
// Sub-Dialog 2: Khóa / Mở khóa quyền sử dụng
// -------------------------------------------------------------
function EditAccessDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUserDetail;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isSuspending = !user.suspended;
  const [reason, setReason] = useState(user.reason || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());
  const titleId = useId();
  useAdminDialog(onClose, busy);

  // If user is Admin, cannot be suspended directly
  const isAdminTarget = user.role === "admin";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuspending && !reason.trim()) {
      setError("Vui lòng nhập lý do tạm khóa.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      await adminCommand("user.access", {
        requestId: requestIdRef.current,
        id: user.id,
        expectedRevision: user.revision,
        suspended: isSuspending,
        reason: isSuspending ? reason.trim() : "",
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
            {isSuspending
              ? "Tạm khóa sử dụng HanziOne"
              : "Mở lại quyền sử dụng HanziOne"}
          </h3>
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

          {isSuspending ? (
            <>
              {isAdminTarget && (
                <div className="alert-box warning">
                  <AlertCircle size={16} />
                  <span>
                    Tài khoản này đang có vai trò <b>Quản trị viên (Admin)</b>.
                    Backend yêu cầu bạn cần hạ quyền tài khoản này xuống{" "}
                    <b>Người học (Learner)</b> hoặc{" "}
                    <b>Biên tập viên (Editor)</b> trước khi tạm khóa.
                  </span>
                </div>
              )}

              <p className="dialog-hint-text">
                Thao tác này sẽ <b>tạm khóa quyền sử dụng HanziOne</b> của người
                dùng <b>{user.profile?.display_name || user.email}</b>. Người
                dùng sẽ bị chặn học bài và đọc/ghi dữ liệu tiến độ. Thao tác này{" "}
                <b>không xóa tài khoản Supabase Auth</b>.
              </p>

              <label>
                <span>Lý do tạm khóa (bắt buộc, tối đa 500 ký tự) *</span>
                <textarea
                  required
                  rows={3}
                  maxLength={500}
                  placeholder="Ví dụ: Tạm khóa theo yêu cầu hỗ trợ hoặc vi phạm tiêu chuẩn..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy || isAdminTarget}
                />
              </label>
            </>
          ) : (
            <p className="dialog-hint-text">
              Bạn có chắc chắn muốn mở lại quyền học tập và sử dụng HanziOne cho
              tài khoản <b>{user.profile?.display_name || user.email}</b>?
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
              type="submit"
              className={`admin-btn ${isSuspending ? "alert-btn" : "primary"}`}
              disabled={busy || (isSuspending && isAdminTarget)}
            >
              {busy
                ? "Đang xử lý..."
                : isSuspending
                  ? "Xác nhận tạm khóa"
                  : "Xác nhận mở khóa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Sub-Dialog 3: Đổi vai trò (Role)
// -------------------------------------------------------------
function EditRoleDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUserDetail;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [role, setRole] = useState<AdminRole>(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());
  const titleId = useId();
  useAdminDialog(onClose, busy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === user.role) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);

    try {
      await adminCommand("user.role", {
        requestId: requestIdRef.current,
        id: user.id,
        expectedRevision: user.revision,
        role,
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
          <h3 id={titleId}>Phân quyền vai trò người dùng</h3>
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
            Chọn vai trò quản trị cho tài khoản{" "}
            <b>{user.profile?.display_name || user.email}</b>:
          </p>

          <div className="role-options-list">
            <label
              className={`role-radio-item ${role === "learner" ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="userRole"
                value="learner"
                checked={role === "learner"}
                onChange={() => setRole("learner")}
                disabled={busy}
              />
              <div>
                <b>Người học (Learner)</b>
                <span>
                  Quyền học tập thông thường và dữ liệu cá nhân của chính mình.
                </span>
              </div>
            </label>

            <label
              className={`role-radio-item ${role === "editor" ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="userRole"
                value="editor"
                checked={role === "editor"}
                onChange={() => setRole("editor")}
                disabled={busy}
              />
              <div>
                <b>Biên tập viên (Editor)</b>
                <span>
                  Quyền nhập, xem trước 7 màn, duyệt và xuất bản giáo trình bài
                  học.
                </span>
              </div>
            </label>

            <label
              className={`role-radio-item ${role === "admin" ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="userRole"
                value="admin"
                checked={role === "admin"}
                onChange={() => setRole("admin")}
                disabled={busy}
              />
              <div>
                <b>Quản trị viên (Admin)</b>
                <span>
                  Toàn quyền quản trị người dùng, khóa học, bài học và nhật ký
                  hệ thống.
                </span>
              </div>
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
              {busy ? "Đang lưu..." : "Cập nhật vai trò"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
