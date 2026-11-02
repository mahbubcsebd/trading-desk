import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getNewsSpikeGuard } from "@/lib/engine";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuth = await verifySessionToken(token);
  if (!isAuth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "XAUUSD";

  try {
    const data = await getNewsSpikeGuard(symbol);
    return NextResponse.json(data);
  } catch (err: any) {
    return new NextResponse(err.message || "Failed to fetch News Spike Guard", { status: 500 });
  }
}
