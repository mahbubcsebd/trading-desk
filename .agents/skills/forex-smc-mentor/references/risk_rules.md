# Exness Risk Management & Lot Size Specifications

This reference provides exact formulas and specifications for trading on Exness MT5 / Spot CFD accounts.

---

## 1. Instrument Contract Specifications

| Symbol | Description | Contract Size | Tick Size | Minimum Lot | Lot Step | Spread (Raw) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **XAUUSD** | Gold vs US Dollar | 100 troy oz | $0.01 | 0.01 Lot | 0.01 Lot | 0.10–0.25 pips |
| **BTCUSD** | Bitcoin vs US Dollar | 1 Coin | $0.01 | 0.001 Lot | 0.001 Lot | Tight |
| **EURUSD** | Euro vs US Dollar | 100,000 EUR | 0.00001 | 0.01 Lot | 0.01 Lot | 0.0–0.2 pips |
| **GBPUSD** | British Pound vs USD | 100,000 GBP | 0.00001 | 0.01 Lot | 0.01 Lot | 0.1–0.4 pips |

---

## 2. Quantitative Lot Size Calculations

### A. Gold (XAU/USD)
On Exness, a $1.00 move on 1.00 standard lot equals **$100.00 USD**.
$$\text{Dollar Risk} = \text{Account Balance} \times 0.01 \quad (\text{for } 1\%)$$
$$\text{SL Distance in Dollars} = |\text{Entry Price} - \text{Stop Loss}|$$
$$\text{Exness Lot Size} = \frac{\text{Dollar Risk}}{\text{SL Distance} \times 100}$$

#### Quick Reference Table ($10,000 Account, $100 Risk):
| SL Distance ($) | Exact Lot Size | Max Loss ($) |
| :--- | :--- | :--- |
| **$1.00** | 1.00 Lot | $100.00 |
| **$1.50** | 0.66 Lot | $99.00 |
| **$2.00** | 0.50 Lot | $100.00 |
| **$2.50** | 0.40 Lot | $100.00 |
| **$3.00** | 0.33 Lot | $99.00 |
| **$5.00** | 0.20 Lot | $100.00 |

---

## 3. Account Protection Rules

1. **Daily Loss Limit (Circuit Breaker)**:
   - If cumulative daily loss reaches **3.0%** of starting daily equity, **ALL TRADING MUST STOP** for that 24-hour session.
   - Prevent revenge trading.
2. **Maximum Open Risk**:
   - Never allow more than 2 open trades simultaneously.
   - Total correlated risk across USD pairs must not exceed **2.0%**.
3. **Breakeven Rule**:
   - Once price reaches **1:1.5 R:R** or sweeps the first intermediate liquidity pool, move Stop Loss to Breakeven (Entry + Spread Buffer).
