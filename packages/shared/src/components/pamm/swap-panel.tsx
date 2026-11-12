'use client';

import { X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { PammShareButton } from './share-button';
import { useWalletGate } from '@/hooks/use-wallet-gate';
import { useGlobalPause } from '@/hooks/pamm/use-global-pause';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBuyOutcome } from '@/hooks/pamm/use-buy-outcome';
import { useSellOutcome } from '@/hooks/pamm/use-sell-outcome';
import { useV3Position } from '@/hooks/pamm/use-v3-position';
import type { PoolStateResult } from '@/hooks/pamm/use-pool-state';
import type { NearSide as SwapSide } from '@/lib/near/types';
import { USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';

import { useV3Quote } from '@/hooks/pamm/use-v3-quote';
import { getSecondsUntilFreeze, isTradeFrozen } from '@/lib/pamm/v3-rules';

import { ModeTabs } from './trade-card/mode-tabs';
import { SidePills } from './trade-card/side-pills';
import { PayWithRow } from './trade-card/pay-with-row';
import { AmountInput } from './trade-card/amount-input';
import { QuickChips, type QuickChip } from './trade-card/quick-chips';
import { HeldIndicator } from './trade-card/held-indicator';
import { ResultPanel } from './trade-card/result-panel';
import { AdvanceToggle } from './trade-card/advance-toggle';
import { AdvancePanel } from './trade-card/advance-panel';
import {
    SettingsPopover,
    type TradeDetail,
} from './trade-card/settings-popover';
import { WarningBanner } from './trade-card/warning-banner';
import { pickTopWarning } from './trade-card/pick-top-warning';
import { buildWarnings } from './trade-card/build-warnings';
import { deriveAdvanceData } from './trade-card/derive-advance-data';
import { deriveResultTexts } from './trade-card/derive-result-panel';
import { useBuyPreview, useSellPreview } from './trade-card/use-trade-preview';
import {
    pct2,
    fmtTokenAmount,
    rawToUnits,
    usd2, usdSmart
} from './trade-card/formatters';

const IMPACT_WARN = 0.05;
const IMPACT_DANGER = 0.15;

type TradeMode = 'buy' | 'sell';
const SCALE = 10 ** USDC_DECIMALS;
const collateralSymbol = USDC_SYMBOL;

interface SwapPanelProps {
  poolState: PoolStateResult;
  poolAddress: string;
  question?: string;
  initialMode?: TradeMode;
  initialSide?: SwapSide;
  /** After the trade landed, with its transaction. */
  onSuccess?: (txSig?: string) => void;
  standalone?: boolean;
  yesLabel?: string;
  noLabel?: string;
  /** Market pays everyone back: there is nothing left to trade. */
  cancelled?: boolean;
  /** Past expiry, waiting for its result: both sides are halted. */
  resolving?: boolean;
  /** Dollars to fill in for a buy. */
  presetAmountUsd?: number;
}

export function SwapPanel({
  poolState,
  poolAddress,
  question,
  initialMode = 'buy',
  initialSide = 'yes',
  onSuccess,
  standalone = true,
  yesLabel,
  noLabel,
  cancelled = false,
  resolving = false,
  presetAmountUsd,
}: SwapPanelProps) {
  const gate = useWalletGate();
  const isPaused = useGlobalPause();
  const [mode, setMode] = useState<TradeMode>(cancelled ? 'sell' : initialMode);
  const [side, setSide] = useState<SwapSide>(initialSide);
  const [amountStr, setAmountStr] = useState(
    initialMode === 'buy' && presetAmountUsd ? String(presetAmountUsd) : '',
  );
  const [slippageBps, setSlippageBps] = useState(200); // 2% default (matches mockup)
  // Default open — the advance insights (break-even meter, min-received,
  // fees) are useful context on every trade, so we surface them by default
  // and let the user collapse if they want a tighter card.
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState<{ side: string } | null>(
    null,
  );
  const amountInputRef = useRef<HTMLInputElement>(null);

  const sideLabel = (
    side === 'yes' ? (yesLabel ?? 'YES') : (noLabel ?? 'NO')
  ).toUpperCase();
  const oppositeSideLabel = (
    side === 'yes' ? (noLabel ?? 'NO') : (yesLabel ?? 'YES')
  ).toUpperCase();

  const parseRaw = (v: string): bigint => {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return BigInt(0);
    return BigInt(Math.floor(n * SCALE));
  };
  const fmtTokens = (raw: bigint, digits = 4): string => {
    const n = Number(raw) / SCALE;
    const effectiveDigits = n > 0 && n < 1 ? Math.max(digits, 6) : digits;
    return n.toLocaleString('en-US', {
      maximumFractionDigits: effectiveDigits,
    });
  };

  // ── Position / quote hooks ────────────────────────────────────────────────
  const { data: position } = useV3Position(poolAddress);
  const buyMut = useBuyOutcome(poolAddress);
  const sellMut = useSellOutcome(poolAddress);

  const v3 = poolState.v3;
  const amountRaw = parseRaw(amountStr);

  const { quote: v3Quote, isQuoting: v3Quoting } = useV3Quote(
    v3,
    poolState.creatorShareBps,
    mode,
    side,
    amountRaw,
    slippageBps,
    position
      ? {
          yesShares: position.yes,
          noShares: position.no,
          yesCostAcc: position.yesCostAcc,
          noCostAcc: position.noCostAcc,
        }
      : null,
  );

  // ── Balance / insufficient derivations ───────────────────────────────────
  const usdcBalance = position?.collateral ?? BigInt(0);
  const sideBalance =
    side === 'yes' ? (position?.yes ?? BigInt(0)) : (position?.no ?? BigInt(0));
  const inputBalance = mode === 'buy' ? usdcBalance : sideBalance;
  // The fee comes out of the amount, never on top of it.
  const insufficient = amountRaw > BigInt(0) && amountRaw > inputBalance;
  const isPending = buyMut.isPending || sellMut.isPending;
  const noBalance = inputBalance === BigInt(0);

  // ── Trading guards ───────────────────────────────────────────────────────
  const frozen = isTradeFrozen(poolState.expiryTs, v3.tradeFreezeSeconds);
  const secondsUntilFreeze = getSecondsUntilFreeze(poolState.expiryTs, v3.tradeFreezeSeconds);
  const freezeSoon = !frozen && secondsUntilFreeze > 0 && secondsUntilFreeze <= 3_600;
  const v3NoQuoteYet = amountRaw > BigInt(0) && v3Quoting;
  const v3Unquotable = amountRaw > BigInt(0) && !v3Quoting && v3Quote == null;

  const impact = v3Quote?.priceImpact ?? 0;
  const impactDanger = impact >= IMPACT_DANGER;
  const impactWarn = impact >= IMPACT_WARN;
  const isExpired = !cancelled && Date.now() / 1000 >= poolState.expiryTs;

  // ── Prices / percents ───────────────────────────────────────────────────
  // 2-decimal percent — whole cents hid every move of a pool near 50/50.
  const yesPercent = Math.round(poolState.priceYes * 10_000) / 100;
  const noPercent = 100 - yesPercent;
  const activePercent = side === 'yes' ? yesPercent : noPercent;
  const activePrice = activePercent / 100;

  const heldSideUnits = rawToUnits(sideBalance, USDC_DECIMALS);
  // `costAcc` and `shares` share decimals, so their ratio is a 0..1 price.
  const avgCost = useMemo(() => {
    if (!position) return 0;
    const shares = side === 'yes' ? position.yes : position.no;
    const costAcc = side === 'yes' ? position.yesCostAcc : position.noCostAcc;
    if (shares <= BigInt(0)) return 0;
    return Number(costAcc) / Number(shares);
  }, [position, side]);

  // ── Buy / Sell previews (derived numbers for result / advance / CTA) ─────
  const redeemFeeBps = v3.redeemFeeBps;
  const buyPreview = useBuyPreview({
    amountRaw: mode === 'buy' ? amountRaw : BigInt(0),
    scale: SCALE,
    v3Quote,
    redeemFeeBps,
    buySide: side,
    v3Payout: v3,
  });
  const sellPreview = useSellPreview({
    amountRaw: mode === 'sell' ? amountRaw : BigInt(0),
    scale: SCALE,
    v3Quote,
    avgCost,
  });

  // ── Amount helpers ───────────────────────────────────────────────────────
  const setAlloc = (pct: number) => {
    let rawAlloc: bigint;
    if (mode === 'buy') {
      const feeBps = BigInt(v3.tradeFeeBps);
      rawAlloc =
        (inputBalance * BigInt(pct) * BigInt(10_000)) /
        (BigInt(100) * (BigInt(10_000) + feeBps));
    } else {
      rawAlloc = (inputBalance * BigInt(pct)) / BigInt(100);
    }
    const amount = Number(rawAlloc) / SCALE;
    setAmountStr(amount > 0 ? amount.toFixed(6) : '');
  };
  const setBuyAmount = (dollars: number) => {
    setAmountStr(dollars.toString());
  };
  const focusAmount = () => amountInputRef.current?.focus();

  // ── CTA & submit ─────────────────────────────────────────────────────────
  const ctaLabel = (() => {
    if (isPaused) return 'Trading paused';
    if (resolving) return 'Trading closed — resolving';
    if (cancelled) return 'Market cancelled — claim your refund';
    if (frozen) return 'Trading closed before settlement';
    if (insufficient)
      return `Insufficient ${mode === 'buy' ? collateralSymbol : sideLabel}`;
    if (v3NoQuoteYet) return 'Getting price…';
    if (v3Unquotable)
      return mode === 'sell' ? 'Amount too large' : "Can't price this amount";
    if (mode === 'buy') {
      const amtDisplay = amountStr ? `$${fmtTokens(amountRaw, 2)}` : '';
      return `Buy ${sideLabel}${amtDisplay ? ` · ${amtDisplay}` : ` · ${pct2(activePrice)}`}`;
    }
    // Sell CTA — shows shares to close + payout when we have a preview.
    if (sellPreview) {
      const sharesText = fmtTokenAmount(sellPreview.sharesIn);
      return `Sell ${sharesText} ${sideLabel} · ${usdSmart(sellPreview.netUsd)}`;
    }
    return `Sell ${sideLabel} · ${pct2(activePrice)}`;
  })();

  const isDisabled =
    isPaused ||
    resolving ||
    (gate.walletReady
      ? isExpired ||
        amountRaw === BigInt(0) ||
        insufficient ||
        noBalance ||
        (mode === 'sell' && sideBalance === BigInt(0)) ||
        isPending ||
        frozen ||
        v3NoQuoteYet ||
        v3Unquotable ||
        cancelled
      : gate.connecting);

  const handleSubmit = async () => {
    if (amountRaw === BigInt(0)) return;
    let txSig: string | undefined;
    if (mode === 'buy') {
      txSig = await buyMut.mutateAsync({
        buySide: side,
        usdcAmountIn: amountRaw,
        minOutTotal: v3Quote?.kind === 'buy' ? v3Quote.minOut : BigInt(0),
      });
    } else {
      txSig = await sellMut.mutateAsync({
        sellSide: side,
        sellAmountIn: amountRaw,
        minUsdcOut: v3Quote?.kind === 'sell' ? v3Quote.minOut : BigInt(0),
      });
    }
    setAmountStr('');
    if (question) setTradeSuccess({ side: sideLabel });
    onSuccess?.(txSig);
  };

  // ── Derived UI-text (pure) ───────────────────────────────────────────────
  const amtNum = Number(amountRaw) / SCALE;
  const resultTexts = deriveResultTexts({
    mode,
    buyPreview,
    sellPreview,
    sideLabel,
    oppositeSideLabel,
    collateralSymbol,
    avgCost,
    amountUsd: amtNum,
  });

  // ── Quick chips ──────────────────────────────────────────────────────────
  const quickChips: QuickChip[] = useMemo(() => {
    if (mode === 'buy') {
      return [25, 100, 250]
        .map<QuickChip>((v) => ({
          label: `$${v}`,
          active: amountStr === v.toString(),
          onClick: () => {
            setBuyAmount(v);
            focusAmount();
          },
        }))
        .concat({
          label: 'Max',
          active: false,
          disabled: inputBalance === BigInt(0),
          onClick: () => {
            setAlloc(100);
            focusAmount();
          },
        });
    }
    return [25, 50, 75, 100].map<QuickChip>((pct) => ({
      label: `${pct}%`,
      active: false,
      disabled: sideBalance === BigInt(0),
      onClick: () => {
        setAlloc(pct);
        focusAmount();
      },
    }));
  }, [mode, amountStr, inputBalance, sideBalance]);

  // ── Advance panel data (pure derivation from buy/sell previews) ──────────
  const advanceData = useMemo(
    () =>
      deriveAdvanceData({
        mode,
        buyPreview,
        sellPreview,
        sideLabel,
        oppositeSideLabel,
        amountUsd: amtNum,
        avgCost,
        activePrice,
        redeemFeeBps,
      }),
    [
      mode,
      buyPreview,
      sellPreview,
      sideLabel,
      oppositeSideLabel,
      amtNum,
      avgCost,
      activePrice,
      redeemFeeBps,
    ],
  );

  // ── Settings popover trade details ───────────────────────────────────────
  const tradeDetails: TradeDetail[] = useMemo(() => {
    const items: TradeDetail[] = [];
    const feeUsd = mode === 'buy' ? buyPreview?.feeUsd : sellPreview?.feeUsd;
    if (typeof feeUsd === 'number')
      items.push({ label: 'Trade fee', value: usd2(feeUsd) });
    items.push({ label: 'Redeem fee (on win)', value: '2%' });
    items.push({
      label: 'Creator share',
      value: `${(poolState.creatorShareBps / 100).toFixed(0)}%`,
    });
    if (mode === 'buy' && buyPreview) {
      items.push({
        label: 'Min received',
        value: `${fmtTokenAmount(buyPreview.minShares)} ${sideLabel}`,
      });
    } else if (mode === 'sell' && sellPreview) {
      items.push({
        label: 'Min received',
        value: `${usd2(sellPreview.minReceive)} USDC`,
      });
    }
    const impactPct =
      mode === 'buy' ? buyPreview?.impactPct : sellPreview?.impactPct;
    if (typeof impactPct === 'number') {
      items.push({ label: 'Price impact', value: `${impactPct.toFixed(2)}%` });
    }
    return items;
  }, [
    mode,
    buyPreview,
    sellPreview,
    sideLabel,
    poolState.creatorShareBps,
  ]);

  // ── Held-indicator for Sell ──────────────────────────────────────────────
  const heldIndicator = mode === 'sell' && (
    <HeldIndicator
      side={side}
      sideLabel={sideLabel}
      oppositeSideLabel={oppositeSideLabel}
      heldShares={heldSideUnits}
      closingShares={rawToUnits(amountRaw, USDC_DECIMALS)}
      avgCost={avgCost}
      onSwitchToBuyOpposite={() => {
        setMode('buy');
        setSide(side === 'yes' ? 'no' : 'yes');
        setAmountStr('');
      }}
    />
  );

  // ── Warnings ─────────────────────────────────────────────────────────────
  // One banner at a time, highest severity wins, rendered directly above the CTA.
  const topWarning = pickTopWarning(
    buildWarnings({
      mode,
      isPaused,
      cancelled,
      resolving,
      frozen,
      freezeSoon,
      secondsUntilFreeze,
      tradeFreezeSeconds: v3.tradeFreezeSeconds,
      isExpired,
      unquotable: v3Unquotable,
      insufficient,
      impactWarn,
      impactDanger,
      impact,
      hasQuote: !!v3Quote,
      sideLabel,
      collateralSymbol,
    }),
  );

  // ── Content ──────────────────────────────────────────────────────────────
  const showResult = amountRaw > BigInt(0);

  const content = (
    <div className="trade-card flex flex-col gap-[12px] bg-card p-[14px]">
      <ModeTabs
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          setAmountStr('');
          setTradeSuccess(null);
        }}
        buyDisabled={cancelled}
      />

      <SidePills
        side={side}
        onSideChange={(s) => {
          setSide(s);
          focusAmount();
        }}
        yesPrice={yesPercent / 100}
        noPrice={noPercent / 100}
        yesLabel={yesLabel ?? 'Yes'}
        noLabel={noLabel ?? 'No'}
      />

      {mode === 'buy' && (
        <PayWithRow
          symbol={collateralSymbol}
          rawBalance={position?.collateral}
          decimals={USDC_DECIMALS}
        />
      )}

      <AmountInput
        ref={amountInputRef}
        value={amountStr}
        onChange={setAmountStr}
        onSubmit={
          isDisabled
            ? undefined
            : () => void handleSubmit()
        }
        disabled={isPending}
        unit={mode === 'buy' ? collateralSymbol : 'shares'}
        unitTone={mode}
      />

      {mode === 'sell' && sideBalance > BigInt(0) && (
        <button
          type="button"
          onClick={() => setAmountStr(fmtTokens(sideBalance, 6))}
          disabled={isPending}
          className="cursor-pointer text-left font-mono text-[10px] text-faint transition-colors hover:text-foreground disabled:opacity-50"
        >
          Available: <span className="font-bold text-foreground">{fmtTokens(sideBalance, 2)}</span> {sideLabel} · tap to use max
        </button>
      )}

      {heldIndicator}

      <QuickChips chips={quickChips} />

      {showResult && (
        <div
          className={
            v3NoQuoteYet
              ? 'opacity-50 transition-opacity'
              : 'transition-opacity'
          }
        >
          <ResultPanel
            paymentText={resultTexts.paymentText}
            payoutText={resultTexts.payoutText}
            metricLabel={resultTexts.metricLabel}
            metricValue={resultTexts.metricValue}
            metricRoi={resultTexts.metricRoi}
            metricHint={resultTexts.metricHint}
            negative={resultTexts.negative}
          />
        </div>
      )}

      {/* Advance + Settings row — px-[2px] matches mockup `.adv-row`. */}
      <div className="flex items-center justify-between px-[2px]">
        <AdvanceToggle
          open={advanceOpen}
          onToggle={() => setAdvanceOpen((o) => !o)}
        />
        <SettingsPopover
          slippageBps={slippageBps}
          onSlippageChange={setSlippageBps}
          details={tradeDetails}
        />
      </div>

      {advanceOpen && (
        <AdvancePanel
          stats={advanceData.stats}
          meterLabel={advanceData.meterLabel}
          meterValue={advanceData.meterValue}
          markerPct={advanceData.markerPct}
          markerLabel={advanceData.markerLabel}
          impactText={advanceData.impactText}
          rows={advanceData.rows}
        />
      )}

      {tradeSuccess && question && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-success/20 bg-success/8 px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 font-mono text-[10px] font-bold text-success">
              Trade confirmed!
            </span>
            <span className="truncate font-mono text-[9.5px] text-muted-foreground">
              Share your position?
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PammShareButton
              url={`/market/${poolAddress}`}
              question={question}
              side={tradeSuccess.side}
              size="sm"
              variant="icon-text"
            />
            <button
              type="button"
              onClick={() => setTradeSuccess(null)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Single top-priority warning banner, immediately above the CTA. */}
      {topWarning && (
        <WarningBanner
          key={topWarning.key}
          severity={topWarning.severity}
          action={topWarning.action}
        >
          {topWarning.content}
        </WarningBanner>
      )}

      {/* CTA */}
      <div>
        {(() => {
          const cta = (
            <button
              data-testid="submit-trade-btn"
              disabled={isDisabled}
              onClick={gate.handleAction(() => void handleSubmit())}
              className={`w-full cursor-pointer rounded-[12px] p-[14px] font-mono text-[14px] font-extrabold uppercase tracking-[0.05em] transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-card disabled:text-faint disabled:opacity-100 ${
                mode === 'buy'
                  ? 'bg-success text-background hover:bg-success/90'
                  : 'bg-danger text-background hover:bg-danger/90'
              }`}
            >
              {gate.getCtaLabel(ctaLabel, isPending)}
            </button>
          );
          if (!isPaused) return cta;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block">{cta}</span>
              </TooltipTrigger>
              <TooltipContent>Trading paused</TooltipContent>
            </Tooltip>
          );
        })()}
      </div>
    </div>
  );

  if (!standalone) return <>{content}</>;
  return (
    <div className="mx-auto w-full max-w-[440px] overflow-hidden rounded-[14px] border border-white/[0.06] bg-card">
      {content}
    </div>
  );
}
