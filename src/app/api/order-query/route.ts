import { NextResponse } from "next/server";
import { getOrder, toPublicOrder } from "@/lib/recharge-store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderNo = searchParams.get("orderNo");

    if (!orderNo) {
      return NextResponse.json({ error: "请输入订单号" }, { status: 400 });
    }

    const order = await getOrder(orderNo);

    if (!order) {
      return NextResponse.json({ error: "未查询到订单" }, { status: 404 });
    }

    return NextResponse.json({ order: toPublicOrder(order) });
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
