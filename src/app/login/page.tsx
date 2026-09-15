"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Lock, Mail, AlertCircle, ArrowRight, Loader2, Shield } from "lucide-react";

const DEMO_ACCOUNTS = [
  { role: "ADMIN", label: "System Admin", email: "admin@domaincopilot.ai", pass: "admin123", badge: "Full Access" },
  { role: "APPROVER", label: "Dr. Approver", email: "approver@domaincopilot.ai", pass: "approver123", badge: "HITL Reviews" },
  { role: "EXPERT", label: "Clinical Expert", email: "expert@domaincopilot.ai", pass: "expert123", badge: "Copilot & Runs" },
  { role: "VIEWER", label: "Read-Only Auditor", email: "viewer@domaincopilot.ai", pass: "viewer123", badge: "Read-Only" },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = "Email address is required.";
    } else if (!email.includes("@")) {
      errors.email = "Please enter a valid email address.";
    }

    if (!password) {
      errors.password = "Password is required.";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || "Authentication failed. Please check your credentials.");
        setLoading(false);
        return;
      }

      // Persist client token if returned, alongside the HttpOnly cookie set by the API
      if (data.token) {
        try {
          localStorage.setItem("dc_token", data.token);
        } catch {
          // Ignore localStorage errors in restricted environments
        }
      }

      // Seamless redirect to dashboard or intended destination
      window.location.href = redirectTo;
    } catch (err: any) {
      setErrorMessage(err.message || "Network error. Unable to connect to authentication server.");
      setLoading(false);
    }
  };

  const fillAccount = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setValidationErrors({});
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden select-none">
      {/* Background Decorative Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl p-8 z-10">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/25 mb-4">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            DOMAIN COPILOT
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Clinical Agentic RAG Platform · Secure Access Portal
          </p>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div
            id="auth-error-banner"
            className="mb-6 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2.5 animate-fadeIn"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                disabled={loading}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (validationErrors.email) setValidationErrors((prev) => ({ ...prev, email: undefined }));
                }}
                placeholder="name@domaincopilot.ai"
                className={`w-full pl-9 pr-3 py-2 bg-slate-950/70 border ${
                  validationErrors.email ? "border-rose-500" : "border-slate-800 focus:border-sky-500"
                } rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors`}
              />
            </div>
            {validationErrors.email && (
              <p className="text-[11px] text-rose-400 mt-1">{validationErrors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                disabled={loading}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (validationErrors.password) setValidationErrors((prev) => ({ ...prev, password: undefined }));
                }}
                placeholder="••••••••"
                className={`w-full pl-9 pr-3 py-2 bg-slate-950/70 border ${
                  validationErrors.password ? "border-rose-500" : "border-slate-800 focus:border-sky-500"
                } rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors`}
              />
            </div>
            {validationErrors.password && (
              <p className="text-[11px] text-rose-400 mt-1">{validationErrors.password}</p>
            )}
          </div>

          <button
            id="sign-in-button"
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo Accounts Quick Select */}
        <div className="mt-8 pt-6 border-t border-slate-800">
          <div className="flex items-center gap-1.5 mb-3 text-slate-400">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Quick Select Role (Evaluation)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.role}
                type="button"
                onClick={() => fillAccount(acc.email, acc.pass)}
                className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/50 text-left transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-200 group-hover:text-sky-400">
                    {acc.role}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {acc.badge}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">{acc.email}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Disclaimer */}
      <p className="text-[11px] text-slate-500 mt-6 text-center">
        Domain Copilot Governance Engine · Role-Based Access Control (FR-8) Enforced Server-Side
      </p>
    </div>
  );
}
