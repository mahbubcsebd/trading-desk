#!/usr/bin/env python3
"""
TradeDesk CLI Market Snapshot Checker
Part of the forex-smc-mentor Antigravity skill.
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ENGINE_URL = os.environ.get("ENGINE_URL", "http://127.0.0.1:8001")
ENGINE_KEY = os.environ.get("ENGINE_KEY", "change-me-long-random")


def get_snapshot(symbol: str, tf: str = "15m"):
    url = f"{ENGINE_URL}/api/snapshot?symbol={symbol}&tf={tf}"
    req = urllib.request.Request(url, headers={"X-Engine-Key": ENGINE_KEY})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        # Fallback to port 8000 if 8001 fails
        if "8001" in ENGINE_URL:
            fallback_url = f"http://127.0.0.1:8000/api/snapshot?symbol={symbol}&tf={tf}"
            try:
                fallback_req = urllib.request.Request(fallback_url, headers={"X-Engine-Key": ENGINE_KEY})
                with urllib.request.urlopen(fallback_req, timeout=5) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception:
                pass
        print(f"[ERROR] Could not connect to TradeDesk engine at {ENGINE_URL}: {e}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(description="Institutional Market Snapshot for Forex & Gold")
    parser.add_argument("--symbol", default="XAUUSD", help="Symbol to check (e.g. XAUUSD, BTCUSD)")
    parser.add_argument("--tf", default="15m", help="Timeframe (e.g. 15m, 1h, 4h)")
    args = parser.parse_args()

    data = get_snapshot(args.symbol.upper(), args.tf)
    if not data:
        sys.exit(1)

    sym = data.get("symbol", args.symbol)
    price = data.get("spotPrice") or data.get("price", 0.0)
    change = data.get("change24hPct", 0.0)
    setup = data.get("setup", {})
    smc = data.get("smc", {})
    macro = data.get("macro", {})

    print("\n" + "=" * 60)
    print(f"🏛️  TRADEDESK INSTITUTIONAL SNAPSHOT: {sym} ({args.tf})")
    print("=" * 60)
    print(f"• Live Spot Price:      ${price:,.2f} ({change:+.2f}% 24h)")
    print(f"• Market Structure:     {smc.get('structure', {}).get('trend', 'N/A')} ({smc.get('structure', {}).get('structureDetail', 'Consolidation')})")
    print(f"• BOS / CHoCH:          BOS: {smc.get('structure', {}).get('bos', {}).get('status', 'None')} | CHoCH: {smc.get('structure', {}).get('choch', {}).get('status', 'None')}")
    print(f"• Dealing Zone:         {smc.get('pdArray', {}).get('zone', 'N/A')} ({smc.get('pdArray', {}).get('currentPercent', 50)}% in range)")
    print(f"• Active Session:       {smc.get('killzone', {}).get('sessionName', 'Ambient')} (Killzone: {smc.get('killzone', {}).get('isKillzone', False)})")
    
    # Order Blocks & Liquidity
    bull_ob = smc.get("orderBlocks", {}).get("bullishOB", {})
    bear_ob = smc.get("orderBlocks", {}).get("bearishOB", {})
    bsl = smc.get("liquidity", {}).get("bsl", {})
    ssl = smc.get("liquidity", {}).get("ssl", {})
    print("-" * 60)
    print(f"• Demand / Bullish OB:  ${bull_ob.get('bottom', 0):,.2f} - ${bull_ob.get('top', 0):,.2f}")
    print(f"• Supply / Bearish OB:  ${bear_ob.get('bottom', 0):,.2f} - ${bear_ob.get('top', 0):,.2f}")
    print(f"• Buy-Side Liquidity:   ${bsl.get('level', 0):,.2f} (Dist: ${bsl.get('distance', 0):.2f})")
    print(f"• Sell-Side Liquidity:  ${ssl.get('level', 0):,.2f} (Dist: ${ssl.get('distance', 0):.2f})")

    # Macro & Risk
    dxy = macro.get("dxy", {})
    news = macro.get("news", {})
    risk = smc.get("risk", {})
    print("-" * 60)
    print(f"• DXY Dollar Index:     ${dxy.get('price', 0):,.2f} (Bias: {dxy.get('bias', 'N/A')}) -> Gold: {dxy.get('goldImpact', 'Neutral')}")
    print(f"• News Window:          {'⚠️ WARNING: ACTIVE NEWS SPREAD RISK' if news.get('isNewsWindow') else 'Normal Market Conditions'}")
    if news.get("nextEvent"):
        print(f"• Next Red/Med Event:   {news['nextEvent'].get('title')} in {news['nextEvent'].get('minutesUntil')}m")
    print(f"• Recommended Lot Size: {risk.get('lotSize', 0.01)} Lots (1% Risk)")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
