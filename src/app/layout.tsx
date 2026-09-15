import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ACTIVE_VARIANT } from "@/config/variant.config";
import { cookies } from "next/headers";
import { verifyAuthToken } from "@/infrastructure/auth/auth-guard";
import { container } from "@/core/application/container";
import { UserSessionWidget } from "./user-session-widget";
import {
  LayoutDashboard,
  Database,
  Bot,
  ShieldCheck,
  Activity,
  Award,
  Settings,
  Sparkles,
  UserCheck,
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
  const cookieStore = cookies();
  const token = cookieStore.get("dc_token")?.value;
  let currentUser = null;
  if (token) {
    const payload = verifyAuthToken(token);
    if (payload?.id) {
      currentUser = await container.db.getUserById(payload.id);
    }
  }
  const displayName = currentUser ? currentUser.email.split("@")[0] : "Dr. Approver";
  const displayRole = currentUser ? currentUser.role : "APPROVER";
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 flex h-screen overflow-hidden antialiased">
        {/* Fixed 240px Left Navigation Sidebar */}
        <aside className="w-60 bg-slate-900/90 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
          <div>
            {/* Brand Header */}
            <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800 bg-slate-950/60">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                  DOMAIN COPILOT
                </h1>
                <p className="text-[10px] font-mono text-sky-400">Agentic RAG Engine</p>
              </div>
            </div>

            {/* Navigation Routes */}
            <nav className="p-3 space-y-1 text-xs font-medium">
              <Link
                href="/dashboard"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-sky-400" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/corpus"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Corpus & Ingestion</span>
              </Link>
              <Link
                href="/copilot"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Bot className="w-4 h-4 text-indigo-400" />
                <span>Copilot Workspace</span>
              </Link>
              <Link
                href="/reviews"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>HITL Approval Queue</span>
              </Link>
              <Link
                href="/runs/latest"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Runs & Traces</span>
              </Link>
              <Link
                href="/evaluation"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Award className="w-4 h-4 text-purple-400" />
                <span>Evaluation Benchmark</span>
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>System Settings</span>
              </Link>
            </nav>
          </div>

          {/* User Session Footer */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/40">
            <UserSessionWidget initialRole={displayRole} initialEmail={currentUser?.email || "approver@domaincopilot.ai"} />
          </div>
        </aside>

        {/* Main Content & Top Bar */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Top Bar Strip */}
          <header className="h-16 px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              {/* Variant Lock Badges */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                  DOMAIN: {ACTIVE_VARIANT.domainId} ({ACTIVE_VARIANT.domainName})
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                  TWIST: {ACTIVE_VARIANT.twistId}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Model Badge */}
              <div className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                MODEL: {process.env.AI_MODEL || "gpt-4o"}
              </div>

              {/* Architecture Badge */}
              <div className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px] font-mono">
                CLEAN ARCH v1.0
              </div>
            </div>
          </header>

          {/* Dynamic Route Content */}
          <main className="flex-1 overflow-y-auto bg-slate-950 p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
