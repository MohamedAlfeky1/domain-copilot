"use client";

import React, { useState, useEffect } from "react";
import { AppIcons } from "@/components/ui/icons";

interface UserProfile {
  id: string;
  email: string;
  role: "ADMIN" | "APPROVER" | "EXPERT" | "VIEWER";
}

const PRESET_USERS = [
  { label: "Dr. Approver (APPROVER)", email: "approver@domaincopilot.ai", pass: "approver123", role: "APPROVER" },
  { label: "System Admin (ADMIN)", email: "admin@domaincopilot.ai", pass: "admin123", role: "ADMIN" },
  { label: "Clinical Expert (EXPERT)", email: "expert@domaincopilot.ai", pass: "expert123", role: "EXPERT" },
  { label: "Read-Only Auditor (VIEWER)", email: "viewer@domaincopilot.ai", pass: "viewer123", role: "VIEWER" },
];

export function UserSessionWidget({ initialRole, initialEmail }: { initialRole: string; initialEmail: string }) {
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string }>({
    email: initialEmail,
    role: initialRole,
  });
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    // Fetch real authenticated identity from /api/me
    fetch("/api/me")
      .then((res) => {
        if (!res.ok) {
          // Unauthenticated -> redirect to login
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setCurrentUser({ email: data.user.email, role: data.user.role });
        }
      })
      .catch(() => {});
  }, []);

  const handleRoleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedEmail = e.target.value;
    const preset = PRESET_USERS.find((p) => p.email === selectedEmail);
    if (!preset) return;

    setSwitching(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: preset.email, password: preset.pass }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          try {
            localStorage.setItem("dc_token", data.token);
          } catch {}
        }
        setCurrentUser({ email: data.user.email, role: data.user.role });
        window.location.reload();
      }
    } catch (err) {
      console.error("Role switch failed:", err);
    } finally {
      setSwitching(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    try {
      localStorage.removeItem("dc_token");
    } catch {}
    window.location.href = "/login";
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200">
        <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center font-bold text-xs shrink-0">
          <AppIcons.user className="w-3.5 h-3.5" />
        </div>
        <div className="overflow-hidden flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate capitalize">
            {currentUser.email ? currentUser.email.split("@")[0] : "Authenticated"}
          </p>
          <p className="text-[10px] text-emerald-600 font-mono font-bold tracking-wider">
            ROLE: {currentUser.role}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          title="Sign Out"
          aria-label="Sign Out"
          className="p-1.5 rounded-md hover:bg-slate-200 text-slate-400 hover:text-rose-600 transition-colors focus:outline-none focus:ring-1 focus:ring-rose-500"
        >
          <AppIcons.logout className="w-3.5 h-3.5" />
        </button>
      </div>

      <div>
        <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider mb-1 block">
          Switch Active Role:
        </label>
        <select
          value={currentUser.email}
          onChange={handleRoleChange}
          disabled={switching}
          aria-label="Switch Authenticated Role"
          className="w-full bg-white border border-slate-200 rounded-md px-2 py-1 text-[11px] font-mono text-slate-700 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer disabled:opacity-50"
        >
          {PRESET_USERS.map((u) => (
            <option key={u.email} value={u.email}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
