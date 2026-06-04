import { NextResponse } from "next/server";
import { getOrder, getPaymentExpiry, toPublicOrder } from "@/lib/recharge-store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderNo = searchParams.get("order_no");

    if (!orderNo) {
      return NextResponse.json({ error: "缺少订单号" }, { status: 400 });
    }

    const order = await getOrder(orderNo);

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    const expiry = getPaymentExpiry(order);
    console.info("[payment expiry]", {
      orderNo: order.order_no,
      createdAt: expiry.createdAt,
      expiresAt: expiry.expiresAt,
      now: new Date().toISOString(),
      remainingSeconds: expiry.remainingSeconds,
      isExpired: expiry.isExpired,
    });

    return NextResponse.json(toPublicOrder(order));
  } catch (error) {
    return NextResponse.json(
      {
        error: "数据服务未配置或订单状态查询失败，请联系管理员",
        debug: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
