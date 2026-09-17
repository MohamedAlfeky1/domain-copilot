import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { cookies, headers } from "next/headers";
import { verifyAuthToken } from "@/infrastructure/auth/tokens";
import { container } from "@/core/application/container";
import { UserSessionWidget } from "./user-session-widget";
import { Badge } from "@/components/ui/badge";
import { AppIcons } from "@/components/ui/icons";
import { NavigationProgressBar } from "@/components/navigation-progress";

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
          <NavigationProgressBar />
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
        <NavigationProgressBar />
        {/* Fixed 240px Left Navigation Sidebar */}
        <aside className="w-60 bg-card border-r border-border flex flex-col justify-between shrink-0 select-none shadow-sm">
          <div>
            {/* Brand Header */}
            <div className="h-16 px-5 flex flex-col justify-center border-b border-border bg-card">
              <h1 className="text-sm font-bold tracking-tight text-foreground">
                DOMAIN COPILOT
              </h1>
              <p className="text-[10px] font-mono text-muted-foreground font-medium">Agentic RAG Engine</p>
            </div>

            {/* Navigation Routes */}
            <nav className="p-3 space-y-1 text-xs font-medium">
              <Link
                href="/dashboard"
                className="group flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <AppIcons.dashboard className="w-[18px] h-[18px] text-slate-500 group-hover:text-primary transition-colors shrink-0" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/corpus"
                className="group flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <AppIcons.corpus className="w-[18px] h-[18px] text-slate-500 group-hover:text-primary transition-colors shrink-0" />
                <span>Corpus &amp; Ingestion</span>
              </Link>
              <Link
                href="/copilot"
                className="group flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <AppIcons.copilot className="w-[18px] h-[18px] text-slate-500 group-hover:text-primary transition-colors shrink-0" />
                <span>Copilot Workspace</span>
              </Link>
              <Link
                href="/reviews"
                className="group flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <AppIcons.reviews className="w-[18px] h-[18px] text-slate-500 group-hover:text-primary transition-colors shrink-0" />
                <span>HITL Approval Queue</span>
              </Link>
              <Link
                href="/runs/latest"
                className="group flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <AppIcons.runs className="w-[18px] h-[18px] text-slate-500 group-hover:text-primary transition-colors shrink-0" />
                <span>Runs &amp; Traces</span>
              </Link>
              <Link
                href="/evaluation"
                className="group flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <AppIcons.evaluation className="w-[18px] h-[18px] text-slate-500 group-hover:text-primary transition-colors shrink-0" />
                <span>Evaluation Benchmark</span>
              </Link>
              <Link
                href="/settings"
                className="group flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <AppIcons.settings className="w-[18px] h-[18px] text-slate-500 group-hover:text-primary transition-colors shrink-0" />
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
          <header className="h-16 px-6 bg-card border-b border-border flex items-center justify-end shrink-0 shadow-xs">
            {/* Active Model Indicator */}
            <Badge variant="success" className="gap-1.5 font-mono text-[11px] py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              MODEL: {resolvedModel}
            </Badge>
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
