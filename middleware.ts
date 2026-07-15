import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "site_auth";

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;
  // 비밀번호 미설정(로컬 개발 등)이면 게이트를 건너뛴다.
  if (!sitePassword) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const expected = await sha256Hex(sitePassword);
  if (token === expected) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
