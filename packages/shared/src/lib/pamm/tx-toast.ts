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
