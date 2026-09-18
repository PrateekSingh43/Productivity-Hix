"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, PanelLeftOpen, PanelLeftClose, Menu } from "lucide-react";
import { Sidebar } from "./sidebar";
import { useSidebar } from "@shared/lib/sidebar-context";

const titles: Record<string, string> = {
  "/": "Home",
  "/today": "Today",
  "/timeline": "Timeline",
  "/tasks": "Tasks",
  "/sessions": "Sessions",
  "/learning": "Learning",
  "/review": "Review",
  "/insights": "Insights",
  "/patterns": "Patterns",
  "/devices": "Devices",
  "/settings": "Settings",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = titles[pathname] ?? "ProductiveHix";
  const { isCollapsed, toggleSidebar, isMobileOpen, setIsMobileOpen } = useSidebar();

  return (
    <div className="flex h-screen overflow-hidden bg-bg-default text-text-primary relative">
      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-bg-default/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar isMobile />
      </div>

      <div className="hidden lg:block shrink-0">
        <Sidebar />
      </div>

      <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
        {/* Standardized h-14 header: perfectly aligns with sidebar header divider */}
        <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-border-subtle bg-bg-default/85 px-4 backdrop-blur-xl sm:px-6 xl:px-10">
          <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {/* Mobile menu trigger */}
              <button
                type="button"
                onClick={() => setIsMobileOpen(true)}
                className="lg:hidden p-1.5 -ml-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
                title="Open menu"
                aria-label="Open menu"
              >
                <Menu size={18} />
              </button>

              {/* Mobile brand link */}
              <Link href="/" className="flex items-center gap-2 lg:hidden">
                <span className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] border border-accent-default/30 bg-accent-default/15 text-accent-default">
                  <Zap size={14} fill="currentColor" />
                </span>
                <span className="text-sm font-semibold tracking-tight">ProductiveHix</span>
              </Link>

              {/* Desktop sidebar toggle when collapsed */}
              {isCollapsed && (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="hidden lg:flex items-center justify-center h-8 w-8 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <PanelLeftOpen size={16} />
                </button>
              )}

              <div className="hidden h-4 w-px bg-border-subtle lg:block" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight text-text-primary">{title}</p>
              </div>
            </div>

            {/* Clean top-right bar (Tracking and Settings removed as requested) */}
            <div className="flex shrink-0 items-center gap-2" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
