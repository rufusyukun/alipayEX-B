import { NextResponse } from "next/server";
import { markMockPaid } from "@/lib/recharge-store";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "生产环境不允许 mock 支付" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { order_no?: unknown } | null;

  if (typeof body?.order_no !== "string" || body.order_no.length === 0) {
    return NextResponse.json({ error: "缺少订单号" }, { status: 400 });
  }

  const order = await markMockPaid(body.order_no, body);

  if (!order) {
    return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  }

  return NextResponse.json({
    order_no: order.order_no,
    paid: true,
    status: order.payment_status,
    paid_at: order.paid_at,
    mock_trade_no: order.mock_trade_no,
  });
}
