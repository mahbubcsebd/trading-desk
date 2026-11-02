import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getSettings } from "@/lib/engine";

export async function POST(req: NextRequest) {
  // 1. Authenticate
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuth = await verifySessionToken(token);
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { trade } = body;
  if (!trade || !trade.symbol || !trade.entry) {
    return NextResponse.json({ error: "Trade details are required" }, { status: 400 });
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

  // 4. Construct System Prompt & Trade Context
  const isWin = (trade.pnlUsd || 0) >= 0;
  const rMult = trade.rMultiple || 0;
  const slDistance = Math.abs(trade.entry - trade.sl);
  const exitDistance = Math.abs(trade.exit - trade.entry);

  const prompt = `
You are the "TradeDesk Senior Institutional Trading Auditor & Head Risk Officer".
You are auditing a closed trade executed on Exness MT5 by a quantitative SMC / ICT trader.

=== CLOSED TRADE AUDIT DATA ===
- Symbol / Pair: ${trade.symbol}
- Direction: ${trade.side}
- Entry Price: ${trade.entry}
- Exit Price: ${trade.exit}
- Stop Loss: ${trade.sl} (Distance: ${slDistance})
- Position Size: ${trade.qty} Lots
- Realized Net PnL: $${trade.pnlUsd}
- Realized R-Multiple: ${rMult}R (${isWin ? "WIN" : "LOSS"})
- Trader Execution Notes: "${trade.notes || "No notes entered."}"
- Closed At: ${trade.closedAt ? new Date(trade.closedAt).toISOString() : "Recent"}

=== INSTITUTIONAL AUDITING CRITERIA ===
1. Risk:Reward Discipline: Did the setup offer >= 1:2 R:R? Was the loss strictly capped at <= -1.0R (meaning SL was not moved or widened)?
2. Execution Quality: Did the entry target an Order Block, FVG, or Liquidity sweep, or was it a chase?
3. Trade Outcome & Psychology: If it was a win, did they hold to target or exit out of fear? If it was a loss, was it an acceptable controlled market test or a revenge trade?
4. Grade assignment:
   - "A+": Flawless SMC discipline, R:R >= 2.5R, strict SL, patient execution.
   - "A": High-quality execution, SL respected, clean R-multiple.
   - "B": Acceptable trade, minor imperfections (e.g. slight late entry, early take profit).
   - "C": Weak trade, sub-par R:R (< 1.5R) or minor discipline slip.
   - "F": Rule violation (e.g. no stop loss, overleveraged, revenge trade).

=== REQUIRED JSON OUTPUT FORMAT ===
You MUST return ONLY valid JSON matching this schema, with NO markdown backticks and NO commentary outside the JSON:
{
  "grade": "A+",
  "score": 92,
  "verdict": "Short punchy headline summary of this trade's execution",
  "executionCategory": "DISCIPLINED",
  "checklist": [
    {"item": "Risk:Reward >= 1:2 Minimum", "passed": true, "note": "Short explanation"},
    {"item": "Stop Loss Discipline & Invalidation", "passed": true, "note": "Short explanation"},
    {"item": "Position Sizing & Lot Control", "passed": true, "note": "Short explanation"},
    {"item": "SMC Order Block / FVG / Killzone Confluence", "passed": true, "note": "Short explanation"}
  ],
  "whatWentRight": [
    "Specific positive discipline point 1",
    "Specific positive discipline point 2"
  ],
  "mistakesOrRisks": [
    "Specific risk or improvement point 1"
  ],
  "mentorAdvice": "Actionable institutional advice in Bengali for the trader's next execution",
  "psychologyInsight": "Deep trading psychology and emotional management observation in Bengali"
}
`;

  // 5. Call Gemini API
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
      // try next model
    }
  }

  if (!rawResponse) {
    return NextResponse.json(
      { error: "Gemini API failed to generate audit. Please try again." },
      { status: 500 }
    );
  }

  // 6. Parse JSON safely
  try {
    const firstBrace = rawResponse.indexOf("{");
    const lastBrace = rawResponse.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = rawResponse.substring(firstBrace, lastBrace + 1);
      const auditData = JSON.parse(jsonStr);
      return NextResponse.json({ audit: auditData });
    }
    const cleaned = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    const auditData = JSON.parse(cleaned);
    return NextResponse.json({ audit: auditData });
  } catch (err: any) {
    console.error("Failed to parse Gemini audit JSON. Raw was:", rawResponse, err);
    return NextResponse.json(
      { error: "Could not parse AI audit response into structured JSON", raw: rawResponse },
      { status: 500 }
    );
  }
}
