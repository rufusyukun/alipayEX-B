import { NextResponse } from "next/server";
import { getOrder, toPublicOrder } from "@/lib/recharge-store";

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

    return NextResponse.json(toPublicOrder(order));
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
