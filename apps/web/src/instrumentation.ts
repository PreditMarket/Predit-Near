export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startResolveAgent } = await import('@/lib/resolve/agent');
    startResolveAgent();
  }
}
