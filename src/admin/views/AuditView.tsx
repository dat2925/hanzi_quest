import { useAdminDialog } from "../use-dialog";
import { useEffect, useState, useRef, useId } from "react";
import {
  History,
  Search,
  RefreshCw,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  FileCode,
  Calendar,
  User,
  Target,
} from "lucide-react";
import {
  AdminApi,
  formatAdminErrorMessage,
  formatVietnamDateTime,
} from "../api";
import type { AdminAuditRow } from "../platform-types";

export function AuditView() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const [auditList, setAuditList] = useState<AdminAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Selected item for changes detail modal
  const [selectedAudit, setSelectedAudit] = useState<AdminAuditRow | null>(
    null,
  );

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load audit records
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    AdminApi.getAudit(
      {
        search: debouncedSearch.trim() || undefined,
        limit,
        offset,
      },
      ac.signal,
    )
      .then((res) => {
        if (!ac.signal.aborted) {
          setAuditList(res.items);
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
  }, [debouncedSearch, offset, reloadKey]);

  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Nhật ký hoạt động</h2>
          <p className="admin-page-subtitle">
            Truy vết mọi thay đổi phân quyền, trạng thái người dùng và lịch sử
            xuất bản giáo trình.
          </p>
        </div>
        <button
          className="admin-btn secondary"
          onClick={() => setReloadKey((n) => n + 1)}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="admin-card filter-toolbar">
        <div className="search-input-wrapper">
          <Search size={16} />
          <input
            type="text"
            placeholder="Tìm theo hành động (ví dụ: user.role, curriculum.publish) hoặc mục tiêu..."
            aria-label="Tìm nhật ký"
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
        <span className="count-label">{total} sự kiện ghi nhận</span>
      </div>

      {error && (
        <div className="admin-card admin-error-card">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="admin-card table-card">
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Người thực hiện (Actor)</th>
                <th>Hành động (Action)</th>
                <th>Mục tiêu (Target)</th>
                <th className="text-right">Chi tiết thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {loading && auditList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <div className="loading-spinner-row">
                      <RefreshCw size={18} className="spin" />
                      <span>Đang tải nhật ký kiểm toán...</span>
                    </div>
                  </td>
                </tr>
              ) : auditList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted">
                    Không tìm thấy nhật ký hoạt động nào phù hợp.
                  </td>
                </tr>
              ) : (
                auditList.map((item) => (
                  <tr key={item.request_id}>
                    <td className="text-sm">
                      <div className="time-cell">
                        <Calendar size={13} className="text-muted" />
                        <span>{formatVietnamDateTime(item.created_at)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="actor-cell">
                        <User size={13} className="text-muted" />
                        <code title={item.actor}>
                          {item.actor.slice(0, 8)}...
                        </code>
                      </div>
                    </td>
                    <td>
                      <span className="action-badge">
                        <code>{item.action}</code>
                      </span>
                    </td>
                    <td>
                      <div className="target-cell" title={item.target}>
                        <Target size={13} className="text-muted" />
                        <b>{item.target}</b>
                      </div>
                    </td>
                    <td className="text-right">
                      <button
                        className="admin-btn secondary mini"
                        onClick={() => setSelectedAudit(item)}
                      >
                        <FileCode size={13} />
                        <span>Xem thay đổi</span>
                      </button>
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
            Hiển thị <b>{auditList.length}</b> trên tổng số <b>{total}</b> sự
            kiện
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

      {/* Audit Detail Modal */}
      {selectedAudit && (
        <AuditDetailDialog
          audit={selectedAudit}
          onClose={() => setSelectedAudit(null)}
        />
      )}
    </div>
  );
}

function AuditDetailDialog({
  audit,
  onClose,
}: {
  audit: AdminAuditRow;
  onClose: () => void;
}) {
  const titleId = useId();
  useAdminDialog(onClose);

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-dialog card wide-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-header">
          <div>
            <span className="drawer-eyebrow">CHI TIẾT NHẬT KÝ</span>
            <h3 id={titleId}>Sự kiện: {audit.action}</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-form">
          <div className="audit-meta-summary">
            <div>
              <small>Mã yêu cầu (Request ID)</small>
              <code>{audit.request_id}</code>
            </div>
            <div>
              <small>Người thực hiện (Actor)</small>
              <code>{audit.actor}</code>
            </div>
            <div>
              <small>Mục tiêu (Target)</small>
              <b>{audit.target}</b>
            </div>
            <div>
              <small>Thời điểm ghi nhận</small>
              <span>{formatVietnamDateTime(audit.created_at)}</span>
            </div>
          </div>

          <div className="audit-changes-container">
            <div className="changes-label">
              Nội dung thay đổi (Payload Changes):
            </div>
            <pre className="json-code-block">
              {JSON.stringify(audit.changes, null, 2)}
            </pre>
          </div>

          <div className="dialog-footer">
            <button className="admin-btn primary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
