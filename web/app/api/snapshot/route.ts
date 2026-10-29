import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getSnapshot } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuth = await verifySessionToken(token);
  if (!isAuth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "XAUUSD";
  const tf = searchParams.get("tf") || "15m";

  try {
    const data = await getSnapshot(symbol, tf);
    return NextResponse.json(data);
  } catch (err: any) {
    return new NextResponse(err.message || "Failed to fetch snapshot", { status: 500 });
  }
}
