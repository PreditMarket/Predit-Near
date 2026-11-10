import Link from 'next/link';

export default function NotFound() {
  return (
    <main data-testid="not-found" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-mono text-[12px] font-bold uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="text-[18px] font-bold text-foreground">This page does not exist</h1>
      <p className="text-[13px] text-muted-foreground">Markets are made from posts in the feed.</p>
      <div className="flex gap-3 text-[13px]">
        <Link href="/" className="text-primary hover:underline">
          Go to the feed
        </Link>
        <Link href="/markets" className="text-primary hover:underline">
          Browse markets
        </Link>
      </div>
    </main>
  );
}
