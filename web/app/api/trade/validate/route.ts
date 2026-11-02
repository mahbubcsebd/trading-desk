import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getSettings, getSnapshot, getJudasRadar, getConfluenceMatrix } from "@/lib/engine";

export async function POST(req: NextRequest) {
  // 1. Authenticate session
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuth = await verifySessionToken(token);
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse request payload
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    symbol = "XAUUSD",
    side = "BUY",
    entry,
    sl,
    tp,
    qty = 0.01,
    balance = 10000,
    riskPct = 1.0,
    timeframe = "15m",
  } = body;

  if (!entry || !sl || !tp) {
    return NextResponse.json({ error: "Entry, SL, and TP are required" }, { status: 400 });
  }

  // 3. Resolve Gemini API Key
  const settings = await getSettings().catch(() => ({ balance: 10000, risk_pct: 1.0, daily_limit_pct: 3.0 }));
  const apiKey = (settings as any).gemini_api_key || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Gemini API key not configured. Add it in Settings." },
      { status: 400 }
    );
  }

  // 4. Fetch Live Engine State for Complete Institutional Confluence
  let snapshot: any = null;
  let judasRadar: any = null;
  let matrix: any = null;

  try {
    [snapshot, judasRadar, matrix] = await Promise.all([
      getSnapshot(symbol, timeframe).catch(() => null),
      getJudasRadar(symbol).catch(() => null),
      getConfluenceMatrix().catch(() => null),
    ]);
  } catch (err) {
    console.warn("Could not fetch auxiliary engine context:", err);
  }

  // Calculate R:R and distances
  const slDist = Math.abs(entry - sl);
  const tpDist = Math.abs(tp - entry);
  const rrRatio = slDist > 0 ? (tpDist / slDist).toFixed(2) : "2.0";

  // Multi-timeframe info for this symbol from matrix
  const pairMatrix = matrix?.pairs?.find((p: any) => p.symbol === symbol.toUpperCase());
  const matrixGrade = pairMatrix?.alignment?.grade || "N/A";
  const matrixSummary = pairMatrix?.alignment?.summary || "N/A";
  const tf4h = pairMatrix?.timeframes?.["4h"]?.trend || "NEUTRAL";
  const tf1h = pairMatrix?.timeframes?.["1h"]?.trend || "NEUTRAL";
  const tf15m = pairMatrix?.timeframes?.["15m"]?.trend || "NEUTRAL";
  const tf5m = pairMatrix?.timeframes?.["5m"]?.trend || "NEUTRAL";

  // SMC Context
  const smc = snapshot?.smc || {};
  const pdZone = smc.pdZones?.zone || pairMatrix?.smc?.pdZone || "EQUILIBRIUM";
  const structureTrend = smc.structure?.trend || "NEUTRAL";
  const killzone = smc.killzone?.sessionName || "Live Market";
  const isKillzone = smc.killzone?.isKillzone || false;

  // Macro News window
  const macroEvents = snapshot?.macro?.upcomingEvents || [];
  const nextHighImpact = macroEvents.find((e: any) => e.impact === "HIGH");

  // Judas Sweep State
  const sweepState = judasRadar?.sweepAnalysis?.judasState || "RANGE_BOUND";
  const sweepBadge = judasRadar?.sweepAnalysis?.badgeLabel || "Range Bound";
  const asianHigh = judasRadar?.asianRange?.high;
  const asianLow = judasRadar?.asianRange?.low;

  // 5. Construct Institutional Verification Prompt
  const prompt = `
You are the "TradeDesk Head of Quantitative Risk & Senior Institutional SMC Execution Officer".
A professional trader is about to click "EXECUTE ORDER" on Exness MT5.
Your responsibility is to strictly audit this pending trade proposal before capital is committed.

=== PROPOSED TRADE SETUP ===
- Instrument: ${symbol}
- Direction / Side: ${side.toUpperCase()}
- Proposed Entry Price: ${entry}
- Planned Stop Loss: ${sl} (Risk distance: ${slDist})
- Planned Take Profit: ${tp} (Reward distance: ${tpDist})
- Risk:Reward Ratio: 1:${rrRatio} R:R
- Position Size: ${qty} Lots (Risk: ${riskPct}% of $${balance} balance)

=== REAL-TIME INSTITUTIONAL ORDERFLOW DATA ===
- Multi-Timeframe Alignment Grade: ${matrixGrade} (${matrixSummary})
  * 4H Macro: ${tf4h}
  * 1H Bias: ${tf1h}
  * 15m Structure: ${tf15m}
  * 5m Momentum: ${tf5m}
- ICT Premium / Discount Array: Price is in ${pdZone} (Buying in Discount is favorable; Selling in Premium is favorable; Chasing in opposite zone is dangerous)
- Market Structure Trend: ${structureTrend}
- ICT Session / Killzone: ${killzone} (Active Killzone: ${isKillzone ? "YES" : "NO"})
- Session Liquidity Sweep / Judas Radar: ${sweepState} (${sweepBadge})
  * Asian High: ${asianHigh || "N/A"}
  * Asian Low: ${asianLow || "N/A"}
- Macro Economic News: ${nextHighImpact ? `HIGH IMPACT EVENT: "${nextHighImpact.title}" for ${nextHighImpact.currency} at ${nextHighImpact.time}` : "No immediate high-impact red folder news detected"}

=== EVALUATION GUIDELINES ===
1. Verdict:
   - "GO": High probability A+ or A setup, clear R:R >= 2.0, correct PD Array (Buy in Discount, Sell in Premium), aligned HTF bias, clean news clearance.
   - "GO_WITH_CAUTION": Acceptable setup but has minor risk factors (e.g. minor counter-trend pullback, R:R between 1.5 - 2.0, or medium news in 45m). Recommend 0.5% risk.
   - "NO_GO": Severe violation (e.g. buying into extreme Premium at major resistance, high-impact news in <30 min, R:R < 1.5, or fighting 4H macro trend). Recommend sitting on hands.
2. Confidence Score: 1 to 10 scale (e.g. 8.8).
3. Checklist: Evaluate 5 pillars:
   - HTF 4H/1H Bias Alignment
   - PD Array Zone (Discount/Premium)
   - Order Block / Liquidity Sweep / Judas Confluence
   - Macro Economic News Clearance
   - Risk:Reward & Stop Loss Invalidation
4. Actionable Coaching in Bengali: Must be natural, professional institutional trading mentor guidance in Bengali.

=== REQUIRED JSON OUTPUT FORMAT ===
Return ONLY valid JSON matching this schema, with NO markdown backticks and NO commentary:
{
  "verdict": "GO",
  "verdictTitle": "A+ High Confluence — Favorable Execution Window",
  "confidenceScore": 8.7,
  "recommendedRiskPct": 1.0,
  "recommendedLot": "${qty} Lots",
  "checklist": [
    {"pillar": "HTF 4H/1H Alignment", "status": "PASS", "note": "Short rationale"},
    {"pillar": "PD Array (Discount/Premium)", "status": "PASS", "note": "Short rationale"},
    {"pillar": "Liquidity Sweep & Session Context", "status": "PASS", "note": "Short rationale"},
    {"pillar": "Macro Economic News Clearance", "status": "PASS", "note": "Short rationale"},
    {"pillar": "Risk:Reward & Stop Placement", "status": "PASS", "note": "Short rationale"}
  ],
  "keyStrengths": [
    "Specific positive confluence factor 1",
    "Specific positive confluence factor 2"
  ],
  "edgeRisks": [
    "Critical vulnerability or what could go wrong scenario 1",
    "Critical vulnerability 2"
  ],
  "invalidationLevel": ${sl},
  "mentorNoteBengali": "Clear institutional trading advice in Bengali advising the trader how to handle execution and emotional discipline"
}
`;

  // 6. Invoke Gemini API
  const candidateModels = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-flash-latest"];
  let rawResponse = "";

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(9000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 3000,
            responseMimeType: "application/json",
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (rawResponse) break;
      }
    } catch {
      // try fallback model
    }
  }

  if (!rawResponse) {
    return NextResponse.json(
      { error: "AI Pre-Trade Validator failed to respond. Please check API key." },
      { status: 500 }
    );
  }

  try {
    const firstBrace = rawResponse.indexOf("{");
    const lastBrace = rawResponse.lastIndexOf("}");
    const jsonStr = firstBrace !== -1 && lastBrace !== -1 ? rawResponse.slice(firstBrace, lastBrace + 1) : rawResponse;
    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Failed to parse Gemini validation JSON:", err, rawResponse);
    return NextResponse.json(
      { error: "Invalid JSON response from AI validator." },
      { status: 500 }
    );
  }
}
