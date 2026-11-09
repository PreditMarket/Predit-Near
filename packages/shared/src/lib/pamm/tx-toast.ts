/**
 * Sonner toast wrapper that adds a "View on Solscan" action button for
 * successful transactions. Keeps every pm-AMM mutation consistent.
 */

import { toast } from "sonner";

import { nearExplorerTxUrl } from "@/lib/near/config";

export function toastTxSuccess(
  title: string,
  signature: string,
  description?: string,
) {
  toast.success(title, {
    description:
      description ?? `Tx: ${signature.slice(0, 8)}…${signature.slice(-8)}`,
    action: {
      label: "Explorer",
      onClick: () =>
        window.open(nearExplorerTxUrl(signature), "_blank", "noopener,noreferrer"),
    },
    duration: 8_000,
  });
}

export function toastTxError(title: string, error: unknown) {
  const msg = formatTxError(error);
  toast.error(title, { description: msg, duration: 10_000 });
  // Mirror to console so the full object + logs are inspectable.
  console.error(`[pamm] ${title}:`, error);
}

/**
 * Extract a readable message from any of the shapes throw-paths produce:
 * native Error, Anchor `AnchorError`, web3.js `SendTransactionError`,
 * raw `{ error: { errorMessage } }`, or plain object. Avoids the
 * `[object Object]` sink-hole that `String(err)` gives on plain objects.
 */
export function formatTxError(error: unknown): string {
  if (error == null) return "Unknown error";
  if (typeof error === "string") return error;

  type AnyErr = {
    message?: string;
    error?: { errorMessage?: string; errorCode?: { code?: string } };
    transactionMessage?: string;
    transactionLogs?: string[];
    logs?: string[];
    name?: string;
    toString?: () => string;
  };
  const e = error as AnyErr;

  // AnchorError: { error: { errorCode: { code }, errorMessage } }
  const anchorMsg = e.error?.errorMessage;
  const anchorCode = e.error?.errorCode?.code;
  if (anchorMsg) return anchorCode ? `${anchorCode}: ${anchorMsg}` : anchorMsg;

  // SendTransactionError specific properties (prioritize over buggy 'Unknown action' message)
  if (e.transactionMessage) {
    // Return transactionMessage if it has useful content
    return e.transactionMessage;
  }

  // Fall back to logs if present and we have a buggy message
  const logs = e.transactionLogs || e.logs;
  if (
    e.message?.includes("Unknown action") &&
    Array.isArray(logs) &&
    logs.length > 0
  ) {
    const errorLog = logs.find((l) => l.toLowerCase().includes("error"));
    return errorLog || logs.slice(-3).join(" | ");
  }

  // Standard Error / SendTransactionError (if message is okay)
  if (e.message) return e.message;

  // SendTransactionError without `.message` — fall back to logs tail
  if (Array.isArray(logs) && logs.length > 0) {
    return logs.slice(-3).join(" | ");
  }

  // Own toString that isn't `[object Object]`
  if (typeof e.toString === "function") {
    const s = e.toString();
    if (s && s !== "[object Object]") return s;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
