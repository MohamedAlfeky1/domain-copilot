"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppIcons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

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
 * If the value is a JSON string or object containing { "synthesis": "..." },
 * extracts and returns only the synthesis text.
 * If parsing fails, returns the original text.
 */
function normalizeDisplayText(raw: unknown): string {
  if (typeof raw !== "string") {
    if (raw && typeof raw === "object" && "synthesis" in (raw as any) && typeof (raw as any).synthesis === "string") {
      return (raw as any).synthesis;
    }
    return raw ? String(raw) : "";
  }

  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("{") && trimmed.includes('"synthesis"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.synthesis === "string") {
        return parsed.synthesis;
      }
    } catch {
      const match = trimmed.match(/"synthesis"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (match) {
        try {
          return JSON.parse(`"${match[1]}"`);
        } catch {}
      }
    }
  }

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

export default function CopilotPage() {
  // Conversations State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Input & Streaming State
  const [query, setQuery] = useState("");
  const [streaming, setStreaming] = useState(false);
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

  const resumeWorkflow = useCallback(async (runId: string, approvalId: string) => {
    if (resumeInProgressRef.current) return;
    resumeInProgressRef.current = true;
    setStreaming(true);
    setIsAwaitingApproval(false);

    // Strip resume=true from URL immediately to prevent duplicate runs on page reload
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("resume");
      window.history.replaceState(null, "", url.pathname + url.search);
    } catch {}

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
              } else if (eventType === "step_start") {
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
                setStreaming(false);
                setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
                const cleanAnswer = data.finalAnswer || data.data?.finalAnswer;
                if (cleanAnswer) {
                  setStreamedText(normalizeDisplayText(cleanAnswer));
                } else {
                  setStreamedText((prev) => normalizeDisplayText(prev));
                }
                if (Array.isArray(data.citations) && data.citations.length > 0) {
                  setStreamCitations(data.citations);
                } else if (Array.isArray(data.data?.citations) && data.data.citations.length > 0) {
                  setStreamCitations(data.data.citations);
                }
                try {
                  localStorage.removeItem("copilot_active_run_id");
                } catch {}
              } else if (eventType === "refusal") {
                setIsRefused(true);
                setRefusalMessage(data.message || "Request was refused.");
                setStreaming(false);
                try {
                  localStorage.removeItem("copilot_active_run_id");
                } catch {}
              } else if (eventType === "error") {
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
        alert(`Resume failed: ${err.message}`);
      }
      setStreaming(false);
    } finally {
      resumeInProgressRef.current = false;
    }
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

        setCurrentRunId(run.id);
        if (run.query) setQuery(run.query);

        if (run.citations && Array.isArray(run.citations)) {
          setStreamCitations(run.citations);
        }

        const answerText = run.finalOutput || run.answer;
        if (answerText) {
          setStreamedText(normalizeDisplayText(answerText));
        }

        if (run.status === "COMPLETED") {
          setStreaming(false);
          setIsAwaitingApproval(false);
          setPendingApproval(null);
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
            await resumeWorkflow(run.id, approval.id);
          } else {
            setIsAwaitingApproval(true);
          }
        } else if (run.status === "RUNNING" || run.status === "STREAMING") {
          setStreaming(true);
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
  }, [resumeWorkflow]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
      setMessages(data.messages || []);
    } catch (err: any) {
      setChatError(err.message || "Failed to load chat messages.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Select Active Conversation
  const selectConversation = useCallback((conv: Conversation) => {
    setActiveConversation(conv);
    // Reset transient stream states
    setStreamedText("");
    setStreamCitations([]);
    setIsRefused(false);
    setRefusalMessage("");
    setPendingApproval(null);
    setIsAwaitingApproval(false);
    setTwistEvaluation(null);
    setSelectedCitation(null);

    // Update URL query param without reload
    const url = new URL(window.location.href);
    url.searchParams.set("conversationId", conv.id);
    window.history.pushState({}, "", url.toString());

    loadMessages(conv.id);
  }, [loadMessages]);

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

      setConversations((prev) => [newConv, ...prev]);
      setActiveConversation(newConv);
      setMessages([]);
      setStreamedText("");
      setStreamCitations([]);
      setIsRefused(false);
      setPendingApproval(null);
      setIsAwaitingApproval(false);
      setSelectedCitation(null);

      const url = new URL(window.location.href);
      url.searchParams.set("conversationId", newConv.id);
      window.history.pushState({}, "", url.toString());
    } catch (err: any) {
      alert(`Error creating chat: ${err.message}`);
    }
  }, []);

  // Delete Conversation
  const handleDeleteConversation = useCallback(async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this chat history?")) return;

    try {
      const res = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete chat");

      setConversations((prev) => prev.filter((c) => c.id !== convId));

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
      alert(`Delete failed: ${err.message}`);
    }
  }, [activeConversation, conversations, selectConversation]);

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
        const urlConvId = params.get("conversationId");

        if (urlConvId) {
          const match = convList.find((c) => c.id === urlConvId);
          if (match) {
            selectConversation(match);
          } else {
            // Try fetching specific conversation directly (in case it's newly created or not in owner list)
            const singleRes = await fetch(`/api/conversations/${urlConvId}`);
            if (singleRes.ok) {
              const singleData = await singleRes.json();
              setActiveConversation(singleData.conversation);
              loadMessages(urlConvId);
            } else if (convList.length > 0) {
              selectConversation(convList[0]);
            }
          }
        } else if (convList.length > 0) {
          selectConversation(convList[0]);
        }
      } catch (err: any) {
        setChatError(err.message || "Failed to load chat history.");
      } finally {
        setLoadingConversations(false);
      }
    }

    init();
  }, [loadMessages, selectConversation]);

  // Submit Query in Active Conversation
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || streaming) return;

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
        alert(`Error initiating chat: ${err.message}`);
        return;
      }
    }

    if (!targetConv) return;

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
        window.history.replaceState(null, "", `/copilot?runId=${encodeURIComponent(runId)}`);
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

      sse.addEventListener("step_start", (evt: any) => {
        const data = JSON.parse(evt.data);
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

      sse.addEventListener("refusal", (evt: any) => {
        const data = JSON.parse(evt.data);
        setIsRefused(true);
        setRefusalMessage(data.message);
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
      });

      // TW-005: Handle twist_evaluation event
      sse.addEventListener("twist_evaluation", (evt: any) => {
        const data = JSON.parse(evt.data);
        if (data.data) {
          setTwistEvaluation(data.data);
        }
      });

      // HITL-006: Handle approval_required event
      sse.addEventListener("approval_required", (evt: any) => {
        const data = JSON.parse(evt.data);
        const approvalData = data.data || data;
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
        setStreaming(false);
        setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
        if (evt?.data) {
          try {
            const data = JSON.parse(evt.data);
            const cleanAnswer = data.finalAnswer || data.data?.finalAnswer;
            if (cleanAnswer) {
              setStreamedText(normalizeDisplayText(cleanAnswer));
            } else {
              setStreamedText((prev) => normalizeDisplayText(prev));
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
      alert(`Query failed: ${err.message}`);
      setStreaming(false);
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
            <AppIcons.copilot className="w-4 h-4 text-sky-600" />
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
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
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
            <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center shrink-0">
              <AppIcons.copilot className="w-3.5 h-3.5" />
            </div>
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

          {loadingMessages ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
              Loading chat messages...
            </div>
          ) : messages.length === 0 && streamedText.length === 0 && !isRefused && !isAwaitingApproval && !accessDeniedMessage ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 select-none">
              <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 border border-sky-200 flex items-center justify-center mb-3 shadow-xs">
                <AppIcons.copilot className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 tracking-tight">
                Ask a clinical protocol question
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed">
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

              // Assistant message
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[90%] bg-card border border-slate-200 rounded-2xl rounded-tl-xs p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-800">
                        <AppIcons.copilot className="w-3.5 h-3.5 text-sky-600" />
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
                      {msg.content}
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

          {/* Active Live Stream Card */}
          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[90%] bg-card border border-sky-300 rounded-2xl rounded-tl-xs p-4 shadow-xs space-y-3 ring-2 ring-sky-100">
                <div className="flex items-center justify-between border-b border-sky-100 pb-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-800 animate-pulse">
                    <AppIcons.activity className="w-3.5 h-3.5 text-sky-600" />
                    <span>Generating Grounded Protocol Synthesis...</span>
                  </div>
                </div>

                <div className="prose prose-slate max-w-none text-xs text-slate-800 leading-relaxed whitespace-pre-wrap" dir="auto">
                  {streamedText || (
                    <span className="text-muted-foreground italic">Consulting domain specialists and evidence...</span>
                  )}
                  <span className="inline-block w-1.5 h-3.5 bg-sky-600 ml-1 animate-pulse align-middle" />
                </div>

                {streamCitations.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-mono text-muted-foreground mb-1.5 font-semibold">
                      INCOMING CITATIONS ({streamCitations.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {streamCitations.map((c, i) => (
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
          )}

          {/* Low Evidence Refusal Banner */}
          {isRefused && (
            <Card className="border-rose-200 bg-rose-50/50 p-4 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-rose-800 text-xs">
                <AppIcons.warning className="w-4 h-4 text-rose-600" />
                <span>Low-Evidence Refusal Triggered</span>
              </div>
              <p className="text-xs text-rose-700 mt-1 leading-normal">{refusalMessage}</p>
            </Card>
          )}

          {/* HITL Approval Banner */}
          {isAwaitingApproval && pendingApproval && (
            <Card className="border-amber-200 bg-amber-50/60 p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2 font-semibold text-amber-900 text-xs">
                <AppIcons.warning className="w-4 h-4 text-amber-600" />
                <span>
                  {pendingApproval.status === "APPROVED" || pendingApproval.status === "EDIT_APPROVED"
                    ? "Workflow Approved: Ready to Resume"
                    : "Workflow Paused: Human Approval Required"}
                </span>
              </div>
              <p className="text-xs text-amber-800 leading-normal">{pendingApproval.proposedAction}</p>

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
                        resumeWorkflow(currentRunId, pendingApproval.approvalId);
                      }
                    }}
                  >
                    <AppIcons.success className="w-3.5 h-3.5" />
                    Resume Workflow Now
                    <AppIcons.arrowRight className="w-3 h-3" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-500 text-white gap-1.5 text-xs shadow-xs"
                    asChild
                  >
                    <Link href="/reviews">
                      <AppIcons.warning className="w-3.5 h-3.5" />
                      Review in HITL Queue
                      <AppIcons.arrowRight className="w-3 h-3" />
                    </Link>
                  </Button>
                )}
                <span className="text-[10px] font-mono text-amber-700 flex items-center gap-1">
                  <AppIcons.pending className="w-3 h-3" />
                  Approval ID: {pendingApproval.approvalId}
                </span>
              </div>
            </Card>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Live Progress Rail (when streaming) */}
        {streaming && (
          <div className="px-5 py-2 border-t border-border bg-slate-50">
            <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
              <span className="text-muted-foreground font-semibold">LIVE AGENT PIPELINE:</span>
              <span className="text-sky-600 font-semibold animate-pulse">Running...</span>
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
        <form onSubmit={handleSubmit} className="p-3.5 px-4 border-t border-border bg-card">
          <div className="flex gap-2">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              dir="auto"
              rows={2}
              placeholder="Ask a question grounded in the clinical protocol corpus (English or Arabic)..."
              className="flex-1 bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-none font-sans"
            />
            {streaming ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancel}
                className="gap-1.5 text-xs font-semibold shrink-0 h-auto"
              >
                <AppIcons.stop className="w-3.5 h-3.5 fill-current" />
                Cancel
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!query.trim()}
                className="gap-1.5 text-xs font-semibold shrink-0 h-auto px-4 shadow-xs"
              >
                <AppIcons.send className="w-3.5 h-3.5" />
                Send
              </Button>
            )}
          </div>
        </form>
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
    </div>
  );
}
