import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true });
}
