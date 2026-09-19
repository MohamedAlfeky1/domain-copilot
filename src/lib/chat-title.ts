/**
 * DOMAIN COPILOT - DETERMINISTIC CHAT TITLE GENERATOR
 * Generates clean, concise conversation titles from the first user message
 * without additional LLM latency or token cost.
 */

export function generateDeterministicTitle(message: string, maxLength: number = 45): string {
  if (!message) return "New Chat";

  // Strip Markdown headings, bullets, code delimiters, and extra whitespace
  const cleaned = message
    .replace(/^[#\s\-*]+/, "")
    .replace(/[`*_~[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "New Chat";

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  // Truncate at word boundary if reasonable
  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > 20) {
    return `${truncated.slice(0, lastSpace)}...`;
  }

  return `${truncated.trim()}...`;
}
