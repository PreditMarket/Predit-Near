/**
 * Re-mounts on every navigation inside the (app) group, so each page fades
 * in instead of snapping.
 *
 * `flex-1 min-h-0` in `#scroll-root`'s column: exactly the height under the
 * nav, which a page's `h-full` resolves against (as it did as a direct child
 * of `#scroll-root`). A longer page overflows it and `#scroll-root` scrolls as
 * before. It used to be `h-full` — 100% of `#scroll-root` on top of the nav,
 * so every page could scroll by the nav's height.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 min-h-0 animate-page-in">{children}</div>;
}
