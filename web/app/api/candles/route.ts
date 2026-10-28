import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getCandles } from "@/lib/engine";

export async function GET(req: NextRequest) {
  // Auth check
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuth = await verifySessionToken(token);
  if (!isAuth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "XAUUSD"; // Exness symbol format
  const tf = searchParams.get("tf") || "15m";
  const limit = parseInt(searchParams.get("limit") || "500", 10);

  try {
    const candles = await getCandles(symbol, tf, limit);
    return NextResponse.json(candles);
  } catch (err: any) {
    return new NextResponse(err.message || "Failed to fetch candles", { status: 500 });
  }
}
