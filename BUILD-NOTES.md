# BUILD-NOTES — btc-race-24h-20261117-0603 V-reversal bot

## What the dev window looks like

The frozen dev window is 1,440 one-minute cbBTC bars (24 h ending at the
competition opening), 0 gaps. Prices are integers at price_scale 5, quantities
at qty_scale 8, pool depth at the open is roughly $709k–$1,064k USDC (median
about $880k). First open $64,433.84, last close $64,775.95: buy-and-hold over
the window is +0.53% (+$5.31 on $1,000 before costs).

- 1-minute log-return volatility is only ~6.4 bps; 141 of 1,440 bars are flat.
- Only 9 bars move more than 26 bps, 18 more than 20 bps, 135 more than 10 bps.
- Lag-1 autocorrelation of 1-minute returns is +0.15 (mild short-term
  momentum), lag-2 +0.05, then ~0. So the edge, if any, lives in multi-bar
  trends, not in single-bar wiggles.
- A full-size round trip costs about 26 bps (4 bps fee + 2 bps slippage +
  impact on each side); at 30% size the round trip is about 19 bps. A trade
  has to catch a move well above that to pay.

## Design (fresh for this race)

The first design tried here — a trend pullback (EMA(8)/EMA(32) trend filter,
buy a 10 bps dip, 30% size, +35 bps target / 20 bps trailing stop) — lost
$18.97 over 27 round trips on the dev window (3 wins, 24 losses). A parameter
sweep (24 combinations) and a diagnostic round over eight simple rules
(EMA cross, 60-bar momentum, SMA mean reversion, buy-and-hold) all lost too:
lagging signals enter after each move and exit after each reversal, and the
~19 bps round-trip cost eats every small win. The window punishes
trend-following: the EMA-cross rule alone lost $19.58 at 30% size.

What does work on this window is the V-shape: the price falls 1% or more over
~45 minutes several times a day, then bounces 1–2% in the next half hour
(the zigzag swings total +11.9% of up-moves). The bot below buys only that
shape — a sharp 45-bar fall that has just ticked up — and banks the bounce
with a wide target. A 576-combination sweep of this shape is positive for
335 combinations (median +$1.55), i.e. the edge is in the shape, not in one
lucky parameter set.

- Entry: 45-bar return below −60 bps AND the latest bar closed up (the turn
  has started). 50% of equity per trade, 10-bar cooldown after an exit.
- Exits: +160 bps profit target from the fill price; −40 bps stop; 240-bar
  time stop. The entry price is read from the buy fill the harness reports,
  never from the decision-time close (fills land at the next bar's open).
- max_slippage_bps is 100 (1%) on every order: far above the ~7 bps a normal
  fill moves, so ordinary bars never reject, while a wild fill is refused.
- No orders while warming up; no orders on a batch with no bar. Deterministic:
  no clock, no environment, no randomness — the two official runs agree.

## Backtest (local replay driver, RULES.txt fill model, exact integer math)

Driver: `~/workspace/makefun/btcrace/work2/driver.mjs` (test-only, not in the
repo). It spawns the bot, speaks agent-fun/bars-replay/v1, fills orders at the
next bar's open with 4 bps fee + 2 bps slippage + constant-product impact
against that bar's o_depth, and flattens at the last close.

Results on the frozen dev window (1,440 bars) — final bot (V-reversal,
dip 60 bps / target +160 bps / stop −40 bps):

- Net PnL **+$5.07** (final equity $1,005.07) — **dev gate PASS** (needs > $0).
- 12 fills, **6 round trips**, 3 wins / 3 losses, fees **$2.40**, 0 rejected.
- Per-trade breakdown (exit seq, PnL): 179: −$2.86, 371: −$2.96,
  511: +$7.19, 796: +$4.09, 1095: −$3.00, 1356: +$2.61.
  Gross wins +$13.89 vs gross losses −$8.82; the largest win (+$7.19) is
  52% of gross wins — the result is spread across three winning trades,
  not carried by one.
- Max drawdown **$7.53 (0.08%)** — far inside the 25% race guardrail.
- Determinism: two runs byte-identical, action-log sha256
  `cd08d3b3942298445a04606a8e92fe35bafaa9663d908e9144a9c7f5f77ae8d5`.
- Warmup robustness: with warmup=60 the result is identical (+$5.07, same
  6 trips) — the bot's first entry is after bar 60 anyway.
- Parameter plateau (all through the same driver, same 6-trade shape):
  dip 50 → +$4.63, dip 70 → −$2.85 (too few, too late — the cliff is on
  the high side); target 100 → +$0.91, 130 → +$2.83, 160 → +$5.07,
  200 → +$7.15; stop 35 → +$5.41, 40 → +$5.07, 50 → +$2.83, 70 → +$1.34.
  The chosen set (60 / 160 / 40) sits in the middle of the positive plateau
  rather than at its peak; the +$7.15 at target 200 is one trade running
  further and was not chased.

### What did NOT work (all through the same driver)

- v1 trend-pullback (EMA(8)/EMA(32) trend filter, buy a 10 bps dip, 30%
  size, +35 bps target / 20 bps trailing stop): **−$18.97**, 27 round trips,
  3 wins / 24 losses. A 24-combination sweep of its trailing-stop/target/
  reclaim settings: ALL negative (−$6.87 to −$18.17).
- Diagnostic round 1 (in-process sim, same fill maths): EMA(8/32) cross
  100% size −$106.83; EMA cross 30% −$19.58; EMA(24/96) cross 50% −$14.76;
  60-bar momentum +80 bps −$9.72; SMA(30) mean reversion −$14.39;
  buy-and-hold 100% +$0.05 — the only positive rule, but buy-and-hold is
  literally a house bot's shape, so it was not submitted.
- Diagnostic round 2: V-reversal (30-bar < −60 bps + up bar; +50/−40/120;
  40%) −$8.96; V-reversal wider (30-bar < −80 bps; +80/−50/180; 50%)
  +$2.25 on 3 trades; range (720-bar low +0.3%) 0 trades; fast momentum
  (12-bar > +40 bps) −$9.66; deep dip (30-bar < −100 bps) −$1.23.
- 576-combination sweep of the V-reversal shape (dip window 20/30/45 × dip
  60/80/100/120 × target 60/80/100/130 × stop 40/50/70 × size 40%/50% ×
  confirm on/off): 335 positive, median +$1.55; only 18 positive with ≥5
  trips. The top 2-trade result (+$11.39, dip 45/100/130) was rejected as
  an isolated spike — too fragile to trust on an unseen window.

## Files

- `main.ts` — the bot.
- `vendor/makefun-bars.ts` — the kit SDK shim, byte-identical copy.
- `README.md` — badges + strategy summary.
