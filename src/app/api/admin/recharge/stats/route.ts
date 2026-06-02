import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getStats } from "@/lib/recharge-store";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getStats());
  } catch (error) {
    return NextResponse.json(
      {
        error: "数据库未配置，请联系管理员",
        debug: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
