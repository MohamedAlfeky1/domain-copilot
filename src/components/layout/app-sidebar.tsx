"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppIcons } from "@/components/ui/icons";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { UserSessionWidget } from "@/app/user-session-widget";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "domain-copilot-sidebar-collapsed";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: AppIcons.dashboard },
  { href: "/corpus", label: "Corpus & Ingestion", icon: AppIcons.corpus },
  { href: "/copilot", label: "Copilot Workspace", icon: AppIcons.copilot },
  { href: "/reviews", label: "HITL Approval Queue", icon: AppIcons.reviews },
  { href: "/runs/latest", label: "Runs & Traces", icon: AppIcons.runs, matchPrefix: "/runs" },
  { href: "/evaluation", label: "Evaluation & Metrics", icon: AppIcons.evaluation },
  { href: "/settings", label: "System Settings", icon: AppIcons.settings },
];

interface AppSidebarProps {
  initialRole: string;
  initialEmail: string;
}

export function AppSidebar({ initialRole, initialEmail }: AppSidebarProps) {
  const pathname = usePathname();
  // Expanded by default to prevent hydration mismatch and honor default state
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Restore persisted state after initial client mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    } catch {
      // Gracefully handle environments with disabled localStorage
    }
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const isItemActive = (item: NavItem) => {
    if (item.matchPrefix) {
      return pathname === item.href || pathname.startsWith(item.matchPrefix);
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          "bg-card border-r border-border flex flex-col justify-between shrink-0 select-none shadow-sm transition-all duration-300 ease-in-out relative z-20",
          isCollapsed ? "w-16" : "w-60"
        )}
      >
        <div>
          {/* Brand Header & Toggle Button */}
          <div
            className={cn(
              "h-16 border-b border-border bg-card flex items-center transition-all duration-300",
              isCollapsed ? "justify-center px-2" : "justify-between px-4"
            )}
          >
            {!isCollapsed && (
              <div className="min-w-0 flex-1 pr-2">
                <h1 className="text-sm font-bold tracking-tight text-foreground truncate">
                  DOMAIN COPILOT
                </h1>
                <p className="text-[10px] font-mono text-muted-foreground font-medium truncate">
                  Agentic RAG Engine
                </p>
              </div>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-expanded={!isCollapsed}
                  className={cn(
                    "p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-1 focus:ring-primary shrink-0",
                    isCollapsed && "p-2"
                  )}
                >
                  {isCollapsed ? (
                    <AppIcons.chevronRight className="w-4 h-4" />
                  ) : (
                    <AppIcons.chevronLeft className="w-4 h-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                <span>{isCollapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Navigation Routes */}
          <nav
            className={cn(
              "space-y-1 text-xs font-medium transition-all duration-300",
              isCollapsed ? "p-2" : "p-3"
            )}
            aria-label="Sidebar Navigation"
          >
            {NAV_ITEMS.map((item) => {
              const active = isItemActive(item);
              const Icon = item.icon;

              if (isCollapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        aria-label={item.label}
                        className={cn(
                          "flex items-center justify-center p-2 rounded-md transition-colors",
                          active
                            ? "bg-slate-100 text-slate-900 font-semibold"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        )}
                      >
                        <Icon
                          className={cn(
                            "w-5 h-5 shrink-0 transition-colors",
                            active ? "text-primary font-bold" : "text-slate-500 hover:text-primary"
                          )}
                        />
                        <span className="sr-only">{item.label}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>
                      <span>{item.label}</span>
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-xs font-medium",
                    active
                      ? "bg-slate-100 text-slate-900 font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-[18px] h-[18px] shrink-0 transition-colors",
                      active ? "text-primary font-bold" : "text-slate-500 group-hover:text-primary"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Session Footer */}
        <div
          className={cn(
            "border-t border-border bg-slate-50/50 transition-all duration-300",
            isCollapsed ? "p-2" : "p-3"
          )}
        >
          <UserSessionWidget
            initialRole={initialRole}
            initialEmail={initialEmail}
            isCollapsed={isCollapsed}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
}
