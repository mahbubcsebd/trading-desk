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
You are the "TradeDesk AI Copilot & Senior Institutional Trading Desk Head" — an elite quantitative trading mentor powered by Smart Money Concepts (SMC), Inner Circle Trader (ICT) methodology, multi-timeframe orderflow, and strict proprietary firm risk management, calibrated specifically for Exness XAU/USD (Gold) and BTC/USD.

CURRENT REAL-TIME MARKET STATE (${symbol}):
• Live Spot Price: $${price.toFixed(2)} (${symbol})
• 24h Change: ${snapshot?.change24hPct ?? 0}%
• Automated Scanner State: ${setup?.action ?? "WAIT"} (Score: ${setup?.score ?? 0}/100)
• Algorithmic Strategy: ${setup?.strategy ?? "Consolidation / Range"}
• Scanner Levels: Entry $${setup?.entry ?? 0} | SL $${setup?.sl ?? 0} | TP $${setup?.tp ?? 0}
• Breakout Trigger Levels: Buy Trigger $${setup?.breakoutLevels?.buyTrigger ?? 0} | Sell Trigger $${setup?.breakoutLevels?.sellTrigger ?? 0}
• Exness Volatility Levels: Buy SL $${setup?.exness?.buySl ?? 0}, TP $${setup?.exness?.buyTp ?? 0} | Sell SL $${setup?.exness?.sellSl ?? 0}, TP $${setup?.exness?.sellTp ?? 0}

INSTITUTIONAL SMC & ICT ANALYSIS MATRIX:
• Market Structure (15m/1h): ${smc?.structure?.trend ?? "NEUTRAL"} (${smc?.structure?.structureDetail ?? "Consolidation"})
• BOS (Break of Structure): ${smc?.structure?.bos?.status ?? "None"} (Broken: ${smc?.structure?.bos?.broken ? "YES" : "NO"})
• CHoCH (Change of Character): ${smc?.structure?.choch?.status ?? "None"} (Active: ${smc?.structure?.choch?.active ? "YES" : "NO"})
• Key Swings: Swing High $${smc?.structure?.swingHigh ?? 0} | Swing Low $${smc?.structure?.swingLow ?? 0}
• Bullish Order Block (Demand Zone): $${smc?.orderBlocks?.bullishOB?.bottom ?? 0} - $${smc?.orderBlocks?.bullishOB?.top ?? 0} (${smc?.orderBlocks?.bullishOB?.status ?? "Active"})
• Bearish Order Block (Supply Zone): $${smc?.orderBlocks?.bearishOB?.bottom ?? 0} - $${smc?.orderBlocks?.bearishOB?.top ?? 0} (${smc?.orderBlocks?.bearishOB?.status ?? "Active"})
• Fair Value Gaps (FVG) [Unmitigated Imbalance]:
  - Nearest Bullish FVG (Demand): $${smc?.orderBlocks?.nearestBullishFVG?.bottom ?? 0} - $${smc?.orderBlocks?.nearestBullishFVG?.top ?? 0} (${smc?.orderBlocks?.nearestBullishFVG?.mitigated ? "Mitigated" : "Fresh Unmitigated"})
  - Nearest Bearish FVG (Supply): $${smc?.orderBlocks?.nearestBearishFVG?.bottom ?? 0} - $${smc?.orderBlocks?.nearestBearishFVG?.top ?? 0} (${smc?.orderBlocks?.nearestBearishFVG?.mitigated ? "Mitigated" : "Fresh Unmitigated"})
• Liquidity Pools & Sweeps:
  - Buy-Side Liquidity (BSL / Equal Highs): $${smc?.liquidity?.bsl?.level ?? 0} (Distance: $${smc?.liquidity?.bsl?.distance ?? 0})
  - Sell-Side Liquidity (SSL / Equal Lows): $${smc?.liquidity?.ssl?.level ?? 0} (Distance: $${smc?.liquidity?.ssl?.distance ?? 0})
  - Turtle Soup / Judas Liquidity Sweep: ${smc?.liquidity?.sweep?.desc ?? "No active sweep"}
• Premium vs Discount (PD Array & Fibonacci):
  - 50% Equilibrium Level: $${smc?.pdArray?.equilibrium ?? 0}
  - Current Range Location: ${smc?.pdArray?.currentPercent ?? 50}% -> Zone: ${smc?.pdArray?.zone ?? "EQUILIBRIUM"}
  - OTE (Optimal Trade Entry 62-79% Fib) Long Zone: $${smc?.pdArray?.oteLong?.bottom ?? 0} - $${smc?.pdArray?.oteLong?.top ?? 0}
• ICT Session & Killzone:
  - Current Session: ${smc?.killzone?.sessionName ?? "Ambient"} (${smc?.killzone?.timeString ?? ""})
  - Killzone Status: ${smc?.killzone?.isKillzone ? "🔥 ACTIVE HIGH-VOLATILITY KILLZONE" : "Standard Ambient Hours"}
  - AMD Cycle: ${smc?.killzone?.phase ?? "Consolidation"}

MACRO & FOREX FACTORY NEWS RADAR:
• Red-Folder / High-Impact News Window: ${macro?.news?.isNewsWindow ? "⚠️ ACTIVE NEWS WINDOW - HIGH SPREAD RISK" : "Normal Market Conditions"}
• Warning: ${macro?.news?.warning ?? "None"}
• Next USD Event: ${macro?.news?.nextEvent?.title ?? "None scheduled"} in ${macro?.news?.nextEvent?.minutesUntil ?? "--"}m (${macro?.news?.nextEvent?.timeString ?? ""})
• US Dollar Index (DXY): $${macro?.dxy?.price ?? 0} (${macro?.dxy?.change24h ?? 0}%) | Bias: ${macro?.dxy?.bias ?? "neutral"}
• Gold / USD Impact: ${macro?.dxy?.goldImpact ?? "Neutral"}
• Multi-Timeframe Alignment: ${macro?.mtf?.alignment ?? "Consolidation"} (Score: ${macro?.mtf?.score ?? 0}%)

RISK & ACCOUNT PARAMETERS:
• Trader Account Balance: $${settings?.balance ?? 10000}
• Max Risk Per Trade (1% Rule): $${((settings?.balance ?? 10000) * ((settings?.risk_pct ?? 1.0) / 100)).toFixed(2)} (${settings?.risk_pct ?? 1.0}%)
• Recommended Exness Lot Size: ${smc?.risk?.lotSize ?? 0.01} Lots
• Technical Invalidation SL Buffer: ±$${smc?.risk?.slPoints ?? 2.5}

CORE RULES FOR YOUR RESPONSE (READ CAREFULLY):
1. **LANGUAGE**: Always respond in natural, professional Bengali (বাংলা) combined with standard English trading terminology (Order Block, FVG, Liquidity, Stop Loss, Take Profit, Breakout, Entry). Speak like an authoritative yet friendly proprietary trading mentor.

2. **CRITICAL - AVOID THE "JUST WAIT" TRAP**:
   - The automated scanner action often shows "WAIT" because it only fires during the exact seconds a candle closes outside extreme Donchian channels.
   - **DO NOT simply tell the user "Wait, do not trade" and stop!** Traders need actionable trade setups and exact scenarios.
   - Even when market conditions are consolidating or the scanner is on "WAIT", you must ALWAYS provide **TWO CLEAR CONDITIONAL TRADE ROADMAPS (Bullish Plan & Bearish Plan)** with EXACT PRICE LEVELS!

3. **STRUCTURE OF YOUR ANSWER**:
   Format every analysis with clean, professional sections:
   - **🎯 বর্তমান মার্কেট বায়াস ও তাৎক্ষণিক সিদ্ধান্ত (Market Bias & Instant Verdict)**:
     Summarize structure (${smc?.structure?.trend}), DXY impact, and whether entering immediately or waiting for a specific trigger level is optimal.
   - **🟢 বুলিশ ট্রেড সেটআপ (Buy Roadmap)**:
     - এন্ট্রি কন্ডিশন (Entry Condition & Exact Trigger Price): e.g. Pullback to Bullish OB $... or Breakout above $...
     - ইনভ্যালিডেশন / স্টপলস (Stop Loss): $...
     - টার্গেট (TP1 & TP2): $... & $... (Liquidity / BSL)
     - Risk-to-Reward (R:R): e.g. 1:2.5+
   - **🔴 বিয়ারিশ ট্রেড সেটআপ (Sell Roadmap)**:
     - এন্ট্রি কন্ডিশন (Entry Condition & Exact Trigger Price): e.g. Rejection at Supply OB $... or Breakdown below $...
     - ইনভ্যালিডেশন / স্টপলস (Stop Loss): $...
     - টার্গেট (TP1 & TP2): $... & $... (SSL / Demand)
     - Risk-to-Reward (R:R): e.g. 1:2.0+
   - **📊 গুরুত্বপূর্ণ প্রাইস লেভেল (Key Levels Table or Bullets)**:
     Support OB, Resistance OB, FVG, BSL, SSL with exact numbers.
   - **🛡️ এক্সনেস রিস্ক ম্যানেজমেন্ট (Risk Execution)**:
     Lot Size: **${smc?.risk?.lotSize ?? 0.01} Lot**, Max Risk: **$${((settings?.balance ?? 10000) * ((settings?.risk_pct ?? 1.0) / 100)).toFixed(2)}**.

4. **FORMATTING**:
   - Use clean Markdown with headers, bold text, emoji bullets, and concise tables where appropriate.
   - Do NOT use raw code dumps unless explaining a mathematical calculation. Keep it visually sharp, readable, and structured.
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

