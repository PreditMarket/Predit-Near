'use client';

import { Share, SquarePlus } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

/**
 * iOS has no install prompt: the app goes on the Home Screen by hand, from
 * the Share sheet. That is also the only way to get web push on iOS (16.4+),
 * so the notification settings reuse this.
 */
export function IosInstallSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent
        data-testid="ios-install-sheet"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <DrawerHeader className="text-left">
          <DrawerTitle>Add Predit to your Home Screen</DrawerTitle>
          <DrawerDescription>
            Opens full screen like an app, and can send you notifications.
          </DrawerDescription>
        </DrawerHeader>
        <ol className="flex flex-col gap-2 px-4">
          <Step n={1} icon={<Share className="size-4" />}>
            Tap <b className="font-semibold">Share</b> in the browser toolbar
          </Step>
          <Step n={2} icon={<SquarePlus className="size-4" />}>
            Choose <b className="font-semibold">Add to Home Screen</b>, then{' '}
            <b className="font-semibold">Add</b>
          </Step>
        </ol>
      </DrawerContent>
    </Drawer>
  );
}

function Step({
  n,
  icon,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm">
      <span className="font-mono text-xs text-muted-foreground">{n}</span>
      <span className="flex-1">{children}</span>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
        {icon}
      </span>
    </li>
  );
}
