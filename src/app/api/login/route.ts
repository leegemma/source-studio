import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

const LoginRequest = z.object({
  password: z.string(),
});

export const AUTH_COOKIE = "site_auth";

const tokenFor = (password: string) => crypto.createHash("sha256").update(password).digest("hex");

export async function POST(req: Request) {
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) {
    return NextResponse.json(
      { type: "error", message: "SITE_PASSWORD가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const body = LoginRequest.safeParse(await req.json());
  if (!body.success || body.data.password !== sitePassword) {
    return NextResponse.json({ type: "error", message: "비밀번호가 틀렸습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ type: "success", data: null });
  res.cookies.set(AUTH_COOKIE, tokenFor(sitePassword), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
  return res;
}
