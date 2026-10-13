import { useEffect, useState, useRef } from "react";
import {
  ShieldAlert,
  Lock,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  ServerCrash,
  Sparkles,
} from "lucide-react";
import { checkAdminAccess } from "./api";
import "./admin.css";
import type { AdminAccess } from "./platform-types";
import { AdminLayout, type AdminTab } from "./AdminLayout";
import { OverviewView } from "./views/OverviewView";
import { UsersView } from "./views/UsersView";
import { CoursesView } from "./views/CoursesView";
import { LessonsView } from "./views/LessonsView";
import { AuditView } from "./views/AuditView";
import { AdminCurriculum } from "./AdminCurriculum";
import { useAccount } from "../cloud/Account";
import type { Lesson } from "../data";
import { Panda } from "../Art";

interface AdminPlatformProps {
  onBackToApp: () => void;
  onPreviewLesson: (lesson: Lesson) => void;
  dark: boolean;
  onToggleTheme: () => void;
  initialQuery?: string | null;
}

export function AdminPlatform({
  onBackToApp,
  onPreviewLesson,
  dark,
  onToggleTheme,
  initialQuery,
}: AdminPlatformProps) {
  const { logout, manager } = useAccount();

  // Determine initial tab from URL query
  const getInitialTab = (): { tab: AdminTab; subTab?: "list" | "editor" } => {
    const q =
      initialQuery || new URLSearchParams(window.location.search).get("admin");
    if (q === "curriculum") return { tab: "lessons", subTab: "editor" };
    if (q === "users") return { tab: "users" };
    if (q === "courses") return { tab: "courses" };
    if (q === "lessons") return { tab: "lessons", subTab: "list" };
    if (q === "audit") return { tab: "audit" };
    return { tab: "overview" };
  };

  const initialConfig = getInitialTab();
  const [currentTab, setCurrentTab] = useState<AdminTab>(initialConfig.tab);
  const [initialSubTab, setInitialSubTab] = useState<"list" | "editor">(
    initialConfig.subTab || "list",
  );

  // Access status state
  const [checking, setChecking] = useState(true);
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [editorOnly, setEditorOnly] = useState(false);
  const [accessStatus, setAccessStatus] = useState<200 | 401 | 403 | 503 | 0>(
    200,
  );
  const [accessError, setAccessError] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);
  const [navigationKey, setNavigationKey] = useState(0);

  // Check access on mount or user change
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const lost = (event: Event) => {
      const { status, code } = (
        event as CustomEvent<{ status: 401 | 403; code: string }>
      ).detail;
      abortRef.current?.abort();
      setAccess(null);
      setEditorOnly(false);
      setChecking(false);
      setAccessStatus(status);
      setAccessError(code);
    };
    window.addEventListener("hanzi-admin-access-lost", lost);
    return () => window.removeEventListener("hanzi-admin-access-lost", lost);
  }, []);
  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setChecking(true);
    setAccess(null);
    setEditorOnly(false);
    setAccessError("");

    checkAdminAccess(ac.signal)
      .then((res) => {
        if (!ac.signal.aborted) {
          setAccess(res.access);
          setEditorOnly(res.editorOnly);
          setAccessStatus(res.status);
          setAccessError(res.error || "");
          setChecking(false);
        }
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          setAccessStatus(0);
          setAccessError(String(err));
          setChecking(false);
        }
      });

    return () => ac.abort();
  }, [manager?.userId, retryCount]);

  // Sync tab with URL search params
  const handleTabChange = (tab: AdminTab) => {
    setNavigationKey((n) => n + 1);
    setCurrentTab(tab);
    setInitialSubTab("list");
    const url = new URL(window.location.href);
    url.searchParams.set("admin", tab);
    window.history.replaceState({}, "", url.toString());
  };

  // 1. Loading state
  if (checking) {
    return (
      <div className="admin-status-screen">
        <div className="status-card card">
          <Panda small />
          <div className="loading-spinner-row my-3">
            <RefreshCw size={22} className="spin text-green" />
            <h3 className="m-0">Đang xác thực quyền quản trị...</h3>
          </div>
          <p className="text-muted text-sm">
            Hệ thống đang kiểm tra chữ ký tài khoản và phân quyền trên máy chủ.
          </p>
        </div>
      </div>
    );
  }

  // 2. 401 Unauthenticated
  if (accessStatus === 401) {
    return (
      <div className="admin-status-screen">
        <div className="status-card card">
          <div className="status-icon-box orange">
            <Lock size={32} />
          </div>
          <h3>Yêu cầu đăng nhập quản trị</h3>
          <p>
            Phiên đăng nhập đã hết hạn hoặc bạn chưa đăng nhập tài khoản có
            quyền quản trị.
          </p>
          <div className="status-actions">
            <button className="admin-btn primary" onClick={onBackToApp}>
              <ArrowLeft size={16} /> Quay về trang đăng nhập
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. 503 Maintenance / Migration required
  if (accessStatus === 503) {
    return (
      <div className="admin-status-screen">
        <div className="status-card card">
          <div className="status-icon-box alert">
            <ServerCrash size={32} />
          </div>
          <h3>Dịch vụ Quản trị chưa khả dụng (503)</h3>
          <p>
            Máy chủ chưa được cài đặt cấu hình hoặc migration quản trị viên nền
            tảng. Vui lòng liên hệ quản trị cơ sở dữ liệu để áp dụng migration.
          </p>
          {accessError && (
            <code className="error-code-block">{accessError}</code>
          )}
          <div className="status-actions">
            <button
              className="admin-btn secondary"
              onClick={() => setRetryCount((n) => n + 1)}
            >
              <RefreshCw size={15} /> Thử lại
            </button>
            <button className="admin-btn primary" onClick={onBackToApp}>
              Quay về ứng dụng học
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. 403 Forbidden (Neither Platform Admin nor Editor)
  if (accessStatus === 403 && !editorOnly) {
    return (
      <div className="admin-status-screen">
        <div className="status-card card">
          <div className="status-icon-box alert">
            <ShieldAlert size={32} />
          </div>
          <h3>Truy cập bị từ chối (403)</h3>
          <p>
            Tài khoản của bạn không có quyền Quản trị viên nền tảng hoặc Biên
            tập viên giáo trình. Nếu bạn là người phụ trách, hãy liên hệ cấp
            quyền qua Supabase.
          </p>
          <div className="status-actions">
            <button className="admin-btn primary" onClick={onBackToApp}>
              <ArrowLeft size={16} /> Quay về ứng dụng học
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Editor Only Mode (Role: Editor -> Only sees curriculum editor workflow)
  if (accessStatus === 0 || (!access && !editorOnly)) {
    return (
      <div className="admin-status-screen">
        <section className="status-card card" role="alert">
          <AlertTriangle size={32} />
          <h2>Không thể kết nối khu vực quản trị</h2>
          <p>{accessError || "Không tải được quyền truy cập. Hãy thử lại."}</p>
          <div className="status-actions">
            <button
              className="admin-btn primary"
              onClick={() => setRetryCount((n) => n + 1)}
            >
              Thử lại
            </button>
            <button className="admin-btn secondary" onClick={onBackToApp}>
              Quay về ứng dụng học
            </button>
          </div>
        </section>
      </div>
    );
  }
  if (editorOnly) {
    return (
      <div className="admin-shell editor-only-shell">
        <header className="editor-only-header">
          <div className="header-left">
            <div className="admin-logo-mark">
              <span>汉</span>
            </div>
            <div>
              <h2 className="editor-title">HanziOne · Biên tập giáo trình</h2>
              <span className="editor-badge">
                <Sparkles size={12} /> Quyền Biên tập viên (Editor)
              </span>
            </div>
          </div>
          <button className="admin-btn secondary" onClick={onBackToApp}>
            <ArrowLeft size={16} /> Quay về ứng dụng học
          </button>
        </header>

        <main className="editor-only-content p-6">
          <div className="admin-card">
            <AdminCurriculum onPreview={onPreviewLesson} />
          </div>
        </main>
      </div>
    );
  }

  // 6. Full Platform Admin Workspace
  return (
    <AdminLayout
      currentTab={currentTab}
      onTabChange={handleTabChange}
      onBackToApp={onBackToApp}
      access={access}
      onLogout={async () => {
        await logout();
        onBackToApp();
      }}
      dark={dark}
      onToggleTheme={onToggleTheme}
    >
      {currentTab === "overview" && (
        <OverviewView onNavigate={handleTabChange} />
      )}
      {currentTab === "users" && <UsersView currentUserId={access?.userId} />}
      {currentTab === "courses" && <CoursesView />}
      {currentTab === "lessons" && (
        <LessonsView
          key={navigationKey}
          onPreviewLesson={onPreviewLesson}
          defaultSubTab={initialSubTab}
        />
      )}
      {currentTab === "audit" && <AuditView />}
    </AdminLayout>
  );
}
