"use client";

import React, { useState, useEffect } from "react";
import { UserCheck } from "lucide-react";

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
    email: initialEmail || "approver@domaincopilot.ai",
    role: initialRole || "APPROVER",
  });
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    // Check if session is active via /api/me; if not, initialize default approver session
    fetch("/api/me")
      .then((res) => {
        if (!res.ok) {
          // Auto-authenticate as default approver so UI operates smoothly
          return fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "approver@domaincopilot.ai", password: "approver123" }),
          }).then((r) => r.json());
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
        setCurrentUser({ email: data.user.email, role: data.user.role });
        window.location.reload();
      }
    } catch (err) {
      console.error("Login failed:", err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md bg-slate-800/60">
        <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-xs shrink-0">
          <UserCheck className="w-3.5 h-3.5" />
        </div>
        <div className="overflow-hidden flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-200 truncate capitalize">
            {currentUser.email.split("@")[0]}
          </p>
          <p className="text-[10px] text-emerald-400 font-mono">
            ROLE: {currentUser.role}
          </p>
        </div>
      </div>

      <select
        value={currentUser.email}
        onChange={handleRoleChange}
        disabled={switching}
        aria-label="Switch Authenticated Role"
        className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-sky-500 cursor-pointer disabled:opacity-50"
      >
        {PRESET_USERS.map((u) => (
          <option key={u.email} value={u.email}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
}
