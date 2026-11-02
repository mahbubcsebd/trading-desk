import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getPortfolioRiskShield } from "@/lib/engine";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuth = await verifySessionToken(token);
  if (!isAuth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const data = await getPortfolioRiskShield();
    return NextResponse.json(data);
  } catch (err: any) {
    return new NextResponse(err.message || "Failed to fetch Risk Shield", { status: 500 });
  }
}

