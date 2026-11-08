/**
 * `7xKX…9fQa`. Anything short enough that cutting it would not save space is
 * returned as is; a missing address is an empty string.
 */
export function shortAddr(
  address: string | null | undefined,
  head = 4,
  tail = 4,
): string {
  if (!address) return '';
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
