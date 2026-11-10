import { NextResponse, type NextRequest } from "next/server";

// Optional bearer-token protection for the headless API. Set HEADSTART_API_TOKEN to enable.
export function middleware(req: NextRequest) {
  const token = process.env.HEADSTART_API_TOKEN;
  if (!token || req.nextUrl.pathname === "/api/health") return NextResponse.next();
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
