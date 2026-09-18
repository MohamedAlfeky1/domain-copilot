"use client";

import React, { useState, useEffect } from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
        const data = await res.json().catch(() => ({}));
        const targetRunId = data.approval?.runId || selectedApproval.runId;
        if (targetRunId) {
          window.location.href = `/copilot?runId=${encodeURIComponent(targetRunId)}&resume=true`;
          return;
        }
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
        const data = await res.json().catch(() => ({}));
        const targetRunId = data.approval?.runId || selectedApproval.runId;
        if (targetRunId) {
          window.location.href = `/copilot?runId=${encodeURIComponent(targetRunId)}&resume=true`;
          return;
        }
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
      {/* Header Card */}
      <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm bg-card border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="warning" className="text-[11px] font-mono uppercase">
              GOVERNANCE QUEUE
            </Badge>
            <span className="text-xs text-muted-foreground">Consequential Action Governance</span>
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">Human-in-the-Loop (HITL) Review Queue</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Consequential actions pause for explicit approval, with approve/reject/edit-and-approve and a P0 audit trail.
          </p>
        </div>

        <Button
          onClick={fetchApprovals}
          variant="outline"
          size="sm"
          className="self-start md:self-auto gap-1.5"
        >
          <AppIcons.refresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Queue
        </Button>
      </Card>

      {/* Main Review Split View */}
      <div className="grid grid-cols-12 gap-5 min-h-[560px] h-[calc(100vh-270px)]">
        {/* Left: Pending Approval Queue */}
        <Card className="col-span-12 lg:col-span-4 flex flex-col overflow-hidden shadow-sm bg-card border-border">
          <div className="p-3.5 border-b border-border bg-muted/40 flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground font-mono tracking-wider">
              PENDING APPROVAL ITEMS ({approvals.length})
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {approvals.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                <AppIcons.success className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
                <p className="font-medium text-foreground">No actions pending review</p>
                <p className="text-[11px] mt-1 text-muted-foreground">
                  Consequential actions triggered during copilot runs will appear here.
                </p>
              </div>
            ) : (
              approvals.map((item) => (
                <div
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                    selectedApproval?.id === item.id
                      ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                      : "bg-background border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Badge
                      variant={
                        item.riskLevel === "CRITICAL"
                          ? "destructive"
                          : item.riskLevel === "HIGH"
                          ? "warning"
                          : "info"
                      }
                      className="text-[10px] font-mono uppercase"
                    >
                      {item.riskLevel} RISK
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <h4 className="font-semibold text-foreground truncate">{item.proposedAction}</h4>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                    <span>Agent: {item.requesterAgent}</span>
                    <span
                      className={`font-semibold ${
                        item.status === "PENDING"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Right: Inspection & Action Pane */}
        {selectedApproval ? (
          <Card className="col-span-12 lg:col-span-8 flex flex-col overflow-hidden shadow-sm bg-card border-border">
            {/* Action Pane Header */}
            <div className="p-4 border-b border-border bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">{selectedApproval.proposedAction}</h3>
                <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                  Run ID: <span className="text-foreground">{selectedApproval.runId}</span> · SHA:{" "}
                  <span className="text-foreground">{selectedApproval.originalHash?.slice(0, 12)}...</span>
                </p>
              </div>

              <Badge
                variant={
                  selectedApproval.status === "PENDING"
                    ? "warning"
                    : selectedApproval.status === "APPROVED"
                    ? "success"
                    : "destructive"
                }
                className="text-xs font-mono font-bold self-start sm:self-auto"
              >
                STATUS: {selectedApproval.status}
              </Badge>
            </div>

            {/* Structured Payload Editor */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-foreground font-semibold block">
                  Proposed Action Payload (Editable for Edit-and-Approve):
                </label>
                <textarea
                  value={editedPayload}
                  onChange={(e) => setEditedPayload(e.target.value)}
                  disabled={selectedApproval.status !== "PENDING"}
                  rows={8}
                  className="w-full bg-muted/20 border border-input rounded-lg p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-foreground font-semibold">
                  Reviewer Decision Comment:
                </label>
                <Input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={selectedApproval.status !== "PENDING"}
                  placeholder="Optional decision rationale or authorization note..."
                  className="text-xs"
                />
              </div>

              {/* Rejection Modal input if active */}
              {showRejectModal && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
                  <label className="text-xs font-bold text-destructive flex items-center gap-1.5">
                    <AppIcons.warning className="w-4 h-4" />
                    Mandatory Rejection Reason:
                  </label>
                  <Input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason for rejecting this proposed action..."
                    className="text-xs border-destructive/40 focus-visible:ring-destructive"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      onClick={() => setShowRejectModal(false)}
                      variant="outline"
                      size="sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleReject}
                      variant="destructive"
                      size="sm"
                    >
                      Confirm Rejection
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            {selectedApproval.status === "PENDING" && !showRejectModal && (
              <div className="p-4 border-t border-border bg-muted/30 flex items-center justify-between">
                <Button
                  onClick={() => setShowRejectModal(true)}
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                >
                  <AppIcons.reject className="w-3.5 h-3.5" />
                  Reject with Reason
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleEditAndApprove}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                  >
                    <AppIcons.check className="w-3.5 h-3.5" />
                    Edit &amp; Approve
                  </Button>

                  <Button
                    onClick={handleApprove}
                    size="sm"
                    className="gap-1.5 font-semibold shadow-xs"
                  >
                    <AppIcons.approve className="w-3.5 h-3.5" />
                    Approve Proposal
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card className="col-span-12 lg:col-span-8 flex items-center justify-center text-muted-foreground text-xs min-h-[300px] bg-muted/20 border-dashed border-border">
            Select an item from the review queue to inspect and act.
          </Card>
        )}
      </div>
    </div>
  );
}
