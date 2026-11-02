import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getJudasRadar, getAllJudasRadars } from "@/lib/engine";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuth = await verifySessionToken(token);
  if (!isAuth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const all = searchParams.get("all") === "true";

  try {
    if (all) {
      const data = await getAllJudasRadars();
      return NextResponse.json(data);
    }
    const data = await getJudasRadar(symbol || "XAUUSD");
    return NextResponse.json(data);
  } catch (err: any) {
    return new NextResponse(err.message || "Failed to fetch Judas Radar", { status: 500 });
  }
}
