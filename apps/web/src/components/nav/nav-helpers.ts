export function getCurrentPage(pathname: string | null): string {
  if (!pathname) return 'home';
  if (pathname === '/' || pathname === '/home') return 'home';
  if (pathname.startsWith('/chat')) return 'chat';
  if (pathname.startsWith('/rewards/fiat')) return 'rewards/fiat';
  // Legacy `/market` (and detail pages under it) still highlight the
  // Predictions nav item, which now points at `/markets`.
  if (pathname.startsWith('/market')) return 'markets';
  const seg = pathname.split('/')[1];
  return seg || 'home';
}

export const hrefFor = (id: string) => `/${id === 'home' ? '' : id}`;
