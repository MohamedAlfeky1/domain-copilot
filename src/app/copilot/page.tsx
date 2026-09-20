"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppIcons } from "@/components/ui/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast, useToast } from "@/components/ui/use-toast";
import { FiCheckCircle } from "react-icons/fi";
import { LuBot, LuArrowUp, LuLoaderCircle } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface Citation {
  citationId: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  page?: number;
  clause?: string;
  excerpt: string;
  score?: number;
  channel?: string;
}

interface StepProgress {
  agent: string;
  status: "pending" | "running" | "completed" | "approval_pending";
}

interface ApprovalInfo {
  approvalId: string;
  riskLevel: string;
  proposedAction: string;
  riskFlags: Array<{ riskType: string; severity: string; detail: string }>;
  status?: string;
}

/**
 * Presentation normalization helper.
 * If the value is already plain text, returns it unchanged.
 * If the value is a JSON string or object containing { "synthesis": "..." } or { "refusalNotice": "..." },
 * extracts and returns only the human-readable text.
 * If parsing fails or value is not plain text, returns a safe fallback.
 */
function normalizeDisplayText(raw: unknown): string {
  if (typeof raw !== "string") {
    if (raw && typeof raw === "object") {
      if ("refusalNotice" in (raw as any) && typeof (raw as any).refusalNotice === "string" && (raw as any).refusalNotice.trim()) {
        return (raw as any).refusalNotice;
      }
      if ("synthesis" in (raw as any) && typeof (raw as any).synthesis === "string") {
        return (raw as any).synthesis;
      }
    }
    return raw ? String(raw) : "";
  }

  let trimmed = raw.trim();
  if (!trimmed) return "";

  // Strip markdown code block wrapper if present
  if (trimmed.startsWith("```json")) {
    trimmed = trimmed.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  } else if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```\s*/, "").replace(/```$/, "").trim();
  }

  if (trimmed.startsWith("{") && (trimmed.includes('"synthesis"') || trimmed.includes('"refusalNotice"'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed) {
        if (typeof parsed.refusalNotice === "string" && parsed.refusalNotice.trim().length > 0) {
          return parsed.refusalNotice;
        }
        if (typeof parsed.synthesis === "string") {
          return parsed.synthesis;
        }
      }
    } catch {
      // Regex extraction fallback for malformed JSON
      const refusalMatch = trimmed.match(/"refusalNotice"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (refusalMatch && refusalMatch[1].trim().length > 0) {
        try {
          return JSON.parse(`"${refusalMatch[1]}"`);
        } catch {
          return refusalMatch[1];
        }
      }
      const match = trimmed.match(/"synthesis"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (match) {
        try {
          return JSON.parse(`"${match[1]}"`);
        } catch {
          return match[1];
        }
      }
    }
  }

  return raw;
}

/**
 * Safely extracts human-readable text during live streaming.
 * If the streamed text is raw JSON / agent contract output:
 * - If it represents a refusal in progress, returns "" (progress UI only).
 * - If it represents a normal synthesis in progress, extracts and streams only the synthesis text.
 * - If the JSON structure is incomplete before the synthesis field, returns "" (never leaks raw JSON).
 * - If it is plain text, returns it directly.
 */
function getSafeStreamDisplayText(raw: string): string {
  if (!raw) return "";
  let trimmed = raw.trim();
  if (!trimmed) return "";

  // Check if content represents structured JSON / agent output
  if (trimmed.startsWith("```json")) {
    trimmed = trimmed.replace(/^```json\s*/i, "").trim();
  }

  if (trimmed.startsWith("{") || trimmed.includes('"synthesis"') || trimmed.includes('"refusalNotice"')) {
    // If it contains refusal markers or out-of-scope indications, hide it completely during streaming
    if (
      trimmed.includes('"refusalNotice"') ||
      /unrelated|cannot be provided|no synthesis|out of scope|insufficient evidence/i.test(trimmed)
    ) {
      return "";
    }

    // Attempt to extract streaming synthesis text (even if JSON is incomplete)
    const synthesisKeyIdx = trimmed.indexOf('"synthesis"');
    if (synthesisKeyIdx === -1) {
      // Still in JSON preamble before "synthesis" - hide raw JSON
      return "";
    }

    const colonIdx = trimmed.indexOf(":", synthesisKeyIdx);
    if (colonIdx === -1) return "";

    const quoteIdx = trimmed.indexOf('"', colonIdx);
    if (quoteIdx === -1) return "";

    const afterQuote = trimmed.slice(quoteIdx + 1);
    let endIdx = -1;
    for (let i = 0; i < afterQuote.length; i++) {
      if (afterQuote[i] === '"' && (i === 0 || afterQuote[i - 1] !== "\\")) {
        endIdx = i;
        break;
      }
    }

    let extracted = endIdx === -1 ? afterQuote : afterQuote.slice(0, endIdx);
    try {
      extracted = JSON.parse(`"${extracted.replace(/\\"/g, '"').replace(/"/g, '\\"')}"`);
    } catch {
      extracted = extracted.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }

    // If still in initial preamble (< 80 chars) and unclosed, buffer briefly to verify it's not a refusal
    if (endIdx === -1 && extracted.length < 80) {
      return "";
    }

    // Check again if the extracted synthesis text itself indicates refusal
    if (/unrelated|cannot be provided|no synthesis|out of scope|insufficient evidence|not contain|not mentioned/i.test(extracted)) {
      return "";
    }

    return extracted;
  }

  // Not JSON: plain text stream
  return raw;
}

interface Conversation {
  id: string;
  ownerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  runId?: string | null;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export interface WorkflowStageInfo {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  shimmer: boolean;
}

const DEFAULT_STAGE: WorkflowStageInfo = {
  id: "retrieval",
  label: "Retrieving clinical evidence...",
  icon: AppIcons.search,
  shimmer: true,
};

function getWorkflowStage(agentOrEvent?: string, eventType?: string): WorkflowStageInfo {
  const agentLower = (agentOrEvent || "").toLowerCase();
  const evtLower = (eventType || "").toLowerCase();

  // 1. Explicit SSE event types take precedence
  if (evtLower === "refusal") {
    return {
      id: "refusal",
      label: "Request refused: insufficient evidence",
      icon: AppIcons.error,
      shimmer: false,
    };
  }

  if (evtLower === "error") {
    return {
      id: "error",
      label: "Workflow failed",
      icon: AppIcons.warning,
      shimmer: false,
    };
  }

  if (evtLower === "done") {
    return {
      id: "done",
      label: "Grounded response ready",
      icon: AppIcons.success,
      shimmer: false,
    };
  }

  if (
    evtLower === "approval_required" ||
    agentLower.includes("hitl approval gate") ||
    agentLower.includes("approval_pending")
  ) {
    return {
      id: "hitl",
      label: "Human approval required",
      icon: AppIcons.user,
      shimmer: false,
    };
  }

  if (evtLower === "run_resumed" || agentLower.includes("resum")) {
    return {
      id: "resume",
      label: "Resuming approved workflow...",
      icon: AppIcons.refresh,
      shimmer: true,
    };
  }

  if (
    evtLower === "twist_evaluation" ||
    agentLower.includes("twist guard") ||
    agentLower.includes("policy guard")
  ) {
    return {
      id: "twist_guard",
      label: "Running safety and Twist Guard checks...",
      icon: AppIcons.warning,
      shimmer: true,
    };
  }

  // 2. Step Agent Names
  if (agentLower.includes("retriev")) {
    return {
      id: "retrieval",
      label: "Retrieving clinical evidence...",
      icon: AppIcons.search,
      shimmer: true,
    };
  }

  if (agentLower.includes("extractor") || agentLower.includes("evidence")) {
    return {
      id: "extractor",
      label: "Extracting relevant clinical evidence...",
      icon: AppIcons.documents,
      shimmer: true,
    };
  }

  if (
    agentLower.includes("auditor") ||
    agentLower.includes("contraindication") ||
    agentLower.includes("safety") ||
    agentLower.includes("risk")
  ) {
    return {
      id: "auditor",
      label: "Checking contraindications and interactions...",
      icon: AppIcons.shieldCheck,
      shimmer: true,
    };
  }

  if (
    agentLower.includes("drafter") ||
    agentLower.includes("therapeutic") ||
    agentLower.includes("synthesis")
  ) {
    return {
      id: "drafter",
      label: "Generating grounded protocol synthesis...",
      icon: AppIcons.sparkles,
      shimmer: true,
    };
  }

  if (agentLower.includes("tool executor")) {
    return {
      id: "tool_executor",
      label: "Executing approved clinical action...",
      icon: AppIcons.activity,
      shimmer: true,
    };
  }

  // 3. Fallback for unknown backend event/stage (safe generic status)
  return {
    id: "unknown",
    label: "Processing request...",
    icon: AppIcons.activity,
    shimmer: true,
  };
}

export default function CopilotPage() {
  const { toast } = useToast();

  // Conversations State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Delete Conversation Dialog State
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);

  // Input & Streaming State
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [currentStage, setCurrentStage] = useState<WorkflowStageInfo>(DEFAULT_STAGE);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState("");
  const [streamCitations, setStreamCitations] = useState<Citation[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [isRefused, setIsRefused] = useState(false);
  const [refusalMessage, setRefusalMessage] = useState("");
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // HITL Approval State
  const [pendingApproval, setPendingApproval] = useState<ApprovalInfo | null>(null);
  const [isAwaitingApproval, setIsAwaitingApproval] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const activeConversationIdRef = useRef<string | null>(null);

  // User Permissions (for inline HITL approval authorization)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);
  const [inlineApproving, setInlineApproving] = useState(false);

  const canApprove =
    currentUserRole === "ADMIN" ||
    currentUserRole === "APPROVER" ||
    currentUserPermissions.includes("APPROVE_ACTIONS");

  // Mandatory Twist State (TW-005)
  const [twistEvaluation, setTwistEvaluation] = useState<{
    isPermitted: boolean;
    computedRiskIndex: number;
    threshold: number;
    enforcedPolicy: string;
    violations: string[];
  } | null>(null);

  // Workflow Progress Rail
  const [steps, setSteps] = useState<StepProgress[]>([
    { agent: "Retrieval Engine (Cross-Lingual AR+EN)", status: "pending" },
    { agent: "Clinical Evidence Extractor", status: "pending" },
    { agent: "Contraindication & Safety Auditor", status: "pending" },
    { agent: "Bilingual Context & Policy Guard", status: "pending" },
    { agent: "Therapeutic Protocol Drafter", status: "pending" },
  ]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const resumeInProgressRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initialMountDone = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id || null;
  }, [activeConversation]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamedText, scrollToBottom]);

  // Load Messages for a Conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    setChatError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (res.status === 401) {
        window.location.href = `/login?returnUrl=/copilot?conversationId=${conversationId}`;
        return;
      }
      if (res.status === 403) {
        setChatError("Access denied: You do not have permission to access this chat.");
        setMessages([]);
        return;
      }
      if (res.status === 404) {
        setChatError("This chat was not found.");
        setMessages([]);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load messages (${res.status})`);
      }
      const data = await res.json();
      const loadedMessages = data.messages || [];
      setMessages(loadedMessages);

      const lastMsg = loadedMessages[loadedMessages.length - 1];
      if (
        lastMsg &&
        lastMsg.role === "assistant" &&
        (lastMsg.metadata?.status === "REFUSED" || lastMsg.metadata?.code === "LOW_EVIDENCE_REFUSAL")
      ) {
        setIsRefused(true);
        setRefusalMessage(lastMsg.content);
        if (lastMsg.runId) setCurrentRunId(lastMsg.runId);
        setCurrentStage(getWorkflowStage("", "refusal"));
      }
    } catch (err: any) {
      setChatError(err.message || "Failed to load chat messages.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Check if a conversation has a pending HITL approval
  const checkConversationApproval = useCallback(async (conversationId: string) => {
    setCheckingApproval(true);
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/approval`);
      if (!res.ok) return;
      const data = await res.json();

      // Guard: Ensure user has not switched to another conversation during the fetch
      if (activeConversationIdRef.current !== conversationId) return;

      if (data.hasPendingApproval && data.approval && data.status === "APPROVAL_PENDING") {
        const approval = data.approval;
        const isApproved = approval.status === "APPROVED" || approval.status === "EDIT_APPROVED";

        setCurrentRunId(data.runId);
        setPendingApproval({
          approvalId: approval.id || approval.approvalId,
          riskLevel: approval.riskLevel || "HIGH",
          proposedAction: approval.proposedAction || "Action requires human review",
          riskFlags: approval.riskFlags || [],
          status: approval.status,
        });
        setIsAwaitingApproval(true);
        setCurrentStage(getWorkflowStage("", "approval_required"));

        setSteps([
          { agent: "Retrieval Engine (Cross-Lingual AR+EN)", status: "completed" },
          { agent: "Clinical Evidence Extractor", status: "completed" },
          { agent: "Contraindication & Safety Auditor", status: "completed" },
          { agent: "Bilingual Context & Policy Guard", status: "completed" },
          {
            agent: "HITL Approval Gate",
            status: isApproved ? "completed" : "approval_pending",
          },
          { agent: "Therapeutic Protocol Drafter", status: "pending" },
        ]);
      } else {
        if (activeConversationIdRef.current === conversationId) {
          setPendingApproval(null);
          setIsAwaitingApproval(false);
        }
      }
    } catch (err) {
      console.warn("Failed to check conversation pending approval:", err);
    } finally {
      if (activeConversationIdRef.current === conversationId) {
        setCheckingApproval(false);
      }
    }
  }, []);

  // Select Active Conversation
  const selectConversation = useCallback((conv: Conversation) => {
    activeConversationIdRef.current = conv.id;
    setActiveConversation(conv);
    // Reset transient stream states
    setStreamedText("");
    setStreamCitations([]);
    setIsRefused(false);
    setRefusalMessage("");
    setPendingApproval(null);
    setIsAwaitingApproval(false);
    setInlineApproving(false);
    setTwistEvaluation(null);
    setSelectedCitation(null);
    setCurrentStage(DEFAULT_STAGE);

    // Update URL query param without reload
    const url = new URL(window.location.href);
    url.searchParams.set("conversationId", conv.id);
    url.searchParams.delete("runId");
    url.searchParams.delete("resume");
    window.history.pushState({}, "", url.toString());

    loadMessages(conv.id);
    checkConversationApproval(conv.id);
  }, [loadMessages, checkConversationApproval]);

  const resumeWorkflow = useCallback(async (runId: string, approvalId: string, convId?: string) => {
    if (resumeInProgressRef.current) return;
    resumeInProgressRef.current = true;
    setStreaming(true);
    setIsAwaitingApproval(false);
    setCurrentStage(getWorkflowStage("", "run_resumed"));

    // Strip resume=true from URL immediately to prevent duplicate runs on page reload
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("resume");
      window.history.replaceState(null, "", url.pathname + url.search);
    } catch {}

    // Resolve target conversation ID
    let targetConversationId = convId || activeConversation?.id;
    if (!targetConversationId) {
      try {
        const rRes = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
        if (rRes.ok) {
          const rData = await rRes.json();
          targetConversationId = rData.conversationId || rData.run?.sessionId;
        }
      } catch {}
    }

    // Update steps: mark HITL gate completed, mark Drafter running
    setSteps((prev) => {
      const hasGate = prev.some((s) => s.agent.toLowerCase().includes("hitl"));
      const updated = prev.map((s) => {
        if (s.agent.toLowerCase().includes("hitl")) {
          return { ...s, status: "completed" as const };
        }
        if (s.agent.toLowerCase().includes("drafter") || s.agent.toLowerCase().includes("therapeutic")) {
          return { ...s, status: "running" as const };
        }
        return s;
      });
      if (!hasGate) {
        const drafterIdx = updated.findIndex(
          (s) => s.agent.toLowerCase().includes("drafter") || s.agent.toLowerCase().includes("therapeutic")
        );
        const gate = { agent: "HITL Approval Gate", status: "completed" as const };
        if (drafterIdx !== -1) {
          updated.splice(drafterIdx, 0, gate);
        } else {
          updated.push(gate);
        }
      }
      return updated;
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        // If 409 Conflict, the run may already have been resumed or completed
        if (res.status === 409) {
          const runRes = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
          if (runRes.ok) {
            const runData = await runRes.json();
            const cId = targetConversationId || runData.conversationId || runData.run?.sessionId;
            if (cId) {
              if (!activeConversation || activeConversation.id !== cId) {
                const singleConvRes = await fetch(`/api/conversations/${cId}`);
                if (singleConvRes.ok) {
                  const scData = await singleConvRes.json();
                  setActiveConversation(scData.conversation);
                }
              }
              await loadMessages(cId);
              setStreamedText("");
              setStreamCitations([]);
              setStreaming(false);
              setIsAwaitingApproval(false);
              setPendingApproval(null);
              return;
            }
          }
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Resume failed with HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body returned from resume endpoint");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = "message";
          let dataStr = "";
          const lines = part.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace(/^event:\s*/, "").trim();
            } else if (line.startsWith("data:")) {
              dataStr += line.replace(/^data:\s*/, "");
            }
          }

          if (dataStr) {
            try {
              const data = JSON.parse(dataStr);
              if (eventType === "run_resumed") {
                setStreaming(true);
                setIsAwaitingApproval(false);
                setPendingApproval(null);
                setCurrentStage(getWorkflowStage("", "run_resumed"));
              } else if (eventType === "step_start") {
                setCurrentStage(getWorkflowStage(data.agent, "step_start"));
                setSteps((prev) =>
                  prev.map((s) => {
                    const match =
                      s.agent.toLowerCase().includes(data.agent?.toLowerCase() || "") ||
                      (data.agent && data.agent.toLowerCase().includes(s.agent.toLowerCase()));
                    return match ? { ...s, status: "running" } : s;
                  })
                );
              } else if (eventType === "step_complete") {
                setSteps((prev) =>
                  prev.map((s) => {
                    const match =
                      s.agent.toLowerCase().includes(data.agent?.toLowerCase() || "") ||
                      (data.agent && data.agent.toLowerCase().includes(s.agent.toLowerCase()));
                    return match ? { ...s, status: "completed" } : s;
                  })
                );
              } else if (eventType === "token") {
                setStreamedText((prev) => prev + (data.token || ""));
              } else if (eventType === "citation") {
                const item = data.data || data;
                if (item && item.chunkId) {
                  setStreamCitations((prev: Citation[]) => {
                    const exists = prev.some((c: Citation) => c.chunkId === item.chunkId);
                    return exists ? prev : [...prev, item];
                  });
                }
              } else if (eventType === "done") {
                setCurrentStage(getWorkflowStage("", "done"));
                setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
                try {
                  localStorage.removeItem("copilot_active_run_id");
                } catch {}

                // Load the authoritative persisted message from the server before turning off streaming
                if (targetConversationId) {
                  if (!activeConversation || activeConversation.id !== targetConversationId) {
                    try {
                      const cRes = await fetch(`/api/conversations/${targetConversationId}`);
                      if (cRes.ok) {
                        const cData = await cRes.json();
                        setActiveConversation(cData.conversation);
                      }
                    } catch {}
                  }
                  await loadMessages(targetConversationId);
                  setStreamedText("");
                  setStreamCitations([]);
                } else {
                  const cleanAnswer = data.finalAnswer || data.data?.finalAnswer;
                  if (cleanAnswer) {
                    setStreamedText(normalizeDisplayText(cleanAnswer));
                  }
                  if (Array.isArray(data.citations) && data.citations.length > 0) {
                    setStreamCitations(data.citations);
                  }
                }
                setStreaming(false);
              } else if (eventType === "refusal") {
                setCurrentStage(getWorkflowStage("", "refusal"));
                setIsRefused(true);
                setRefusalMessage(data.message || "Request was refused.");
                setStreamedText("");
                setStreamCitations([]);
                setStreaming(false);
                setIsAwaitingApproval(false);
                setPendingApproval(null);
                try {
                  localStorage.removeItem("copilot_active_run_id");
                } catch {}
                if (targetConversationId) {
                  await loadMessages(targetConversationId);
                  setStreamedText("");
                  setStreamCitations([]);
                }
              } else if (eventType === "error") {
                setCurrentStage(getWorkflowStage("", "error"));
                setStreaming(false);
                if (data.message) {
                  setStreamedText((prev) => prev || `Workflow notification: ${data.message}`);
                }
                setSteps((prev) =>
                  prev.map((s) => (s.status === "running" ? { ...s, status: "completed" } : s))
                );
              }
            } catch (e) {
              console.warn("Failed to parse SSE payload:", e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast({
          title: "Resume Failed",
          description: "Failed to resume run execution.",
          variant: "destructive",
        });
      }
      setStreaming(false);
    } finally {
      resumeInProgressRef.current = false;
    }
  }, [activeConversation, loadMessages, toast]);

  // Fetch authenticated user profile & permissions on mount
  useEffect(() => {
    let isMounted = true;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.user?.role) setCurrentUserRole(data.user.role);
        if (Array.isArray(data.permissions)) setCurrentUserPermissions(data.permissions);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Mount-time rehydration effect
  useEffect(() => {
    if (initialMountDone.current) return;
    initialMountDone.current = true;

    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const urlRunId = params.get("runId");
    let storedRunId: string | null = null;
    try {
      storedRunId = localStorage.getItem("copilot_active_run_id");
    } catch {}

    const targetRunId = urlRunId || storedRunId;
    const shouldResume = params.get("resume") === "true";

    if (!targetRunId) return;

    let isCancelled = false;

    async function rehydrate(runId: string) {
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
        if (!res.ok) {
          if (res.status === 401) {
            const currentPath = window.location.pathname + window.location.search;
            window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
            return;
          }

          let errMessage = `Failed to load run (HTTP ${res.status})`;
          try {
            const errData = await res.json();
            if (errData?.error) errMessage = errData.error;
          } catch {}

          if (res.status === 404) {
            try {
              localStorage.removeItem("copilot_active_run_id");
            } catch {}
            errMessage = "The requested run was not found.";
          }

          if (isCancelled) return;
          setAccessDeniedMessage(errMessage);
          setStreaming(false);
          setIsAwaitingApproval(false);
          setPendingApproval(null);
          return;
        }

        const data = await res.json();
        if (isCancelled) return;

        const { run, approval } = data;
        if (!run) return;

        const targetConvId = data.conversationId || run.sessionId;
        if (targetConvId) {
          if (!activeConversation || activeConversation.id !== targetConvId) {
            try {
              const cRes = await fetch(`/api/conversations/${targetConvId}`);
              if (cRes.ok) {
                const cData = await cRes.json();
                setActiveConversation(cData.conversation);
              }
            } catch {}
          }
          await loadMessages(targetConvId);
        }

        setCurrentRunId(run.id);
        if (run.query) setQuery(run.query);

        if (run.status === "COMPLETED") {
          setStreaming(false);
          setIsAwaitingApproval(false);
          setPendingApproval(null);
          setStreamedText("");
          setStreamCitations([]);
          setSteps([
            { agent: "Retrieval Engine (Cross-Lingual AR+EN)", status: "completed" },
            { agent: "Clinical Evidence Extractor", status: "completed" },
            { agent: "Contraindication & Safety Auditor", status: "completed" },
            { agent: "Bilingual Context & Policy Guard", status: "completed" },
            ...(approval ? [{ agent: "HITL Approval Gate", status: "completed" as const }] : []),
            { agent: "Therapeutic Protocol Drafter", status: "completed" },
          ]);
          try {
            localStorage.removeItem("copilot_active_run_id");
            if (shouldResume) {
              const url = new URL(window.location.href);
              url.searchParams.delete("resume");
              window.history.replaceState(null, "", url.pathname + url.search);
            }
          } catch {}
        } else if (run.status === "REFUSED") {
          setStreaming(false);
          setIsRefused(true);
          setRefusalMessage(run.refusalReason || run.answer || "Request refused by policy or human reviewer.");
          setIsAwaitingApproval(false);
          setPendingApproval(null);
          setStreamedText("");
          setStreamCitations([]);
          try {
            localStorage.removeItem("copilot_active_run_id");
          } catch {}
        } else if (run.status === "FAILED" || run.status === "CANCELLED") {
          setStreaming(false);
          setIsAwaitingApproval(false);
          setPendingApproval(null);
          setStreamedText(run.error || run.answer || `Workflow was ${run.status.toLowerCase()}.`);
          try {
            localStorage.removeItem("copilot_active_run_id");
          } catch {}
        } else if (run.status === "APPROVAL_PENDING") {
          const isApproved = approval && (approval.status === "APPROVED" || approval.status === "EDIT_APPROVED");

          setSteps([
            { agent: "Retrieval Engine (Cross-Lingual AR+EN)", status: "completed" },
            { agent: "Clinical Evidence Extractor", status: "completed" },
            { agent: "Contraindication & Safety Auditor", status: "completed" },
            { agent: "Bilingual Context & Policy Guard", status: "completed" },
            {
              agent: "HITL Approval Gate",
              status: isApproved ? "completed" : "approval_pending",
            },
            { agent: "Therapeutic Protocol Drafter", status: "pending" },
          ]);

          if (approval) {
            setPendingApproval({
              approvalId: approval.id,
              riskLevel: approval.riskLevel || "HIGH",
              proposedAction: approval.proposedAction || "Action requires human review",
              riskFlags: (approval.originalPayload?.flags as any[]) || [],
              status: approval.status,
            });
          }

          if (shouldResume && isApproved && !resumeInProgressRef.current) {
            setIsAwaitingApproval(false);
            await resumeWorkflow(run.id, approval.id, targetConvId);
          } else {
            setIsAwaitingApproval(true);
            setCurrentStage(getWorkflowStage("", "approval_required"));
          }
        } else if (run.status === "RUNNING" || run.status === "STREAMING") {
          setStreaming(true);
          setCurrentStage(getWorkflowStage("Retrieval Engine", "step_start"));
          setSteps((prev) =>
            prev.map((s, idx) => (idx === 0 ? { ...s, status: "running" } : s))
          );
        }
      } catch (err) {
        console.error("Mount rehydration failed:", err);
      }
    }

    rehydrate(targetRunId);

    return () => {
      isCancelled = true;
    };
  }, [resumeWorkflow, activeConversation, loadMessages]);

  // Poll for approval status when awaiting approval
  useEffect(() => {
    if (!isAwaitingApproval || !currentRunId || streaming) return;

    let isCancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(currentRunId)}`);
        if (!res.ok || isCancelled) return;
        const data = await res.json();
        const { run, approval } = data;
        if (!run) return;

        const targetConvId = data.conversationId || run.sessionId || activeConversation?.id;

        // If run already completed in background:
        if (run.status === "COMPLETED") {
          clearInterval(interval);
          if (targetConvId) {
            await loadMessages(targetConvId);
          }
          setStreaming(false);
          setIsAwaitingApproval(false);
          setPendingApproval(null);
          setStreamedText("");
          setStreamCitations([]);
          setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
          return;
        }

        // If run was refused/rejected:
        if (run.status === "REFUSED") {
          clearInterval(interval);
          setIsRefused(true);
          setRefusalMessage(run.refusalReason || run.answer || "Request refused by policy or human reviewer.");
          setIsAwaitingApproval(false);
          setPendingApproval(null);
          setStreaming(false);
          if (targetConvId) {
            await loadMessages(targetConvId);
          }
          return;
        }

        // If approval was approved and ready to resume:
        if (
          run.status === "APPROVAL_PENDING" &&
          approval &&
          (approval.status === "APPROVED" || approval.status === "EDIT_APPROVED") &&
          !resumeInProgressRef.current
        ) {
          clearInterval(interval);
          setIsAwaitingApproval(false);
          await resumeWorkflow(run.id, approval.id, targetConvId);
        }
      } catch {}
    }, 2500);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [isAwaitingApproval, currentRunId, streaming, activeConversation, loadMessages, resumeWorkflow]);

  // Create New Chat
  const handleNewChat = useCallback(async () => {
    setChatError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (res.status === 401) {
        window.location.href = "/login?returnUrl=/copilot";
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to create new chat (${res.status})`);
      }
      const data = await res.json();
      const newConv: Conversation = data.conversation;

      activeConversationIdRef.current = newConv.id;
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversation(newConv);
      setMessages([]);
      setStreamedText("");
      setStreamCitations([]);
      setIsRefused(false);
      setPendingApproval(null);
      setIsAwaitingApproval(false);
      setCheckingApproval(false);
      setSelectedCitation(null);

      const url = new URL(window.location.href);
      url.searchParams.set("conversationId", newConv.id);
      window.history.pushState({}, "", url.toString());
    } catch (err: any) {
      toast({
        title: "Chat Creation Failed",
        description: "Failed to create new chat conversation.",
        variant: "destructive",
      });
    }
  }, []);

  // Delete Conversation Flow (via shadcn/ui AlertDialog)
  const handleRequestDeleteConversation = useCallback((e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    setConversationToDelete(convId);
  }, []);

  const handleConfirmDeleteConversation = useCallback(async () => {
    if (!conversationToDelete || isDeletingConversation) return;

    const convId = conversationToDelete;
    setIsDeletingConversation(true);

    try {
      const res = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete chat");

      setConversations((prev) => prev.filter((c) => c.id !== convId));
      setConversationToDelete(null);
      toast({
        title: "Chat Deleted",
        description: "Chat history deleted successfully.",
      });

      if (activeConversation?.id === convId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        if (remaining.length > 0) {
          selectConversation(remaining[0]);
        } else {
          setActiveConversation(null);
          setMessages([]);
          const url = new URL(window.location.href);
          url.searchParams.delete("conversationId");
          window.history.pushState({}, "", url.toString());
        }
      }
    } catch (err: any) {
      toast({
        title: "Delete Failed",
        description: "Failed to delete chat history.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingConversation(false);
    }
  }, [conversationToDelete, isDeletingConversation, activeConversation, conversations, selectConversation]);

  // Initial Boot & URL Rehydration
  useEffect(() => {
    async function init() {
      setLoadingConversations(true);
      try {
        const res = await fetch("/api/conversations");
        if (res.status === 401) {
          window.location.href = "/login?returnUrl=/copilot";
          return;
        }
        if (!res.ok) throw new Error("Failed to load conversations");

        const data = await res.json();
        const convList: Conversation[] = data.conversations || [];
        setConversations(convList);

        const params = new URLSearchParams(window.location.search);
        let urlConvId = params.get("conversationId");
        const urlRunId = params.get("runId");

        // If runId is present without conversationId, recover conversationId from the run
        if (!urlConvId && urlRunId) {
          try {
            const rRes = await fetch(`/api/runs/${encodeURIComponent(urlRunId)}`);
            if (rRes.ok) {
              const rData = await rRes.json();
              urlConvId = rData.conversationId || rData.run?.sessionId || null;
            }
          } catch {}
        }

        if (urlConvId) {
          const match = convList.find((c) => c.id === urlConvId);
          if (match) {
            selectConversation(match);
          } else {
            // Try fetching specific conversation directly (in case it's newly created or not in owner list)
            const singleRes = await fetch(`/api/conversations/${urlConvId}`);
            if (singleRes.ok) {
              const singleData = await singleRes.json();
              activeConversationIdRef.current = urlConvId;
              setActiveConversation(singleData.conversation);
              loadMessages(urlConvId);
              checkConversationApproval(urlConvId);
            } else if (!urlRunId && convList.length > 0) {
              selectConversation(convList[0]);
            }
          }
        } else if (!urlRunId && convList.length > 0) {
          selectConversation(convList[0]);
        }
      } catch (err: any) {
        setChatError(err.message || "Failed to load chat history.");
      } finally {
        setLoadingConversations(false);
      }
    }

    init();
  }, [loadMessages, selectConversation, checkConversationApproval]);

  // Submit Query in Active Conversation
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || streaming || submitting) return;

    setSubmitting(true);
    let targetConv = activeConversation;

    // If no active conversation, create one automatically
    if (!targetConv) {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Chat" }),
        });
        if (!res.ok) throw new Error("Failed to create conversation");
        const data = await res.json();
        targetConv = data.conversation;
        setConversations((prev) => [targetConv!, ...prev]);
        setActiveConversation(targetConv);
      } catch (err: any) {
        toast({
          title: "Chat Failed",
          description: "Failed to initiate chat. Please try again.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }
    }

    if (!targetConv) {
      setSubmitting(false);
      return;
    }

    const currentQuery = query.trim();
    setQuery("");
    setStreaming(true);
    setStreamedText("");
    setStreamCitations([]);
    setIsRefused(false);
    setRefusalMessage("");
    setAccessDeniedMessage(null);
    setPendingApproval(null);
    setIsAwaitingApproval(false);
    setSelectedCitation(null);
    setTwistEvaluation(null);
    setCurrentStage(getWorkflowStage("Retrieval Engine", "step_start"));

    // Reset steps
    setSteps([
      { agent: "Retrieval Engine (Cross-Lingual AR+EN)", status: "running" },
      { agent: "Clinical Evidence Extractor", status: "pending" },
      { agent: "Contraindication & Safety Auditor", status: "pending" },
      { agent: "Bilingual Context & Policy Guard", status: "pending" },
      { agent: "Therapeutic Protocol Drafter", status: "pending" },
    ]);

    try {
      const initRes = await fetch(`/api/conversations/${targetConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: currentQuery }),
      });

      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to send message (${initRes.status})`);
      }

      const { runId, message: userMsg } = await initRes.json();
      setCurrentRunId(runId);
      try {
        localStorage.setItem("copilot_active_run_id", runId);
        window.history.replaceState(
          null,
          "",
          `/copilot?conversationId=${encodeURIComponent(targetConv.id)}&runId=${encodeURIComponent(runId)}`
        );
      } catch {}

      // Optimistically add user message to messages list
      setMessages((prev) => [...prev, userMsg]);

      // Update active conversation title if it was "New Chat"
      if (targetConv.title === "New Chat") {
        const titleRes = await fetch(`/api/conversations/${targetConv.id}`);
        if (titleRes.ok) {
          const updatedConvData = await titleRes.json();
          setActiveConversation(updatedConvData.conversation);
          setConversations((prev) =>
            prev.map((c) => (c.id === targetConv!.id ? updatedConvData.conversation : c))
          );
        }
      }

      // Open SSE Stream to active run
      const sse = new EventSource(`/api/runs/${runId}/stream`);
      eventSourceRef.current = sse;
      setSubmitting(false);

      sse.addEventListener("step_start", (evt: any) => {
        const data = JSON.parse(evt.data);
        setCurrentStage(getWorkflowStage(data.agent, "step_start"));
        setSteps((prev) =>
          prev.map((s) => {
            const match =
              s.agent.toLowerCase().includes(data.agent.toLowerCase()) ||
              data.agent.toLowerCase().includes(s.agent.toLowerCase());
            return match ? { ...s, status: "running" } : s;
          })
        );
      });

      sse.addEventListener("step_complete", (evt: any) => {
        const data = JSON.parse(evt.data);
        setSteps((prev) =>
          prev.map((s) => {
            const match =
              s.agent.toLowerCase().includes(data.agent.toLowerCase()) ||
              data.agent.toLowerCase().includes(s.agent.toLowerCase());
            return match ? { ...s, status: "completed" } : s;
          })
        );
      });

      sse.addEventListener("token", (evt: any) => {
        const data = JSON.parse(evt.data);
        setStreamedText((prev) => prev + (data.token || ""));
      });

      sse.addEventListener("citation", (evt: any) => {
        const data = JSON.parse(evt.data);
        setStreamCitations((prev) => [...prev, data.data]);
      });

      sse.addEventListener("refusal", async (evt: any) => {
        const data = JSON.parse(evt.data);
        setCurrentStage(getWorkflowStage("", "refusal"));
        setIsRefused(true);
        setRefusalMessage(data.message || "Request was refused.");
        setStreamedText("");
        setStreamCitations([]);
        setStreaming(false);
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === 0 ? { ...s, status: "completed" } : { ...s, status: "pending" }
          )
        );
        try {
          localStorage.removeItem("copilot_active_run_id");
        } catch {}
        sse.close();

        // Refresh messages from server to load the cleanly persisted assistant message
        if (targetConv) {
          await loadMessages(targetConv.id);
          setStreamedText("");
          setStreamCitations([]);
        }
      });

      // TW-005: Handle twist_evaluation event
      sse.addEventListener("twist_evaluation", (evt: any) => {
        const data = JSON.parse(evt.data);
        setCurrentStage(getWorkflowStage("Mandatory Twist Guard", "twist_evaluation"));
        if (data.data) {
          setTwistEvaluation(data.data);
        }
      });

      // HITL-006: Handle approval_required event
      sse.addEventListener("approval_required", (evt: any) => {
        const data = JSON.parse(evt.data);
        const approvalData = data.data || data;
        setCurrentStage(getWorkflowStage("", "approval_required"));
        setPendingApproval({
          approvalId: approvalData.approvalId,
          riskLevel: approvalData.riskLevel || "HIGH",
          proposedAction: approvalData.proposedAction || "Action requires human review",
          riskFlags: approvalData.riskFlags || [],
          status: "PENDING",
        });
        setIsAwaitingApproval(true);
        setStreaming(false);

        setSteps((prev) => [
          ...prev.map((s) =>
            s.status === "running" ? { ...s, status: "completed" as const } : s
          ),
          { agent: "HITL Approval Gate", status: "approval_pending" as const },
        ]);

        sse.close();
      });

      // Run completed successfully: reload persisted messages
      sse.addEventListener("done", async (evt: any) => {
        setCurrentStage(getWorkflowStage("", "done"));
        setStreaming(false);
        setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
        if (evt?.data) {
          try {
            const data = JSON.parse(evt.data);
            if (data.refusal || data.data?.refusal) {
              setIsRefused(true);
              setRefusalMessage(data.refusalReason || data.data?.refusalReason || "Request was refused.");
              setStreamedText("");
              setStreamCitations([]);
            } else {
              const cleanAnswer = data.finalAnswer || data.data?.finalAnswer;
              if (cleanAnswer) {
                setStreamedText(normalizeDisplayText(cleanAnswer));
              } else {
                setStreamedText((prev) => normalizeDisplayText(prev));
              }
            }
          } catch {
            setStreamedText((prev) => normalizeDisplayText(prev));
          }
        } else {
          setStreamedText((prev) => normalizeDisplayText(prev));
        }
        try {
          localStorage.removeItem("copilot_active_run_id");
        } catch {}
        sse.close();

        // Refresh messages from server to load the cleanly persisted assistant message
        if (targetConv) {
          await loadMessages(targetConv.id);
          setStreamedText("");
          setStreamCitations([]);
        }
      });

      sse.addEventListener("error", (evt: any) => {
        setCurrentStage(getWorkflowStage("", "error"));
        setStreaming(false);
        if (evt.data) {
          try {
            const data = JSON.parse(evt.data);
            if (data.message) {
              setStreamedText((prev) => prev || `Workflow notification: ${data.message}`);
            }
          } catch {}
        }
        setSteps((prev) =>
          prev.map((s) => (s.status === "running" ? { ...s, status: "completed" } : s))
        );
        sse.close();
      });

      sse.onerror = () => {
        setStreaming(false);
        setSteps((prev) =>
          prev.map((s) => (s.status === "running" ? { ...s, status: "completed" } : s))
        );
        sse.close();
      };
    } catch (err: any) {
      toast({
        title: "Query Failed",
        description: "Failed to execute query. Please try again.",
        variant: "destructive",
      });
      setStreaming(false);
      setSubmitting(false);
      setSteps((prev) =>
        prev.map((s) => (s.status === "running" ? { ...s, status: "completed" } : s))
      );
    }
  };

  const handleCancel = async () => {
    if (currentRunId) {
      await fetch(`/api/runs/${currentRunId}/cancel`, { method: "POST" }).catch(() => {});
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStreaming(false);
    try {
      localStorage.removeItem("copilot_active_run_id");
    } catch {}
  };

  const handleNewQuery = () => {
    if (streaming) return;
    setCurrentRunId(null);
    setQuery("");
    setStreamedText("");
    setStreamCitations([]);
    setSelectedCitation(null);
    setIsRefused(false);
    setRefusalMessage("");
    setAccessDeniedMessage(null);
    setPendingApproval(null);
    setIsAwaitingApproval(false);
    setInlineApproving(false);
    setTwistEvaluation(null);
    setSteps([
      { agent: "Retrieval Engine (Cross-Lingual AR+EN)", status: "pending" },
      { agent: "Clinical Evidence Extractor", status: "pending" },
      { agent: "Contraindication & Safety Auditor", status: "pending" },
      { agent: "Bilingual Context & Policy Guard", status: "pending" },
      { agent: "Therapeutic Protocol Drafter", status: "pending" },
    ]);
    try {
      localStorage.removeItem("copilot_active_run_id");
      window.history.replaceState(null, "", "/copilot");
    } catch {}
  };

  const handleInlineApprove = async () => {
    if (!pendingApproval?.approvalId || inlineApproving || resumeInProgressRef.current) return;

    const approvalId = pendingApproval.approvalId;
    const runId = currentRunId;
    const convId = activeConversation?.id;

    setInlineApproving(true);

    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "Inline approved from Copilot chat" }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({
          title: "Approval Failed",
          description: errData.error || `Approval failed with HTTP ${res.status}`,
          variant: "destructive",
        });
        setInlineApproving(false);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const targetRunId = data.approval?.runId || runId;
      const targetApprovalId = data.approval?.id || approvalId;
      const targetConvId = data.conversationId || convId;

      toast({
        title: "Action Approved",
        description: "Approval granted. Resuming workflow...",
        icon: <FiCheckCircle className="w-5 h-5 text-foreground shrink-0" />,
      });

      if (targetRunId && targetApprovalId) {
        await resumeWorkflow(targetRunId, targetApprovalId, targetConvId);
      }
    } catch (err: any) {
      toast({
        title: "Approval Error",
        description: err.message || "Failed to approve action.",
        variant: "destructive",
      });
    } finally {
      setInlineApproving(false);
    }
  };

  const handleCopy = (text: string, id?: string) => {
    navigator.clipboard.writeText(normalizeDisplayText(text));
    if (id) {
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 1. Conversations Sidebar (Chats History)                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="w-64 bg-card border border-border rounded-xl flex flex-col shrink-0 shadow-xs overflow-hidden">
        {/* Sidebar Header */}
        <div className="p-3 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-tight text-foreground uppercase">
              Recent Chats
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleNewChat}
            className="h-7 px-2.5 text-xs gap-1 shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            title="Start a new chat"
          >
            <AppIcons.plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </Button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingConversations ? (
            <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">
              Loading chats...
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <AppIcons.pending className="w-5 h-5 text-slate-400" />
              <span>No conversations yet. Click "New Chat" to begin!</span>
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = activeConversation?.id === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={`group relative flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all text-xs ${
                    isActive
                      ? "bg-sky-50 border border-sky-200 text-sky-950 font-semibold shadow-2xs"
                      : "hover:bg-slate-100/80 border border-transparent text-slate-700"
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="truncate text-xs leading-tight">
                      {conv.title || "Untitled Chat"}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground font-normal mt-0.5">
                      {formatRelativeTime(conv.updatedAt)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleRequestDeleteConversation(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition-opacity rounded hover:bg-white"
                    title="Delete Chat"
                  >
                    <AppIcons.delete className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 2. Main Chat Thread & Composer                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden shadow-xs">
        {/* Workspace Top Header */}
        <div className="p-3.5 px-5 border-b border-border bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <LuBot className="w-4 h-4 text-foreground shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-foreground truncate tracking-tight">
                {activeConversation?.title || "Copilot Grounded Workspace"}
              </h2>
              <p className="text-[10px] text-muted-foreground font-mono truncate">
                Multi-Agent RAG Pipeline · Persistent Chat History
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            {twistEvaluation && (
              <Badge
                variant={twistEvaluation.isPermitted ? "success" : "destructive"}
                className="gap-1.5 font-mono text-[11px]"
              >
                <AppIcons.warning className="w-3.5 h-3.5" />
                TWIST GUARD: {twistEvaluation.isPermitted ? "PERMITTED" : "TRIPPED"} ({twistEvaluation.computedRiskIndex}/{twistEvaluation.threshold})
              </Badge>
            )}

            {isRefused ? (
              <Badge variant="destructive" className="gap-1.5 font-mono text-[11px]">
                <AppIcons.warning className="w-3.5 h-3.5" />
                REFUSED: LOW EVIDENCE
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans text-sm bg-slate-50/40 flex flex-col">
          {accessDeniedMessage && (
            <Card className="border-rose-200 bg-rose-50/50 p-4 shadow-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-rose-800 text-xs">
                <AppIcons.warning className="w-4 h-4 text-rose-600" />
                <span>Access Restricted</span>
              </div>
              <p className="text-xs text-rose-700 leading-normal">{accessDeniedMessage}</p>
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-rose-300 text-rose-800 hover:bg-rose-100/50 shadow-2xs"
                  onClick={handleNewChat}
                >
                  Start New Chat
                </Button>
              </div>
            </Card>
          )}

          {chatError && (
            <Card className="p-4 border-rose-200 bg-rose-50/60 text-rose-800 text-xs shadow-2xs">
              <div className="flex items-center gap-2 font-semibold">
                <AppIcons.error className="w-4 h-4 text-rose-600" />
                <span>{chatError}</span>
              </div>
            </Card>
          )}

          {loadingMessages || checkingApproval ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
              Loading chat messages and workflow state...
            </div>
          ) : messages.length === 0 && streamedText.length === 0 && !isRefused && !isAwaitingApproval && !accessDeniedMessage ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 select-none">
              <LuBot className="w-8 h-8 text-foreground/70 mb-3" />
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                Ask a clinical protocol question
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1.5 leading-relaxed">
                Queries are processed through hybrid retrieval, verified by specialist agents, and persisted to this conversation.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === "user";

              if (isUser) {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[78%] bg-sky-600 text-white rounded-2xl rounded-tr-xs p-3.5 px-4 shadow-2xs">
                      <p className="text-xs leading-relaxed whitespace-pre-wrap font-sans" dir="auto">
                        {msg.content}
                      </p>
                      <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-sky-200 font-mono">
                        <span>{formatRelativeTime(msg.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              // Check if assistant message is a refusal
              const isRefusalMessage =
                msg.metadata?.status === "REFUSED" ||
                msg.metadata?.code === "LOW_EVIDENCE_REFUSAL";

              if (isRefusalMessage) {
                // Suppress redundant top refusal card in message list.
                // The detailed refusal card with "Request refused: insufficient evidence"
                // is rendered in the active workflow presentation below.
                return null;
              }

              // Assistant message
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[90%] bg-card border border-slate-200 rounded-2xl rounded-tl-xs p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                        <LuBot className="w-3.5 h-3.5 text-foreground/80" />
                        <span>Domain Copilot</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {msg.runId && (
                          <Link
                            href={`/runs/${msg.runId}`}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-sky-700 bg-slate-100/70 hover:bg-sky-50 px-2 py-0.5 rounded transition-colors"
                            title="Inspect execution trace"
                          >
                            <span>View Run</span>
                            <AppIcons.external className="w-2.5 h-2.5" />
                          </Link>
                        )}
                        <button
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className="text-[10px] text-slate-500 hover:text-slate-800 transition-colors p-1"
                          title="Copy response"
                        >
                          {copiedMessageId === msg.id ? (
                            <AppIcons.check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <AppIcons.copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="prose prose-slate max-w-none text-xs text-slate-800 leading-relaxed whitespace-pre-wrap" dir="auto">
                      {normalizeDisplayText(msg.content)}
                    </div>

                    {/* Citations Chip Bar */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-mono text-muted-foreground mb-1.5 font-semibold">
                          CITATIONS ({msg.citations.length}):
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((c, i) => (
                            <button
                              key={c.citationId || i}
                              onClick={() => setSelectedCitation(c)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-[10px] font-mono text-sky-800 transition-colors shadow-2xs"
                            >
                              <span>[{c.documentName}, p.{c.page || 1}]</span>
                              <AppIcons.external className="w-2 h-2 text-slate-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Active Live Workflow / Processing State */}
          {(streaming || (isAwaitingApproval && pendingApproval) || isRefused) && (
            <div className="flex justify-start">
              {isRefused ? (
                /* Refusal Card (Unchanged) */
                <div className="w-full max-w-2xl border border-border bg-transparent rounded-md p-4 space-y-3 shadow-none">
                  <Marker variant="border" size="lg" role="status" className="w-full justify-start gap-2">
                    <MarkerIcon>
                      <currentStage.icon
                        className="w-3.5 h-3.5 shrink-0 text-destructive"
                        aria-hidden="true"
                      />
                    </MarkerIcon>
                    <MarkerContent className={cn("text-sm font-medium text-foreground", currentStage.shimmer && "shimmer")}>
                      {currentStage.label}
                    </MarkerContent>
                  </Marker>

                  <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                        <AppIcons.warning className="w-3.5 h-3.5" />
                        <span>REFUSED: LOW EVIDENCE</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentRunId && (
                          <Link
                            href={`/runs/${currentRunId}`}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-600 hover:text-rose-800 bg-rose-100/70 hover:bg-rose-100 px-2 py-0.5 rounded transition-colors"
                            title="Inspect execution trace"
                          >
                            <span>View Run</span>
                            <AppIcons.external className="w-2.5 h-2.5" />
                          </Link>
                        )}
                        <button
                          onClick={() => handleCopy(refusalMessage, "refusal-card")}
                          className="text-[10px] text-rose-500 hover:text-rose-800 transition-colors p-1"
                          title="Copy refusal notice"
                        >
                          {copiedMessageId === "refusal-card" ? (
                            <AppIcons.check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <AppIcons.copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-rose-900 dark:text-rose-200 leading-normal font-sans" dir="auto">
                      {normalizeDisplayText(refusalMessage)}
                    </p>
                  </div>
                </div>
              ) : isAwaitingApproval && pendingApproval ? (
                /* HITL Approval Card (Unchanged) */
                <div className="w-full max-w-2xl border border-border bg-transparent rounded-md p-4 space-y-3 shadow-none">
                  <Marker variant="border" size="lg" role="status" className="w-full justify-start gap-2">
                    <MarkerIcon>
                      <currentStage.icon
                        className="w-3.5 h-3.5 shrink-0 text-amber-600"
                        aria-hidden="true"
                      />
                    </MarkerIcon>
                    <MarkerContent className={cn("text-sm font-medium text-foreground", currentStage.shimmer && "shimmer")}>
                      {currentStage.label}
                    </MarkerContent>
                  </Marker>

                  <div className="space-y-3">
                    <p className="text-xs text-amber-900 leading-normal font-medium">{pendingApproval.proposedAction}</p>

                    {pendingApproval.riskFlags.length > 0 && (
                      <div className="space-y-1.5">
                        {pendingApproval.riskFlags.map((flag, i) => (
                          <div
                            key={i}
                            className={`px-2.5 py-1.5 rounded text-[11px] font-mono border ${
                              flag.severity === "CRITICAL"
                                ? "bg-rose-100/60 border-rose-200 text-rose-800"
                                : flag.severity === "HIGH"
                                ? "bg-amber-100/60 border-amber-200 text-amber-900"
                                : "bg-sky-100/60 border-sky-200 text-sky-800"
                            }`}
                          >
                            <span className="font-bold">{flag.severity}:</span> {flag.riskType} — {flag.detail}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      {pendingApproval.status === "APPROVED" || pendingApproval.status === "EDIT_APPROVED" ? (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 text-xs shadow-xs"
                          onClick={() => {
                            if (currentRunId && pendingApproval.approvalId) {
                              resumeWorkflow(currentRunId, pendingApproval.approvalId, activeConversation?.id);
                            }
                          }}
                        >
                          <AppIcons.success className="w-3.5 h-3.5" />
                          Resume Workflow Now
                          <AppIcons.arrowRight className="w-3 h-3" />
                        </Button>
                      ) : (
                        <>
                          {canApprove && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 text-xs shadow-xs font-semibold"
                              onClick={handleInlineApprove}
                              disabled={inlineApproving || streaming}
                            >
                              {inlineApproving ? (
                                <AppIcons.loading className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <AppIcons.success className="w-3.5 h-3.5" />
                              )}
                              <span>{inlineApproving ? "Approving & Resuming..." : "Approve & Continue"}</span>
                              {!inlineApproving && <AppIcons.arrowRight className="w-3 h-3" />}
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant={canApprove ? "outline" : "default"}
                            className={
                              canApprove
                                ? "text-amber-900 border-amber-300 hover:bg-amber-100/70 gap-1.5 text-xs shadow-xs font-medium"
                                : "bg-amber-600 hover:bg-amber-500 text-white gap-1.5 text-xs shadow-xs"
                            }
                            asChild
                          >
                            <Link href="/reviews">
                              <AppIcons.warning className={`w-3.5 h-3.5 ${canApprove ? "text-amber-700" : ""}`} />
                              Review in HITL Queue
                              <AppIcons.arrowRight className="w-3 h-3" />
                            </Link>
                          </Button>
                        </>
                      )}
                      <span className="text-[10px] font-mono text-amber-700 flex items-center gap-1 ml-auto">
                        <AppIcons.pending className="w-3 h-3" />
                        Approval ID: {pendingApproval.approvalId}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Active Processing State: Simple inline status row without border/card/divider */
                <div className="w-full max-w-2xl py-1 space-y-2">
                  <Marker variant="default" size="lg" role="status" className="justify-start gap-2">
                    <MarkerIcon>
                      <currentStage.icon
                        className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          currentStage.id === "error" ? "text-destructive" : "text-muted-foreground"
                        )}
                        aria-hidden="true"
                      />
                    </MarkerIcon>
                    <MarkerContent
                      dir="auto"
                      className={cn("text-sm font-medium text-foreground", currentStage.shimmer && "shimmer")}
                    >
                      {currentStage.label}
                    </MarkerContent>
                  </Marker>

                  {(() => {
                    const safeText = getSafeStreamDisplayText(streamedText);
                    if (!safeText) return null;
                    return (
                      <div className="prose prose-slate max-w-none text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap pt-1" dir="auto">
                        {safeText}
                        <span className="inline-block w-1.5 h-3.5 bg-primary/60 ml-1 animate-pulse align-middle" />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Live Progress Rail (when streaming) */}
        {streaming && (
          <div className="px-5 py-2 border-t border-border bg-muted/20">
            <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
              <span className="text-muted-foreground font-semibold">LIVE AGENT PIPELINE:</span>
              <div className="flex items-center gap-2">
                <span className="text-sky-600 font-semibold animate-pulse">Running...</span>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-[10px] text-destructive hover:text-destructive/80 font-mono px-1.5 py-0.5 rounded border border-destructive/20 hover:bg-destructive/10 transition-colors"
                >
                  Stop
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {steps.map((step, idx) => (
                <div
                  key={step.agent}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1.5 border transition-all ${
                    step.status === "completed"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold"
                      : step.status === "running"
                      ? "bg-sky-50 border-sky-300 text-sky-700 font-semibold animate-pulse"
                      : step.status === "approval_pending"
                      ? "bg-amber-50 border-amber-300 text-amber-700 font-semibold animate-pulse"
                      : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  <span className="font-bold">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="truncate">{step.agent}</span>
                  {step.status === "approval_pending" && (
                    <AppIcons.pending className="w-3 h-3 text-amber-600" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Question Composer Form */}
        <div className="p-3.5 px-4 border-t border-border bg-card">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-border bg-background shadow-2xs transition-all focus-within:border-foreground/30 focus-within:ring-1 focus-within:ring-foreground/10 p-2.5 flex flex-col justify-between"
          >
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!submitting && !streaming && query.trim()) {
                    handleSubmit();
                  }
                }
              }}
              dir="auto"
              rows={2}
              disabled={submitting}
              placeholder="Ask a question grounded in the clinical protocol corpus (English or Arabic)..."
              className="w-full bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 resize-none font-sans leading-relaxed min-h-[44px]"
            />
            <div className="flex items-center justify-end pt-1">
              <Button
                type="submit"
                size="icon"
                disabled={!query.trim() || submitting || streaming}
                className="h-7 w-7 rounded-full shrink-0 transition-opacity flex items-center justify-center shadow-xs"
                aria-label={submitting ? "Sending message" : "Send message"}
              >
                {submitting ? (
                  <LuLoaderCircle className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LuArrowUp className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 3. Side Evidence Drawer (RET-003)                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {selectedCitation && (
        <div className="w-80 bg-card border border-border rounded-xl flex flex-col shrink-0 shadow-lg overflow-hidden animate-in slide-in-from-right-5">
          <div className="p-3.5 border-b border-border bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground font-mono">
              VERIFIED SOURCE CITATION
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCitation(null)}
              className="h-6 px-2 text-xs text-slate-500 hover:text-foreground"
            >
              Close
            </Button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs">
            <div className="space-y-1 font-mono text-[11px]">
              <p className="text-muted-foreground">Document:</p>
              <p className="font-semibold text-slate-900">{selectedCitation.documentName}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground pt-1">
              <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                <span>Page:</span> <strong className="text-slate-800">{selectedCitation.page || 1}</strong>
              </div>
              <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                <span>RRF Score:</span> <strong className="text-emerald-600">{selectedCitation.score || "N/A"}</strong>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-mono text-muted-foreground">Verbatim Stored Chunk:</p>
              <div
                className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap"
                dir="auto"
              >
                {selectedCitation.excerpt}
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-sky-50 border border-sky-200 text-[10px] font-mono text-sky-800">
              ✓ Grounded citation verified from persistent storage.
            </div>
          </div>
        </div>
      )}

      {/* Delete Chat Confirmation Dialog */}
      <AlertDialog
        open={!!conversationToDelete}
        onOpenChange={(open) => {
          if (!open && !isDeletingConversation) {
            setConversationToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat history?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat history? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingConversation}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDeleteConversation();
              }}
              disabled={isDeletingConversation}
              className={cn(buttonVariants({ variant: "destructive" }))}
            >
              {isDeletingConversation ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
