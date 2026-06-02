import { NextResponse } from "next/server";
import {
  createAdminSessionToken,
  getAdminCookieName,
  getAdminSessionMaxAge,
  verifyAdminPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!verifyAdminPassword(password)) {
    return NextResponse.json({ error: "后台密码错误" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAdminCookieName(), createAdminSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getAdminSessionMaxAge(),
  });

  return response;
}
