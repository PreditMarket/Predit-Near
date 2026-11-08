'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type LinkProps = React.ComponentProps<typeof Link>;

/**
 * A nav link that prefetches its page when the pointer or focus reaches it,
 * not when it scrolls into view: every page load used to prefetch every nav
 * destination (plan 21). `prefetch={false}` also turns off Next's own
 * hover prefetch, so it is asked for here, once.
 */
export function HoverPrefetchLink({
  href,
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...rest
}: Omit<LinkProps, 'prefetch' | 'href'> & { href: string }) {
  const router = useRouter();
  const done = useRef(false);
  const warm = () => {
    if (done.current) return;
    done.current = true;
    router.prefetch(href);
  };
  return (
    <Link
      href={href}
      prefetch={false}
      onPointerEnter={(e) => {
        warm();
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
}
