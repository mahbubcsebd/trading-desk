---
name: forex-smc-mentor
description: >-
  Use this skill when analyzing Forex, Spot Gold (XAU/USD), and Bitcoin (BTC/USD) markets, evaluating trade setups, calculating institutional risk and lot sizes for Exness, or assessing Smart Money Concepts (SMC), Inner Circle Trader (ICT) liquidity sweeps, order blocks, fair value gaps, and economic news impact.
---

# Forex & Gold Institutional SMC/ICT Trading Skill

This skill guides the evaluation and execution of high-probability trade setups across Forex and Spot Metals (specifically Exness XAU/USD and BTC/USD) using Smart Money Concepts (SMC) and Inner Circle Trader (ICT) methodologies combined with strict proprietary firm risk management.

---

## 1. Core Institutional Directives

1. **Capital Preservation First**: Never risk more than **1.0%** of total account balance on a single trade.
2. **Never Chase**: Do not buy in Premium (>50% dealing range) or sell in Discount (<50% dealing range).
3. **News Blackout Window**: Strictly avoid opening new positions **15 minutes before and 15 minutes after** high-impact USD economic events (CPI, Non-Farm Payrolls [NFP], FOMC, Advance GDP).
4. **Liquidity is the Fuel**: Price only moves to seek liquidity (BSL/SSL) or rebalance fair value (FVG). Identify who is trapped before taking an entry.

---

## 2. 5-Step Trade Evaluation Protocol

When asked to evaluate any currency pair or gold setup:

### Step 1: Macro & News Radar Check
- Check the economic calendar for high-impact USD/EUR/GBP events.
- Check the **US Dollar Index (DXY)** 4h/1h trend:
  - DXY Bullish $\rightarrow$ Bearish pressure on XAU/USD and EUR/USD.
  - DXY Bearish $\rightarrow$ Bullish tailwind for XAU/USD and EUR/USD.
- If an event is within 15 minutes, advise waiting for the initial spread spike to settle.

### Step 2: Multi-Timeframe Structure (MTF)
- **Higher Timeframe (4h/1h)**: Determine the macro narrative. Where is the draw on liquidity?
- **Execution Timeframe (15m)**:
  - **BOS (Break of Structure)**: Confirms trend continuation.
  - **CHoCH (Change of Character)**: Early warning of trend reversal when a key swing point is broken with a full candle body close.

### Step 3: Key Dealing Range & PD Array
- Measure the active swing high to swing low with Fibonacci:
  - **Premium Zone (50% - 100%)**: Look ONLY for Sell / Short setups.
  - **Equilibrium (50%)**: Neutral zone, wait for expansion.
  - **Discount Zone (0% - 50%)**: Look ONLY for Buy / Long setups.
  - **OTE (Optimal Trade Entry)**: 61.8% to 79.0% retracement zone for maximum Risk-to-Reward.

### Step 4: Liquidity & Order Block Identification
- **Liquidity Pools**:
  - **BSL (Buy-Side Liquidity)**: Equal highs / swing highs where retail buy-stops and breakout traders sit.
  - **SSL (Sell-Side Liquidity)**: Equal lows / swing lows where retail stop-losses sit.
  - **Judas Swing / Turtle Soup**: A fast sweep above/below a key high/low during London/NY open that rejects immediately $\rightarrow$ prime reversal confirmation.
- **Order Block (OB)**: The last opposite candle before an aggressive displacement that breaks structure. Must be unmitigated (fresh).
- **Fair Value Gap (FVG)**: 3-candle imbalance where candle 1 wick and candle 3 wick do not overlap.

### Step 5: Trade Execution & Exness Sizing
- Always provide **both Bullish and Bearish Conditional Roadmaps** with exact price levels:
  - **Trigger Price**: Exact condition for entry (e.g. tap into FVG + rejection wick).
  - **Stop Loss (SL)**: Placed beyond the invalidation swing / Order Block with a spread buffer ($0.30 - $0.50 on Gold).
  - **Take Profit (TP1 & TP2)**: TP1 at 50% partials (1:2 R:R), TP2 at opposing BSL/SSL pool.
  - **Exness Lot Size**: Calculated using the 1% risk formula.

---

## 3. Exness Lot Size Formula (Gold XAU/USD)

For Exness Gold (`XAUUSD`), 1 standard lot = 100 troy ounces.
$$\text{Risk Amount (\$) } = \text{Balance} \times \frac{\text{Risk \%}}{100}$$
$$\text{SL Distance (\$) } = |\text{Entry} - \text{SL}|$$
$$\text{Lot Size } = \frac{\text{Risk Amount}}{\text{SL Distance} \times 100}$$
*(Rounded down to nearest 0.01 lot, minimum 0.01)*

Example:
- Balance: $\$10,000$ | Risk: $1\%$ ($\$100$)
- Gold Entry: $\$4025.00$ | SL: $\$4022.50$ (Distance: $\$2.50$)
- $\text{Lot Size} = \frac{100}{2.50 \times 100} = \mathbf{0.40 \text{ Lots}}$

---

## 4. Helper Script

To inspect real-time market data directly from the TradeDesk engine:
```bash
python .agents/skills/forex-smc-mentor/scripts/check_market.py --symbol XAUUSD
```

For detailed reference on SMC patterns, see [references/smc_rules.md](./references/smc_rules.md).
For risk calculation sheets, see [references/risk_rules.md](./references/risk_rules.md).

