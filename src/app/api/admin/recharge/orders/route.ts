import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { listOrders, PaymentStatus, SupportStatus } from "@/lib/recharge-store";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const orders = await listOrders({
      orderNo: searchParams.get("orderNo") || undefined,
      phone: searchParams.get("phone") || undefined,
      paymentStatus: (searchParams.get("paymentStatus") || "all") as PaymentStatus | "all",
      supportStatus: (searchParams.get("supportStatus") || "all") as SupportStatus | "all",
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
    });

    return NextResponse.json({ orders });
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
