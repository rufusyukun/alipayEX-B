import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { syncRecentPendingOrders } from "@/lib/admin-sync-pending";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      source?: string;
      orderNos?: string[];
    };
    const source = body.source === "auto" ? "admin_auto_sync" : "admin_manual_sync";
    return NextResponse.json(await syncRecentPendingOrders({ source, orderNos: body.orderNos }));
  } catch (error) {
    return NextResponse.json(
      {
        error: "同步最近待支付订单失败",
        debug: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
