import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getSnapshot, getSettings } from "@/lib/engine";

export async function POST(req: NextRequest) {
  // 1. Verify session
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

  const { message, symbol = "XAUUSD", history = [] } = body;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  // 3. Resolve Gemini API Key
  const settings = await getSettings().catch(() => ({ balance: 10000, risk_pct: 1.0, daily_limit_pct: 3.0 }));
  const apiKey = (settings as any).gemini_api_key || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    return NextResponse.json({
      reply:
        "⚠️ **Google Gemini API Key পাওয়া যায়নি!**\n\n" +
        "AI Copilot ব্যবহার করার জন্য আপনার একটি ফ্রি Gemini API Key প্রয়োজন।\n\n" +
        "👉 **কীভাবে ফ্রিতে নিবেন (১ মিনিট সময়):**\n" +
        "1. [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) লিংকে যান (Google একাউন্ট দিয়ে সাইন ইন করুন)।\n" +
        "2. **'Create API key'** বাটনে ক্লিক করে ফ্রি কী-টি কপি করুন।\n" +
        "3. ড্যাশবোর্ডের উপরে ডানপাশে **Settings (গিয়ার আইকন)**-এ ক্লিক করে **'Gemini API Key'** বক্সে পেস্ট করে **Save** দিন।\n\n" +
        "এরপর আপনি যেকোনো মার্কেট প্রশ্ন সরাসরি করতে পারবেন!",
    });
  }

  // 4. Fetch real-time market data
  let snapshot: any = null;
  try {
    snapshot = await getSnapshot(symbol, "15m");
  } catch (err: any) {
    console.error("Failed to fetch snapshot for chat context:", err);
  }

  // 5. Construct Institutional System Prompt
  const price = snapshot?.spotPrice || snapshot?.price || 0.0;
  const setup = snapshot?.setup;
  const smc = snapshot?.smc;
  const macro = snapshot?.macro;
  const liquidity = snapshot?.liquidity;

  const systemContext = `
You are the "TradeDesk AI Copilot & Institutional Market Mentor" — an elite quantitative trading assistant powered by Smart Money Concepts (SMC), Inner Circle Trader (ICT) methodology, and institutional risk management, calibrated specifically for Exness XAU/USD (Gold) and BTC/USD.

CURRENT REAL-TIME MARKET STATE (${symbol}):
• Spot Price: $${price.toFixed(2)} (${symbol})
• 24h Change: ${snapshot?.change24hPct ?? 0}%
• Best Setup Action: ${setup?.action ?? "WAIT"} (Live Score: ${setup?.score ?? 0}/100)
• Setup Strategy: ${setup?.strategy ?? "None (Waiting for Confluence)"}
• Entry Level: $${setup?.entry ?? 0} | SL: $${setup?.sl ?? 0} | TP: $${setup?.tp ?? 0}
• Breakout Levels: Buy Trigger $${setup?.breakoutLevels?.buyTrigger ?? 0}, Sell Trigger $${setup?.breakoutLevels?.sellTrigger ?? 0}
• Exness Roadmap: Buy SL $${setup?.exness?.buySl ?? 0}, TP $${setup?.exness?.buyTp ?? 0} | Sell SL $${setup?.exness?.sellSl ?? 0}, TP $${setup?.exness?.sellTp ?? 0}

INSTITUTIONAL SMC / ICT ANALYSIS:
• Market Structure: ${smc?.structure?.trend ?? "NEUTRAL"} (${smc?.structure?.structureDetail ?? "Consolidation"})
• BOS (Break of Structure): ${smc?.structure?.bos?.status ?? "None"} (Broken: ${smc?.structure?.bos?.broken ? "YES" : "NO"})
• CHoCH (Change of Character): ${smc?.structure?.choch?.status ?? "None"} (Active: ${smc?.structure?.choch?.active ? "YES" : "NO"})
• Major Swings: High $${smc?.structure?.swingHigh ?? 0}, Low $${smc?.structure?.swingLow ?? 0}
• Bullish Order Block (Demand): $${smc?.orderBlocks?.bullishOB?.bottom ?? 0} - $${smc?.orderBlocks?.bullishOB?.top ?? 0} (${smc?.orderBlocks?.bullishOB?.status ?? "Active"})
• Bearish Order Block (Supply): $${smc?.orderBlocks?.bearishOB?.bottom ?? 0} - $${smc?.orderBlocks?.bearishOB?.top ?? 0} (${smc?.orderBlocks?.bearishOB?.status ?? "Active"})
• Fair Value Gaps (FVG): Active unmitigated count: ${smc?.orderBlocks?.activeFVGCount ?? 0}
  - Nearest Bullish FVG: $${smc?.orderBlocks?.nearestBullishFVG?.bottom ?? 0} - $${smc?.orderBlocks?.nearestBullishFVG?.top ?? 0} (${smc?.orderBlocks?.nearestBullishFVG?.mitigated ? "Mitigated" : "Fresh Unmitigated"})
  - Nearest Bearish FVG: $${smc?.orderBlocks?.nearestBearishFVG?.bottom ?? 0} - $${smc?.orderBlocks?.nearestBearishFVG?.top ?? 0} (${smc?.orderBlocks?.nearestBearishFVG?.mitigated ? "Mitigated" : "Fresh Unmitigated"})
• Liquidity Pools:
  - Buy-Side (BSL): $${smc?.liquidity?.bsl?.level ?? 0} (Distance: $${smc?.liquidity?.bsl?.distance ?? 0})
  - Sell-Side (SSL): $${smc?.liquidity?.ssl?.level ?? 0} (Distance: $${smc?.liquidity?.ssl?.distance ?? 0})
  - Turtle Soup / Judas Sweep: ${smc?.liquidity?.sweep?.desc ?? "None"}
• Premium vs Discount (PD Array):
  - 50% Equilibrium Price: $${smc?.pdArray?.equilibrium ?? 0}
  - Current Range Location: ${smc?.pdArray?.currentPercent ?? 50}% in range -> Zone: ${smc?.pdArray?.zone ?? "EQUILIBRIUM"}
  - Rule: ${smc?.pdArray?.actionHint ?? "Wait for expansion"}
  - OTE Long Fib Zone: $${smc?.pdArray?.oteLong?.bottom ?? 0} - $${smc?.pdArray?.oteLong?.top ?? 0}
• ICT Session & Killzone:
  - Active Session: ${smc?.killzone?.sessionName ?? "Ambient"} (${smc?.killzone?.timeString ?? ""})
  - Killzone Active: ${smc?.killzone?.isKillzone ? "YES" : "NO"}
  - AMD Phase: ${smc?.killzone?.phase ?? "Consolidation"}

MACRO RADAR & NEWS (Forex Factory):
• News Risk Window Active: ${macro?.news?.isNewsWindow ? "YES - SPREAD WARNING!" : "NO"}
• Warning: ${macro?.news?.warning ?? "None"}
• Next USD High/Med Impact Event: ${macro?.news?.nextEvent?.title ?? "None scheduled"} in ${macro?.news?.nextEvent?.minutesUntil ?? "--"}m (${macro?.news?.nextEvent?.timeString ?? ""})
• US Dollar Index (DXY): $${macro?.dxy?.price ?? 0} (${macro?.dxy?.change24h ?? 0}%) | Bias: ${macro?.dxy?.bias ?? "neutral"}
• Gold Macro Impact: ${macro?.dxy?.goldImpact ?? "Neutral"}
• Multi-Timeframe Alignment: ${macro?.mtf?.alignment ?? "Consolidation"} (Score: ${macro?.mtf?.score ?? 0}%)

RISK MANAGEMENT PARAMETERS:
• User Account Balance: $${settings?.balance ?? 10000}
• Risk Per Trade: ${settings?.risk_pct ?? 1.0}% ($${((settings?.balance ?? 10000) * ((settings?.risk_pct ?? 1.0) / 100)).toFixed(2)})
• Recommended Exness Lot Size: ${smc?.risk?.lotSize ?? 0.01} Lots
• Stop Loss Distance: ±$${smc?.risk?.slPoints ?? 2.5}
• Daily Limit Breached: ${snapshot?.dailyLimitHit ? "YES - TRADING BLOCKED" : "NO - SAFE"}

YOUR BEHAVIOR & RULES:
1. Always communicate in the user's preferred language (Bangla / Banglish if user writes in Bangla, or English if user writes in English). Speak naturally, professionally, and encouragingly like an expert proprietary firm trading mentor.
2. Directly answer the user's question using the REAL live market state given above.
3. If the user asks whether to BUY or SELL:
   - Check if the market is in Premium or Discount. Never recommend buying in Premium or selling in Discount.
   - Check if red-folder news is imminent.
   - Explain what the Best Setup score is and why (e.g. why WAIT or why BUY).
   - Emphasize strict risk management (1% risk, lot size, stop loss).
4. Format your output with clean GitHub markdown, bullet points, and bold text for clarity.
5. End with a brief institutional rule of thumb or reminder.
`;

  // 6. Format chat history for Gemini API
  const contents = [];
  for (const item of history.slice(-6)) {
    contents.push({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }],
    });
  }
  contents.push({
    role: "user",
    parts: [{ text: message }],
  });

  // 7. Call Gemini API (with resilient model fallback)
  const candidateModels = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest"];
  let replyText = "";
  let lastErrorStatus = 0;
  let lastErrorMessage = "";

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const geminiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: systemContext }],
          },
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1200,
          },
        }),
      });

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        replyText =
          data.candidates?.[0]?.content?.parts?.[0]?.text ||
          "দুঃখিত, কোনো উত্তর পাওয়া যায়নি। দয়া করে আবার প্রশ্ন করুন।";
        break;
      } else {
        lastErrorStatus = geminiRes.status;
        lastErrorMessage = await geminiRes.text();
        console.warn(`Gemini model ${model} failed with ${geminiRes.status}, trying next fallback...`);
      }
    } catch (err: any) {
      console.warn(`Gemini model ${model} network error:`, err?.message);
    }
  }

  if (replyText) {
    return NextResponse.json({ reply: replyText });
  }

  return NextResponse.json({
    reply: `⚠️ Google Gemini API Error (${lastErrorStatus}): আপনার API Key সঠিক কি না নিশ্চিত করুন। Settings থেকে নতুন API Key বসিয়ে আবার চেষ্টা করতে পারেন।`,
  });
}

