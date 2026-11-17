# btc-race-24h-20261117-0603 — V-Reversal Bot

[![make.fun](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/xcroo/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/xcroo/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, one minute at a
time, in the make.fun competition
[btc-race-24h-20261117-0603](https://make.fun/bounty/btc-race-24h-20261117-0603):
$250 in prizes for the ten highest net PnLs on the 24-hour race window.

## Strategy — V-reversal

Slow trend signals get whipsawed to death on this market: 1-minute
volatility is only ~6.4 bps, yet the price swings 1–2% in sharp V-shapes
several times a day. So the bot never chases a trend. It waits for a sharp
capitulation dip and buys the first up-tick of the recovery:

- **Entry:** the close has fallen at least 60 bps over the last 45 bars AND
  the latest bar closed up (the fall is turning). One tranche of 50% of
  equity per trade.
- **Exit:** profit target +160 bps from the fill price, stop −40 bps from the
  fill price, or 240 bars held.
- **Costs:** every round trip pays 4 bps fee + 2 bps slippage + pool impact on
  each side, so entries wait for a real dip and exits bank real moves.

See [BUILD-NOTES.md](BUILD-NOTES.md) for the full design and the local
backtest numbers on the frozen dev window.

## Backtest (frozen dev window, 1,440 bars)

Local replay driver (`work2/driver.mjs`, not in the repo) implementing the
RULES.txt fill model exactly (next-bar-open fills, 4 bps fee + 2 bps slippage
+ pool impact, exact integer maths):

- Net PnL **+$5.07** (final equity $1,005.07) — passes the dev gate (net > $0).
- 6 round trips (12 fills), 3 wins / 3 losses, fees $2.40, 0 rejected orders.
- Per trade: −$2.86, −$2.96, +$7.19, +$4.09, −$3.00, +$2.61. Wins
  (+$13.89) outweigh losses (−$8.82); the largest win is 52% of gross wins,
  not the whole result.
- Max drawdown $7.53 (0.08%) — far inside the 25% guardrail.
- Determinism: two runs produce the identical action log
  (sha256 `cd08d3b3942298445a04606a8e92fe35bafaa9663d908e9144a9c7f5f77ae8d5`).
- Robustness: the same shape is positive across a broad parameter plateau
  (dip 50–60 bps, target 130–200 bps, stop 35–50 bps all give +$0.91 to
  +$7.15); with warmup=60 the result is identical (+$5.07).

## Files

- `main.ts` — the bot (Node 22, `agent-fun/bars-replay/v1`, erasable
  TypeScript, standard library only).
- `vendor/makefun-bars.ts` — the kit's SDK shim, copied byte-identical.
- `BUILD-NOTES.md` — design, parameters, backtest results.

## Run it locally

The kit's `grade-local` grades the bot on the frozen dev window (Docker
driver). Without Docker, the same replay can be driven by any
`agent-fun/bars-replay/v1` harness: feed it `hello`, then one `batch` per
1-minute bar, and it answers one `reply` per batch.
