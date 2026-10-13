import React, { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Layers,
  BookOpen,
  History,
  ArrowLeft,
  Sun,
  Moon,
  Menu,
  X,
  Shield,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Panda } from "../Art";
import { ProductCredit } from "../ProductCredit";
import type { AdminAccess } from "./platform-types";
import { useAdminDialog } from "./use-dialog";

export type AdminTab = "overview" | "users" | "courses" | "lessons" | "audit";

interface AdminLayoutProps {
  currentTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onBackToApp: () => void;
  access: AdminAccess | null;
  onLogout?: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

export function AdminLayout({
  currentTab,
  onTabChange,
  onBackToApp,
  access,
  onLogout,
  dark,
  onToggleTheme,
  children,
}: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useAdminDialog(
    () => setMobileMenuOpen(false),
    false,
    mobileMenuOpen,
    '.admin-sidebar[role="dialog"]',
  );

  const navItems: {
    id: AdminTab;
    label: string;
    icon: typeof LayoutDashboard;
  }[] = [
    { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
    { id: "users", label: "Người dùng", icon: Users },
    { id: "courses", label: "Khóa học & Chương", icon: Layers },
    { id: "lessons", label: "Bài học & Giáo trình", icon: BookOpen },
    { id: "audit", label: "Nhật ký hoạt động", icon: History },
  ];

  const currentNav = navItems.find((n) => n.id === currentTab);

  return (
    <div className="admin-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="admin-mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Admin Sidebar */}
      <aside
        className={`admin-sidebar ${mobileMenuOpen ? "open" : ""}`}
        role={mobileMenuOpen ? "dialog" : undefined}
        aria-modal={mobileMenuOpen ? true : undefined}
        aria-label={mobileMenuOpen ? "Điều hướng quản trị" : undefined}
      >
        <div className="admin-sidebar-header">
          <div className="admin-brand">
            <div className="admin-logo-mark">
              <span>汉</span>
            </div>
            <div>
              <h1 className="admin-app-name">HanziOne</h1>
              <span className="admin-badge-label">
                <Shield size={11} /> Quản trị viên
              </span>
            </div>
          </div>
          <button
            className="admin-mobile-close icon-button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Đóng menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="admin-nav" aria-label="Menu quản trị">
          <div className="admin-nav-section-title">QUẢN LÝ NỀN TẢNG</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                className={`admin-nav-item ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  onTabChange(item.id);
                  setMobileMenuOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {isActive && <div className="nav-active-pill" />}
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-return-btn" onClick={onBackToApp}>
            <ArrowLeft size={16} />
            <span>Quay về ứng dụng học</span>
          </button>

          <div className="admin-actor-card">
            <Panda small />
            <div className="actor-info">
              <span className="actor-role">
                {access?.role === "admin"
                  ? "Toàn quyền hệ thống"
                  : "Biên tập viên"}
              </span>
              <span className="actor-id" title={access?.userId}>
                {access?.userId
                  ? `${access.userId.slice(0, 8)}...`
                  : "Đang kết nối"}
              </span>
            </div>
          </div>

          <div className="admin-credit-wrapper">
            <ProductCredit />
          </div>
        </div>
      </aside>

      {/* Admin Main Workspace */}
      <div className="admin-main-wrapper">
        <header className="admin-topbar">
          <div className="topbar-left">
            <button
              className="admin-hamburger icon-button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu quản trị"
            >
              <Menu size={20} />
            </button>
            <div className="admin-breadcrumb">
              <button
                type="button"
                onClick={onBackToApp}
                className="breadcrumb-link"
              >
                HanziOne
              </button>
              <ChevronRight size={14} />
              <span>Khu vực Quản trị</span>
              <ChevronRight size={14} />
              <b className="breadcrumb-current">{currentNav?.label}</b>
            </div>
          </div>

          <div className="topbar-right">
            <button
              className="theme-toggle-btn icon-button"
              onClick={onToggleTheme}
              title={
                dark
                  ? "Chuyển sang giao diện sáng"
                  : "Chuyển sang giao diện tối"
              }
              aria-label="Đổi giao diện"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {onLogout && (
              <button
                className="admin-logout-btn secondary"
                onClick={onLogout}
                title="Đăng xuất"
              >
                <LogOut size={16} />
                <span className="logout-text">Đăng xuất</span>
              </button>
            )}
          </div>
        </header>

        <main className="admin-content-area">{children}</main>
      </div>
    </div>
  );
}
