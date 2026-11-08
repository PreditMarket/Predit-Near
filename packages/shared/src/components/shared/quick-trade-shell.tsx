'use client';

import { X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-is-mobile';

interface QuickTradeShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question?: string | null;
  yesPercent?: number | null;
  badge?: React.ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  children?: React.ReactNode;
}

function ShellInner({
  question,
  badge,
  isLoading,
  isError,
  errorMessage,
  children,
  CloseButton,
}: Omit<QuickTradeShellProps, 'open' | 'onOpenChange' | 'yesPercent'> & {
  CloseButton: React.ReactNode;
}) {
  if (!question) return null;

  return (
    <>
      {/* ── Header ── */}
      <div className="relative px-[14px] pt-[14px] pb-[12px] border-b border-white/[0.06] shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          {badge ?? <span />}
          {CloseButton}
        </div>

        <p className="text-[13.5px] font-semibold leading-snug text-foreground line-clamp-2">
          {question}
        </p>
      </div>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="space-y-3 p-5">
          <div className="flex justify-end">
            <Skeleton className="h-7 w-28 rounded-[7px]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-24 rounded-[10px]" />
            <Skeleton className="h-24 rounded-[10px]" />
          </div>
          <Skeleton className="h-12 rounded-[9px]" />
          <Skeleton className="h-9 w-full rounded-[10px]" />
        </div>
      ) : isError ? (
        <div className="p-5">
          <div className="rounded-[10px] border border-danger/20 bg-danger/5 px-4 py-6 text-center font-mono text-[12px] text-danger">
            {errorMessage ?? 'Failed to load. Please try again.'}
          </div>
        </div>
      ) : (
        <div className="overflow-y-auto flex-1">{children}</div>
      )}
    </>
  );
}

const closeButtonClass =
  'cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

export function QuickTradeShell({
  open,
  onOpenChange,
  question,
  badge,
  isLoading,
  isError,
  errorMessage,
  children,
}: QuickTradeShellProps) {
  const isMobile = useIsMobile(640);

  const innerProps = { question, badge, isLoading, isError, errorMessage, children };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
        <DrawerContent className="max-h-[90dvh] flex flex-col border-white/[0.06] bg-card" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <DrawerTitle className="sr-only">{question ?? 'Trade'}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Quick trade on this prediction market
          </DrawerDescription>
          <ShellInner
            {...innerProps}
            CloseButton={
              <DrawerClose className={closeButtonClass}>
                <X className="h-3.5 w-3.5" />
              </DrawerClose>
            }
          />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] gap-0 border-white/[0.06] bg-card p-0 overflow-hidden [&>button]:hidden max-h-[90dvh] flex flex-col">
        <DialogTitle className="sr-only">{question ?? 'Trade'}</DialogTitle>
        <DialogDescription className="sr-only">
          Quick trade on this prediction market
        </DialogDescription>
        <ShellInner
          {...innerProps}
          CloseButton={
            <DialogClose className={closeButtonClass}>
              <X className="h-3.5 w-3.5" />
            </DialogClose>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
