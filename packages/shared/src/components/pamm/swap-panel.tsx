'use client';

import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { PammShareButton } from './share-button';
import { useRouter } from 'next/navigation';
import { useWalletGate } from '@/hooks/use-wallet-gate';
import { useGlobalPause } from '@/hooks/pamm/use-global-pause';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBuyQuote } from '@/hooks/pamm/use-buy-quote';
import { useBuyOutcome } from '@/hooks/pamm/use-buy-outcome';
import { useAutoSubmit, type AutoSubmit } from '@/hooks/v2/use-auto-submit';
import { useSellQuote } from '@/hooks/pamm/use-sell-quote';
import { useSellOutcome } from '@/hooks/pamm/use-sell-outcome';
import { useUserBalances } from '@/hooks/pamm/use-user-balances';
import { useV3Position } from '@/hooks/pamm/use-v3-position';
import type { PoolStateResult } from '@/hooks/pamm/use-pool-state';
import type { NearSide as SwapSide } from '@/lib/near/types';

import { useV3Quote } from '@/hooks/pamm/use-v3-quote';
import { useCollateralSymbol } from '@/hooks/pamm/use-collaterals';
import { maxBuyable, maxSellable } from '@/lib/pamm/pool-math';
import { getSecondsUntilFreeze, isTradeFrozen } from '@/lib/pamm/v3-rules';
import { trackSwapInitiated, trackPammSwapSignals } from '@/lib/analytics';
import { getMsSinceMarketView } from '@/lib/last-market-view';

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
  usd2,
  usdInt,
  usdSmart,
} from './trade-card/formatters';

const IMPACT_WARN = 0.05;
const IMPACT_DANGER = 0.15;

export type TradeMode = 'buy' | 'sell';

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
  /** Market was cancelled on-chain — sell-only, and past-expiry stays live. */
  cancelled?: boolean;
  /** Admin has flagged this market for review — buy halted, sell allowed. */
  underReview?: boolean;
  /**
   * Market has entered the AI resolve flow (`pending_resolution` /
   * `pending_resolve_review`). The backend no longer records trades, so both
   * sides are halted — unlike `underReview`, which only blocks buys.
   */
  resolving?: boolean;
  /**
   * Trader petition paused trading while an admin decides. Unlike `resolving`
   * this is reversible — an admin can lift it and trading resumes — but it
   * blocks trades just as hard, since the backend rejects them outright.
   */
  tradingPaused?: boolean;
  /** Admin has banned the caller's wallet from trading here. Blocks both
   * buy and sell CTAs. FE-side gating only — no on-chain enforcement. */
  bannedFromTrading?: boolean;
  /**
   * Opened from a Predit AI chat card (plan 11): the amount to fill in once
   * (buy: dollars; sell: a share of the position) and the chat limit, USD.
   */
  preset?: { amountUsd?: number; sellPct?: number; maxUsd?: number; autoSubmit?: AutoSubmit };
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
  underReview = false,
  resolving = false,
  tradingPaused = false,
  bannedFromTrading = false,
  preset,
}: SwapPanelProps) {
  const router = useRouter();
  const gate = useWalletGate();
  const isPaused = useGlobalPause();
  const [mode, setMode] = useState<TradeMode>(cancelled ? 'sell' : initialMode);
  const [side, setSide] = useState<SwapSide>(initialSide);
  // A buy from a chat card opens with its dollars; a sell's share waits for the position (below).
  const [amountStr, setAmountStr] = useState(
    initialMode === 'buy' && preset?.amountUsd ? String(preset.amountUsd) : '',
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

  const collateralSymbol = useCollateralSymbol(
    poolState.pool.collateralMint.toBase58(),
  );
  const SCALE = 10 ** poolState.pool.collateralDecimals;
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

  // ── Balances / v3 position / quote hooks ─────────────────────────────────
  const { data: balances } = useUserBalances(
    poolAddress,
    poolState.marketVersion);
  const { data: v3Position } = useV3Position(
    poolState.marketVersion === 'v3_shares' ? poolAddress : null,
    poolState.pool.collateralMint,
    poolState.marketVersion === 'v3_shares',
  );
  const buyMut = useBuyOutcome(poolAddress);
  const sellMut = useSellOutcome(poolAddress);

  const isV3 = poolState.marketVersion === 'v3_shares';
  const v3 = poolState.v3;
  const amountRaw = parseRaw(amountStr);

  const buyQuote = useBuyQuote(
    poolState,
    side,
    !isV3 && mode === 'buy' ? amountRaw : BigInt(0),
    slippageBps,
  );
  const sellQuote = useSellQuote(
    poolState,
    side,
    !isV3 && mode === 'sell' ? amountRaw : BigInt(0),
    slippageBps,
  );
  const { quote: v3Quote, isQuoting: v3Quoting } = useV3Quote(
    isV3 ? v3 : null,
    poolState.pool.creatorShareBps,
    mode,
    side,
    amountRaw,
    slippageBps,
    v3Position
      ? {
          yesShares: v3Position.yes,
          noShares: v3Position.no,
          yesCostAcc: v3Position.yesCostAcc,
          noCostAcc: v3Position.noCostAcc,
        }
      : null,
  );

  // ── Balance / insufficient / pool-max derivations ────────────────────────
  const usdcBalance = balances?.usdc ?? BigInt(0);
  const sideBalanceRaw =
    side === 'yes' ? (balances?.yes ?? BigInt(0)) : (balances?.no ?? BigInt(0));
  const v3SideBalanceRaw =
    isV3 && v3Position
      ? side === 'yes'
        ? v3Position.yes
        : v3Position.no
      : sideBalanceRaw;
  const sideBalance = isV3 ? v3SideBalanceRaw : sideBalanceRaw;
  const inputBalance = mode === 'buy' ? usdcBalance : sideBalance;
  // v3 takes fee out of amount rather than on top — never overspends.
  const feeRaw =
    isV3 || mode !== 'buy' ? BigInt(0) : (buyQuote?.feeTotal ?? BigInt(0));
  const totalSpend = amountRaw + feeRaw;
  const insufficient =
    amountRaw > BigInt(0) &&
    (mode === 'buy' ? totalSpend > inputBalance : amountRaw > inputBalance);
  const isPending = buyMut.isPending || sellMut.isPending;
  const noBalance = inputBalance === BigInt(0);

  // ── v3 trading guards ─────────────────────────────────────────────────────
  const expiryTsNum = poolState.pool.expiryTs.toNumber();
  const v3Frozen =
    isV3 && !!v3 && isTradeFrozen(expiryTsNum, v3.tradeFreezeSeconds);
  const v3SecondsUntilFreeze =
    isV3 && v3 ? getSecondsUntilFreeze(expiryTsNum, v3.tradeFreezeSeconds) : 0;
  const v3FreezeSoon =
    isV3 &&
    !v3Frozen &&
    v3SecondsUntilFreeze > 0 &&
    v3SecondsUntilFreeze <= 3_600;
  const v3NoQuoteYet = isV3 && amountRaw > BigInt(0) && v3Quoting;
  const v3Unquotable =
    isV3 && amountRaw > BigInt(0) && !v3Quoting && v3Quote == null;

  const totalFeeFraction = poolState.pool.tradingFeeBps / 10_000;
  const yesReal = Number(poolState.yesVaultBalance) / SCALE;
  const noReal = Number(poolState.noVaultBalance) / SCALE;
  const maxTradeRaw = useMemo(() => {
    if (isV3 || !poolState.pool.seeded) return BigInt(0);
    const real =
      mode === 'buy'
        ? maxBuyable(
            yesReal,
            noReal,
            poolState.lEffective,
            side,
            totalFeeFraction,
          )
        : maxSellable(
            side === 'yes' ? yesReal : noReal,
            side === 'yes' ? noReal : yesReal,
            poolState.lEffective,
            totalFeeFraction,
          );
    return real > 0 ? BigInt(Math.floor(real * SCALE)) : BigInt(0);
  }, [
    isV3,
    mode,
    poolState.pool.seeded,
    poolState.lEffective,
    side,
    totalFeeFraction,
    yesReal,
    noReal,
  ]);
  const maxLabel = mode === 'buy' ? 'buyable' : 'sellable';
  const maxUnit = mode === 'buy' ? collateralSymbol : sideLabel;
  const exceedsMax =
    amountRaw > BigInt(0) &&
    maxTradeRaw > BigInt(0) &&
    amountRaw > maxTradeRaw &&
    !insufficient;
  const poolCannotBuy =
    !isV3 &&
    mode === 'buy' &&
    amountRaw > BigInt(0) &&
    poolState.pool.seeded &&
    !insufficient &&
    maxTradeRaw === BigInt(0);

  const quote = mode === 'buy' ? buyQuote : sellQuote;
  const impact = (isV3 ? v3Quote?.priceImpact : quote?.priceImpact) ?? 0;
  const impactDanger = impact >= IMPACT_DANGER;
  const impactWarn = impact >= IMPACT_WARN;
  const isExpired =
    !cancelled && Date.now() / 1000 >= poolState.pool.expiryTs.toNumber();

  // ── Prices / percents ───────────────────────────────────────────────────
  // 2-decimal percent — whole cents hid every move of a pool near 50/50.
  const yesPercent = Math.round(poolState.priceYes * 10_000) / 100;
  const noPercent = 100 - yesPercent;
  const activePercent = side === 'yes' ? yesPercent : noPercent;
  const activePrice = activePercent / 100;

  // Held snapshot (sell-mode banner) — v3 uses the position hook's YES/NO
  // shares; v1/v2 falls back to the outcome-token balance.
  const heldSideUnits = rawToUnits(
    sideBalance,
    poolState.pool.collateralDecimals,
  );
  // Cost basis is v3-only. Both `costAcc` and `shares` are same-decimals base
  // units so their ratio drops out to a fair 0..1 price without any SCALE.
  const avgCost = useMemo(() => {
    if (!isV3 || !v3Position) return 0;
    const shares = side === 'yes' ? v3Position.yes : v3Position.no;
    const costAcc =
      side === 'yes' ? v3Position.yesCostAcc : v3Position.noCostAcc;
    if (shares <= BigInt(0)) return 0;
    return Number(costAcc) / Number(shares);
  }, [isV3, v3Position, side]);

  // ── Buy / Sell previews (derived numbers for result / advance / CTA) ─────
  const redeemFeeBps = v3?.redeemFeeBps ?? 0;
  const buyPreview = useBuyPreview({
    amountRaw: mode === 'buy' ? amountRaw : BigInt(0),
    scale: SCALE,
    isV3,
    v3Quote,
    buyQuote,
    redeemFeeBps,
    buySide: side,
    v3Payout:
      isV3 && v3
        ? {
            poolCollateral: v3.poolCollateral,
            totalYesCostAcc: v3.totalYesCostAcc,
            totalNoCostAcc: v3.totalNoCostAcc,
          }
        : null,
  });
  const sellPreview = useSellPreview({
    amountRaw: mode === 'sell' ? amountRaw : BigInt(0),
    scale: SCALE,
    isV3,
    v3Quote,
    sellQuote,
    avgCost,
    redeemFeeBps,
  });

  // ── Amount helpers ───────────────────────────────────────────────────────
  const setAlloc = (pct: number) => {
    let rawAlloc: bigint;
    if (mode === 'buy') {
      const feeBps = BigInt(poolState.pool.tradingFeeBps);
      rawAlloc =
        (inputBalance * BigInt(pct) * BigInt(10_000)) /
        (BigInt(100) * (BigInt(10_000) + feeBps));
    } else {
      rawAlloc = (inputBalance * BigInt(pct)) / BigInt(100);
    }
    const amount = Number(rawAlloc) / SCALE;
    setAmountStr(amount > 0 ? amount.toFixed(6) : '');
  };
  const sellPctSeed = useRef(initialMode === 'sell' ? preset?.sellPct : undefined);
  useEffect(() => {
    const pct = sellPctSeed.current;
    if (!pct || mode !== 'sell' || sideBalance <= BigInt(0)) return;
    sellPctSeed.current = undefined;
    setAlloc(Math.min(100, Math.round(pct)));
    // setAlloc reads this render's balance; it runs once, when the position loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideBalance, mode]);
  const setBuyAmount = (dollars: number) => {
    setAmountStr(dollars.toString());
  };
  const applyMaxTrade = () => {
    if (maxTradeRaw <= BigInt(0)) return;
    setAmountStr((Number(maxTradeRaw) / SCALE).toFixed(6));
  };
  const focusAmount = () => amountInputRef.current?.focus();

  // ── CTA & submit ─────────────────────────────────────────────────────────
  // Orders from chat stay inside the admin's limit (plan 11 Q3).
  const overChatLimit =
    !!preset?.maxUsd &&
    (mode === 'buy' ? Number(amountRaw) / SCALE : (sellPreview?.netUsd ?? 0)) >
      preset.maxUsd;
  const ctaLabel = (() => {
    if (isPaused) return 'Trading paused';
    if (overChatLimit)
      return `Orders from Predit AI go up to $${preset!.maxUsd!.toLocaleString()}`;
    if (resolving) return 'Trading closed — resolving';
    if (tradingPaused) return 'Trading paused — awaiting review';
    if (bannedFromTrading) return 'Trading restricted';
    if (cancelled && isV3) return 'Market cancelled — claim your refund';
    if (v3Frozen) return 'Trading closed before settlement';
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
      const sharesText = fmtTokenAmount(sellPreview.sharesIn, sideLabel);
      return `Sell ${sharesText} ${sideLabel} · ${usdSmart(sellPreview.netUsd)}`;
    }
    return `Sell ${sideLabel} · ${pct2(activePrice)}`;
  })();

  // Under-review markets: block Buy only. Sell stays enabled so bettors can
  // exit while admin reviews (Refund on v3 handled by RedeemPanel elsewhere).
  const buyBlockedByReview = underReview && mode === 'buy';

  const isDisabled =
    isPaused ||
    resolving ||
    tradingPaused ||
    bannedFromTrading ||
    buyBlockedByReview ||
    overChatLimit ||
    (gate.walletReady
      ? isExpired ||
        amountRaw === BigInt(0) ||
        insufficient ||
        noBalance ||
        (mode === 'sell' && sideBalance === BigInt(0)) ||
        isPending ||
        !poolState.pool.seeded ||
        v3Frozen ||
        v3NoQuoteYet ||
        v3Unquotable ||
        (cancelled && isV3)
      : gate.connecting);

  const handleSubmit = async () => {
    if (amountRaw === BigInt(0)) return;
    const sellUsdcOut = isV3
      ? v3Quote?.kind === 'sell'
        ? v3Quote.net
        : BigInt(0)
      : (sellQuote?.usdcOut ?? BigInt(0));
    const amountUsdcInitiated =
      mode === 'buy' ? Number(amountRaw) / SCALE : Number(sellUsdcOut) / SCALE;
    trackSwapInitiated({
      market_id: poolAddress,
      side,
      action: mode,
      amount_usdc: amountUsdcInitiated,
    });
    trackPammSwapSignals({
      market_id: poolAddress,
      side,
      action: mode,
      ms_since_page_load: Math.floor(performance.now()),
      ms_since_market_view: getMsSinceMarketView(poolAddress),
      slippage_bps: slippageBps,
    });
    let txSig: string | undefined;
    if (mode === 'buy') {
      const v3Buy = v3Quote?.kind === 'buy' ? v3Quote : null;
      txSig = await buyMut.mutateAsync({
        poolState,
        buySide: side,
        usdcAmountIn: amountRaw,
        minOutTotal: (isV3 ? v3Buy?.minOut : buyQuote?.minOut) ?? BigInt(0),
        expectedOutTotal:
          (isV3 ? v3Buy?.sharesOut : buyQuote?.amountOut) ?? BigInt(0),
      });
    } else if (mode === 'sell') {
      const v3Sell = v3Quote?.kind === 'sell' ? v3Quote : null;
      txSig = await sellMut.mutateAsync({
        poolState,
        sellSide: side,
        sellAmountIn: amountRaw,
        minUsdcOut:
          (isV3 ? v3Sell?.minOut : sellQuote?.minUsdcOut) ?? BigInt(0),
        expectedUsdcOut: (isV3 ? v3Sell?.net : sellQuote?.usdcOut) ?? BigInt(0),
      });
    }
    setAmountStr('');
    if (question) setTradeSuccess({ side: sideLabel });
    onSuccess?.(txSig);
  };

  // A chat card confirmed (plan 19): this button, pressed once it is ready.
  useAutoSubmit(
    preset?.autoSubmit,
    {
      ready: gate.walletReady && !isDisabled && amountRaw > BigInt(0),
      waiting:
        !gate.walletReady || !balances || v3NoQuoteYet || sellPctSeed.current !== undefined,
      label: ctaLabel,
    },
    handleSubmit,
  );

  // ── Derived UI-text (pure) ───────────────────────────────────────────────
  const amtNum = Number(amountRaw) / SCALE;
  const resultTexts = deriveResultTexts({
    mode,
    isV3,
    buyPreview,
    sellPreview,
    sideLabel,
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
        isV3,
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
      isV3,
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
      value: `${(poolState.pool.creatorShareBps / 100).toFixed(0)}%`,
    });
    if (mode === 'buy' && buyPreview) {
      items.push({
        label: 'Min received',
        value: `${fmtTokenAmount(buyPreview.minShares, sideLabel)} ${sideLabel}`,
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
    poolState.pool.creatorShareBps,
  ]);

  // ── Held-indicator for Sell ──────────────────────────────────────────────
  const heldIndicator = mode === 'sell' && (
    <HeldIndicator
      side={side}
      sideLabel={sideLabel}
      oppositeSideLabel={oppositeSideLabel}
      heldShares={heldSideUnits}
      closingShares={rawToUnits(amountRaw, poolState.pool.collateralDecimals)}
      avgCost={avgCost}
      onSwitchToBuyOpposite={() => {
        setMode('buy');
        setSide(side === 'yes' ? 'no' : 'yes');
        setAmountStr('');
      }}
    />
  );

  // ── Warnings ─────────────────────────────────────────────────────────────
  // One banner at a time, highest severity wins, rendered directly above the
  // CTA. Every guard the old panel surfaced survives — see `build-warnings`.
  const topWarning = pickTopWarning(
    buildWarnings({
      mode,
      isV3,
      isPaused,
      cancelled,
      underReview,
      resolving,
      tradingPaused,
      bannedFromTrading,
      v3Frozen,
      v3FreezeSoon,
      v3SecondsUntilFreeze,
      v3TradeFreezeSeconds: v3?.tradeFreezeSeconds,
      seeded: poolState.pool.seeded,
      isExpired,
      v3Unquotable,
      insufficient,
      poolCannotBuy,
      exceedsMax,
      impactWarn,
      impactDanger,
      impact,
      hasQuote: !!quote,
      sideLabel,
      oppositeSideLabel,
      collateralSymbol,
      totalSpendDisplay: fmtTokens(totalSpend, 2),
      feeRawIsZero: feeRaw === BigInt(0),
      maxTradeDisplay: fmtTokens(maxTradeRaw, 2),
      maxUnit,
      onApplyMaxTrade: applyMaxTrade,
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
          rawBalance={balances?.usdc}
          decimals={poolState.pool.collateralDecimals}
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

      {maxTradeRaw > BigInt(0) && maxTradeRaw < inputBalance && (
        <button
          onClick={applyMaxTrade}
          disabled={isPending}
          className="cursor-pointer text-left font-mono text-[9.5px] text-faint transition-colors hover:text-foreground disabled:opacity-50"
        >
          Max {maxLabel}: ~{fmtTokens(maxTradeRaw, 2)} {maxUnit} · tap to use
        </button>
      )}

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

      {mode === 'buy' &&
        balances !== undefined &&
        noBalance &&
        collateralSymbol === 'PXP' && (
          <div className="rounded-[9px] border border-primary/30 bg-primary/5 px-3.5 py-3 space-y-2">
            <p className="font-mono text-[11px] text-muted-foreground">
              No {collateralSymbol} balance — claim XP to start trading.
            </p>
            <button
              onClick={() => router.push('/earn?tutorial=pamm')}
              className="w-full cursor-pointer rounded-[7px] bg-primary/90 hover:bg-primary py-2 font-mono text-[11px] font-bold text-white transition-colors"
            >
              Go to Earn Center →
            </button>
          </div>
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
