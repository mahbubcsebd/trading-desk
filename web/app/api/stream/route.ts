import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getEngineStreamUrl, getEngineKey } from "@/lib/engine";

export async function GET(req: NextRequest) {
  // Verify session cookie first
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuth = await verifySessionToken(token);
  if (!isAuth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "XAUUSD"; // Exness default
  const tf = searchParams.get("tf") || "15m";

  const engineUrl = getEngineStreamUrl(symbol, tf);
  const engineKey = getEngineKey();

  try {
    const engineRes = await fetch(engineUrl, {
      headers: {
        "X-Engine-Key": engineKey,
      },
      signal: req.signal,
      cache: "no-store",
    });

    if (!engineRes.ok || !engineRes.body) {
      return new NextResponse("Engine stream error", { status: engineRes.status });
    }

    // Pipe engine stream to client
    return new Response(engineRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return new NextResponse("Stream connection failed", { status: 502 });
  }
}
