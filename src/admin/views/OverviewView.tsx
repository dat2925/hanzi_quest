import { useEffect, useState, useRef } from "react";
import {
  Users,
  UserCheck,
  BookOpen,
  Sparkles,
  Layers,
  Clock,
  History,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  FileText,
  UserX,
} from "lucide-react";
import {
  AdminApi,
  formatAdminErrorMessage,
  formatVietnamDateTime,
} from "../api";
import type { AdminOverview, AdminAuditRow } from "../platform-types";
import type { AdminTab } from "../AdminLayout";
import { Panda } from "../../Art";

interface OverviewViewProps {
  onNavigate: (tab: AdminTab) => void;
}

export function OverviewView({ onNavigate }: OverviewViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [recentAudit, setRecentAudit] = useState<AdminAuditRow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setLoading(true);
    setError(null);

    Promise.all([
      AdminApi.getOverview(ac.signal),
      AdminApi.getAudit({ limit: 5, offset: 0 }, ac.signal),
    ])
      .then(([overview, audit]) => {
        if (!ac.signal.aborted) {
          setData(overview);
          setRecentAudit(audit.items);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          setError(formatAdminErrorMessage(err));
          setLoading(false);
        }
      });

    return () => {
      ac.abort();
    };
  }, [reloadKey]);

  return (
    <div className="admin-page-container">
      {/* Header bar */}
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Tổng quan hệ thống</h2>
          <p className="admin-page-subtitle">
            Số liệu thời gian thực về người học, tiến trình giảng dạy và nội
            dung HanziOne.
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

      {error ? (
        <div className="admin-card admin-error-card">
          <AlertCircle size={24} />
          <div>
            <h3>Không thể tải dữ liệu tổng quan</h3>
            <p>{error}</p>
          </div>
          <button
            className="admin-btn secondary"
            onClick={() => setReloadKey((n) => n + 1)}
          >
            Thử lại
          </button>
        </div>
      ) : loading && !data ? (
        <div className="admin-grid-cards">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="admin-card skeleton-card">
              <div className="skeleton-line title" />
              <div className="skeleton-line number" />
              <div className="skeleton-line subtitle" />
            </div>
          ))}
        </div>
      ) : data ? (
        <>
          {/* Quick Stat Cards */}
          <div className="admin-grid-cards">
            {/* Card 1: Users */}
            <div className="admin-card stat-metric-card">
              <div className="metric-header">
                <span className="metric-title">Người học đã đăng ký</span>
                <div className="metric-icon-box green">
                  <Users size={20} />
                </div>
              </div>
              <div className="metric-value">{data.users}</div>
              <div className="metric-footer">
                {data.suspendedUsers > 0 ? (
                  <span className="metric-alert-badge">
                    <UserX size={12} /> {data.suspendedUsers} tài khoản tạm khóa
                  </span>
                ) : (
                  <span className="metric-positive">
                    Tất cả tài khoản đang hoạt động
                  </span>
                )}
              </div>
            </div>

            {/* Card 2: 7-day Activity */}
            <div className="admin-card stat-metric-card">
              <div className="metric-header">
                <span className="metric-title">Hoạt động trong 7 ngày</span>
                <div className="metric-icon-box orange">
                  <UserCheck size={20} />
                </div>
              </div>
              <div className="metric-value">{data.activeUsers7d}</div>
              <div className="metric-footer">
                <span>
                  {data.studySessions7d} phiên học hoàn thành trong tuần
                </span>
              </div>
            </div>

            {/* Card 3: Published Curriculum */}
            <div className="admin-card stat-metric-card">
              <div className="metric-header">
                <span className="metric-title">Bài học đã xuất bản</span>
                <div className="metric-icon-box gold">
                  <BookOpen size={20} />
                </div>
              </div>
              <div className="metric-value">{data.publishedLessons}</div>
              <div className="metric-footer">
                <span>Thuộc {data.courses} khóa học đã tạo</span>
              </div>
            </div>

            {/* Card 4: Drafts & Review */}
            <div className="admin-card stat-metric-card">
              <div className="metric-header">
                <span className="metric-title">Bản nháp & Chờ duyệt</span>
                <div className="metric-icon-box teal">
                  <FileText size={20} />
                </div>
              </div>
              <div className="metric-value">{data.draftLessons}</div>
              <div className="metric-footer">
                {data.pendingReview > 0 ? (
                  <span className="metric-badge-review">
                    <Sparkles size={12} /> {data.pendingReview} bài đang chờ
                    duyệt
                  </span>
                ) : (
                  <span>Chưa có bài chờ duyệt xuất bản</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions & Recent Audit Grid */}
          <div className="admin-overview-bottom-grid">
            {/* Quick Actions Panel */}
            <div className="admin-card quick-actions-panel">
              <div className="panel-title-row">
                <Panda small />
                <div>
                  <h3 className="panel-title">Lối tắt tác vụ quản trị</h3>
                  <p className="panel-desc">
                    Điều hướng nhanh đến các khu vực làm việc chính.
                  </p>
                </div>
              </div>

              <div className="quick-actions-list">
                <button
                  className="quick-action-item"
                  onClick={() => onNavigate("users")}
                >
                  <div className="action-item-left">
                    <Users size={18} />
                    <div>
                      <b>Quản lý người dùng</b>
                      <span>Tra cứu, phân quyền, kiểm tra tiến độ học</span>
                    </div>
                  </div>
                  <ArrowRight size={16} />
                </button>

                <button
                  className="quick-action-item"
                  onClick={() => onNavigate("lessons")}
                >
                  <div className="action-item-left">
                    <BookOpen size={18} />
                    <div>
                      <b>Biên tập & Xuất bản bài học</b>
                      <span>
                        Kiểm tra JSON 7 màn, duyệt nháp và cập nhật nội dung
                      </span>
                    </div>
                  </div>
                  <ArrowRight size={16} />
                </button>

                <button
                  className="quick-action-item"
                  onClick={() => onNavigate("courses")}
                >
                  <div className="action-item-left">
                    <Layers size={18} />
                    <div>
                      <b>Quản lý Khóa học & Chương</b>
                      <span>Thiết lập thứ tự và cây cấu trúc giáo trình</span>
                    </div>
                  </div>
                  <ArrowRight size={16} />
                </button>

                <button
                  className="quick-action-item"
                  onClick={() => onNavigate("audit")}
                >
                  <div className="action-item-left">
                    <History size={18} />
                    <div>
                      <b>Xem toàn bộ Nhật ký hoạt động</b>
                      <span>
                        Kiểm tra nguồn gốc các thay đổi trong hệ thống
                      </span>
                    </div>
                  </div>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Recent Audit Panel */}
            <div className="admin-card recent-audit-panel">
              <div className="panel-header-row">
                <div>
                  <h3 className="panel-title">Nhật ký hoạt động gần đây</h3>
                  <p className="panel-desc">
                    Các lệnh quản trị và biên tập mới nhất.
                  </p>
                </div>
                <button
                  className="admin-btn text-button"
                  onClick={() => onNavigate("audit")}
                >
                  Xem tất cả
                </button>
              </div>

              {recentAudit.length === 0 ? (
                <div className="empty-state-compact">
                  <Clock size={20} />
                  <span>Chưa có nhật ký hoạt động nào được ghi nhận.</span>
                </div>
              ) : (
                <div className="recent-audit-list">
                  {recentAudit.map((item) => (
                    <div key={item.request_id} className="recent-audit-item">
                      <div className="audit-action-tag">
                        <code>{item.action}</code>
                      </div>
                      <div className="audit-target-text" title={item.target}>
                        Mục tiêu: <b>{item.target}</b>
                      </div>
                      <div className="audit-time-text">
                        {formatVietnamDateTime(item.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
