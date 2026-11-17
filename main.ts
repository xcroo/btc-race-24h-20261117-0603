// V-reversal bot for btc-race-24h-20261117-0603.
//
// Idea (my own design): this market whipsaws slow trend signals to death —
// the dev window's 1-minute volatility is only ~6.4 bps, yet the price swings
// 1–2% in sharp V-shapes several times a day. So instead of chasing trends,
// the bot waits for a sharp capitulation dip and buys the first up-tick of
// the recovery, then lets the fast bounce run to a wide target.
//
//   - Entry: the close has fallen at least 60 bps over the last 45 bars AND
//     the latest bar closed up (the fall is turning). One tranche of 50% of
//     equity per trade, at most one open position, 10-bar cooldown after an
//     exit.
//   - Exit: profit target +160 bps from the fill price, stop -40 bps from the
//     fill price, or 240 bars held. The entry price is read from the buy fill
//     the harness reports, never from the decision-time close (fills land at
//     the next bar's open).
//   - max_slippage_bps is 100 (1%) on every order: far above the ~7 bps a
//     normal fill moves, so ordinary bars never reject, while a wild fill is
//     refused.
//   - No orders while warming up; no orders on a batch with no bar.
//     Deterministic: no clock, no environment, no randomness — the two
//     official runs agree exactly.
import { runBars } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// --- tunable strategy constants (bars / basis points) ---
const DIP_BARS = 45; // window for the capitulation fall
const DIP_BPS = 60; // entry: 45-bar return this far below zero
const SIZE_BPS = 5000; // 50% of equity per entry
const TARGET_BPS = 160; // take profit above the fill price
const STOP_BPS = 40; // stop below the fill price
const MAX_HOLD_BARS = 240; // time stop
const COOLDOWN_BARS = 10; // bars to wait after an exit before re-entering
const MAX_SLIP_BPS = 100; // 1% — far above the ~7 bps a fill normally moves

const BPS = 10000;

function freshState() {
  return {
    closes: [],
    entryPrice: null,
    entrySeq: -1,
    lastExitSeq: -1000000,
  };
}

function decide(state, batch, st) {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return [];
  const close = Number(bar.c);

  // --- fold the new close in ---
  st.closes.push(close);

  // --- fold the fills: learn the entry price from a buy fill, clear on exit ---
  for (const fill of batch.fills) {
    if (fill.symbol !== SYMBOL) continue;
    if (fill.side === 'buy' && fill.status === 'filled') {
      st.entryPrice = Number(fill.price);
      st.entrySeq = fill.fill_bar;
    }
    if (fill.side === 'sell' && fill.status === 'filled') {
      st.entryPrice = null;
      st.lastExitSeq = fill.fill_bar;
    }
  }

  const pos = state.positions.get(SYMBOL);
  const holding = pos !== undefined && pos.qty > 0n;
  if (state.warmingUp) return [];

  // --- in a position: manage the exit ---
  if (holding) {
    if (st.entryPrice === null) {
      // Fallback: derive the average entry price from cost / qty.
      const qty = Number(pos.qty);
      const cost = Number(pos.cost);
      if (qty > 0 && cost > 0) {
        st.entryPrice = (cost * 10 ** 7) / qty;
        st.entrySeq = state.seq;
      } else {
        return [];
      }
    }
    const entry = st.entryPrice;
    const held = state.seq - st.entrySeq;
    const targetHit = close >= (entry * (BPS + TARGET_BPS)) / BPS;
    const stopHit = close <= (entry * (BPS - STOP_BPS)) / BPS;
    const timeUp = held >= MAX_HOLD_BARS;
    if (targetHit || stopHit || timeUp) {
      return [{ side: 'sell', symbol: SYMBOL, qty: pos.qty, max_slippage_bps: MAX_SLIP_BPS }];
    }
    return [];
  }

  // --- flat: look for a capitulation dip turning up ---
  st.entryPrice = null;
  if (st.closes.length <= DIP_BARS) return [];
  if (state.seq - st.lastExitSeq < COOLDOWN_BARS) return [];
  const prevClose = st.closes[st.closes.length - 2];
  const oldClose = st.closes[st.closes.length - 1 - DIP_BARS];
  const fallBps = ((oldClose - close) / oldClose) * BPS;
  if (fallBps < DIP_BPS) return [];
  if (close <= prevClose) return []; // need the first up-tick of the turn

  // Size: 50% of equity, capped by the weight room and the cash on hand.
  let notional = (state.equity * BigInt(SIZE_BPS)) / BigInt(BPS);
  const room = state.weightRoom(SYMBOL);
  if (notional > room) notional = room;
  if (notional > state.cash) notional = state.cash;
  const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
  if (notional < minNotional) return [];
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIP_BPS }];
}

const st = freshState();

await runBars({
  onBatch(state, batch) {
    return decide(state, batch, st);
  },
});
