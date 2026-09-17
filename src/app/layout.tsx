import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ACTIVE_VARIANT } from "@/config/variant.config";
import { cookies, headers } from "next/headers";
import { verifyAuthToken } from "@/infrastructure/auth/tokens";
import { container } from "@/core/application/container";
import { UserSessionWidget } from "./user-session-widget";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Database,
  Bot,
  ShieldCheck,
  Activity,
  Award,
  Settings,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Domain Copilot | Agentic RAG Platform",
  description: "Assessment-Aligned Agentic RAG Platform with Hybrid Retrieval, HITL Governance & Clean Architecture",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = headers().get("x-pathname") || "";
  const isLoginPage = pathname === "/login";

  // Login page is rendered standalone without the application chrome/sidebar
  if (isLoginPage) {
    return (
      <html lang="en">
        <body className="bg-background text-foreground min-h-screen antialiased">
          {children}
        </body>
      </html>
    );
  }

  const cookieStore = cookies();
  const token = cookieStore.get("dc_token")?.value;
  let currentUser = null;
  if (token) {
    const payload = await verifyAuthToken(token);
    if (payload?.id) {
      currentUser = await container.db.getUserById(payload.id);
    }
  }

  const displayName = currentUser ? currentUser.email.split("@")[0] : "Authenticated";
  const displayRole = currentUser ? currentUser.role : "EXPERT";
  const resolvedModel = process.env.OPENROUTER_MODEL || process.env.AI_MODEL || "openrouter/auto";

  return (
    <html lang="en">
      <body className="bg-background text-foreground flex h-screen overflow-hidden antialiased">
        {/* Fixed 240px Left Navigation Sidebar */}
        <aside className="w-60 bg-card border-r border-border flex flex-col justify-between shrink-0 select-none shadow-sm">
          <div>
            {/* Brand Header */}
            <div className="h-16 px-5 flex items-center gap-3 border-b border-border bg-card">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
                  DOMAIN COPILOT
                </h1>
                <p className="text-[10px] font-mono text-sky-600 font-medium">Agentic RAG Engine</p>
              </div>
            </div>

            {/* Navigation Routes */}
            <nav className="p-3 space-y-1 text-xs font-medium">
              <Link
                href="/dashboard"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-600 hover:text-foreground hover:bg-slate-100 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-sky-600" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/corpus"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-600 hover:text-foreground hover:bg-slate-100 transition-colors"
              >
                <Database className="w-4 h-4 text-emerald-600" />
                <span>Corpus &amp; Ingestion</span>
              </Link>
              <Link
                href="/copilot"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-600 hover:text-foreground hover:bg-slate-100 transition-colors"
              >
                <Bot className="w-4 h-4 text-indigo-600" />
                <span>Copilot Workspace</span>
              </Link>
              <Link
                href="/reviews"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-600 hover:text-foreground hover:bg-slate-100 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span>HITL Approval Queue</span>
              </Link>
              <Link
                href="/runs/latest"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-600 hover:text-foreground hover:bg-slate-100 transition-colors"
              >
                <Activity className="w-4 h-4 text-cyan-600" />
                <span>Runs &amp; Traces</span>
              </Link>
              <Link
                href="/evaluation"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-600 hover:text-foreground hover:bg-slate-100 transition-colors"
              >
                <Award className="w-4 h-4 text-purple-600" />
                <span>Evaluation Benchmark</span>
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-600 hover:text-foreground hover:bg-slate-100 transition-colors"
              >
                <Settings className="w-4 h-4 text-slate-500" />
                <span>System Settings</span>
              </Link>
            </nav>
          </div>

          {/* User Session Footer */}
          <div className="p-3 border-t border-border bg-slate-50/50">
            <UserSessionWidget
              initialRole={displayRole}
              initialEmail={currentUser?.email || "expert@domaincopilot.ai"}
            />
          </div>
        </aside>

        {/* Main Content & Top Bar */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Top Bar Strip */}
          <header className="h-16 px-6 bg-card border-b border-border flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-3">
              {/* Variant Lock Badges */}
              <div className="flex items-center gap-2">
                <Badge variant="info" className="gap-1.5 font-mono text-[11px] py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                  DOMAIN: {ACTIVE_VARIANT.domainId} ({ACTIVE_VARIANT.domainName})
                </Badge>
                <Badge variant="warning" className="gap-1.5 font-mono text-[11px] py-1">
                  TWIST: {ACTIVE_VARIANT.twistId}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Model Badge */}
              <Badge variant="success" className="gap-1.5 font-mono text-[11px] py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                MODEL: {resolvedModel}
              </Badge>

              {/* Architecture Badge */}
              <Badge variant="outline" className="font-mono text-[11px] py-1 text-slate-600 border-slate-300">
                CLEAN ARCH v1.0
              </Badge>
            </div>
          </header>

          {/* Dynamic Route Content */}
          <main className="flex-1 overflow-y-auto bg-slate-50/60 p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
