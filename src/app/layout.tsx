import type { Metadata } from "next";
import "./globals.css";
import { cookies, headers } from "next/headers";
import { verifyAuthToken } from "@/infrastructure/auth/tokens";
import { container } from "@/core/application/container";
import { Badge } from "@/components/ui/badge";
import { NavigationProgressBar } from "@/components/navigation-progress";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Toaster } from "@/components/ui/toaster";

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
          <Toaster />
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

  const displayRole = currentUser ? currentUser.role : "EXPERT";

  return (
    <html lang="en">
      <body className="bg-background text-foreground flex h-screen overflow-hidden antialiased">
        <NavigationProgressBar />
        {/* Collapsible Left Navigation Sidebar */}
        <AppSidebar
          initialRole={displayRole}
          initialEmail={currentUser?.email || "expert@domaincopilot.ai"}
        />

        {/* Main Content & Top Bar */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Top Bar Strip */}
          <header className="h-16 px-6 bg-card border-b border-border flex items-center justify-end shrink-0 shadow-xs">
            {/* Active AI Provider Indicator */}
            <Badge variant="success" className="gap-1.5 font-mono text-[11px] py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              AI PROVIDER: OPENROUTER / OLLAMA
            </Badge>
          </header>

          {/* Dynamic Route Content */}
          <main className="flex-1 overflow-y-auto bg-slate-50/60 p-6">
            {children}
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
