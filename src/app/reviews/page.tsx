"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  Edit3,
  XCircle,
  Clock,
  User,
  History,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

export default function ReviewsPage() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [editedPayload, setEditedPayload] = useState("");
  const [comment, setComment] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/approvals");
      const data = await res.json();
      setApprovals(data.approvals || []);
      if (data.approvals?.length > 0 && !selectedApproval) {
        selectItem(data.approvals[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const selectItem = (item: any) => {
    setSelectedApproval(item);
    setEditedPayload(JSON.stringify(item.originalPayload, null, 2));
    setComment("");
    setRejectionReason("");
    setShowRejectModal(false);
  };

  const handleApprove = async () => {
    if (!selectedApproval) return;
    try {
      const res = await fetch(`/api/approvals/${selectedApproval.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      if (res.ok) {
        alert("Action approved and executed successfully!");
        fetchApprovals();
      }
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    }
  };

  const handleEditAndApprove = async () => {
    if (!selectedApproval) return;
    try {
      const parsed = JSON.parse(editedPayload);
      const res = await fetch(`/api/approvals/${selectedApproval.id}/edit-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modifiedPayload: parsed, comment }),
      });
      if (res.ok) {
        alert("Modified payload approved and executed!");
        fetchApprovals();
      }
    } catch (err: any) {
      alert(`Invalid JSON or request failed: ${err.message}`);
    }
  };

  const handleReject = async () => {
    if (!selectedApproval || !rejectionReason.trim()) {
      alert("Mandatory rejection reason is required.");
      return;
    }
    try {
      const res = await fetch(`/api/approvals/${selectedApproval.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason }),
      });
      if (res.ok) {
        alert("Proposal rejected.");
        fetchApprovals();
      }
    } catch (err: any) {
      alert(`Rejection failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/20 text-amber-400 font-semibold uppercase">
              GOVERNANCE QUEUE
            </span>
            <span className="text-xs text-slate-400">Consequential Action Governance</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Human-in-the-Loop (HITL) Review Queue</h2>
          <p className="text-xs text-slate-400 mt-1">
            Consequential actions pause for explicit approval, with approve/reject/edit-and-approve and a P0 audit trail.
          </p>
        </div>

        <button
          onClick={fetchApprovals}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Queue
        </button>
      </div>

      {/* Main Review Split View */}
      <div className="grid grid-cols-12 gap-5 h-[calc(100vh-250px)]">
        {/* Left: Pending Approval Queue */}
        <div className="col-span-4 bg-slate-900/70 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="p-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 font-mono">PENDING APPROVAL ITEMS ({approvals.length})</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {approvals.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-40" />
                <p>No actions pending review</p>
                <p className="text-[10px] mt-1 text-slate-600">Consequential actions will appear here automatically.</p>
              </div>
            ) : (
              approvals.map((item) => (
                <div
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                    selectedApproval?.id === item.id
                      ? "bg-slate-800 border-sky-500 shadow-md"
                      : "bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        item.riskLevel === "CRITICAL"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          : item.riskLevel === "HIGH"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                      }`}
                    >
                      {item.riskLevel} RISK
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <h4 className="font-semibold text-white truncate">{item.proposedAction}</h4>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Agent: {item.requesterAgent}</span>
                    <span className={`font-bold ${item.status === "PENDING" ? "text-amber-400" : "text-emerald-400"}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Inspection & Action Pane */}
        {selectedApproval ? (
          <div className="col-span-8 bg-slate-900/70 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
            {/* Action Pane Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{selectedApproval.proposedAction}</h3>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                  Run ID: {selectedApproval.runId} · SHA: {selectedApproval.originalHash?.slice(0, 12)}...
                </p>
              </div>

              <span
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                  selectedApproval.status === "PENDING"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : selectedApproval.status === "APPROVED"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                }`}
              >
                STATUS: {selectedApproval.status}
              </span>
            </div>

            {/* Structured Payload Editor */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                  Proposed Action Payload (Editable for Edit-and-Approve):
                </label>
                <textarea
                  value={editedPayload}
                  onChange={(e) => setEditedPayload(e.target.value)}
                  disabled={selectedApproval.status !== "PENDING"}
                  rows={8}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 font-semibold">Reviewer Decision Comment:</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={selectedApproval.status !== "PENDING"}
                  placeholder="Optional decision rationale or authorization note..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Rejection Modal input if active */}
              {showRejectModal && (
                <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <label className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Mandatory Rejection Reason:
                  </label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason for rejecting this proposed action..."
                    className="w-full bg-slate-950 border border-rose-500/50 rounded-lg p-2.5 text-xs text-white focus:outline-none"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setShowRejectModal(false)}
                      className="px-3 py-1.5 rounded bg-slate-800 text-xs text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
                    >
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            {selectedApproval.status === "PENDING" && !showRejectModal && (
              <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Reject with Reason
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleEditAndApprove}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-lg shadow-sky-600/20 transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit &amp; Approve
                  </button>

                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve Proposal
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="col-span-8 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-center text-slate-500 text-xs">
            Select an item from the review queue to inspect.
          </div>
        )}
      </div>
    </div>
  );
}
