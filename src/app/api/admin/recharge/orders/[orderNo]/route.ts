import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getOrderDetail, SupportStatus, updateSupport } from "@/lib/recharge-store";

type RouteContext = {
  params: Promise<{
    orderNo: string;
  }>;
};

const supportStatuses = ["unprocessed", "processing", "completed", "disputed"];

export async function GET(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { orderNo } = await context.params;
    const detail = await getOrderDetail(orderNo);

    if (!detail) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    return NextResponse.json(detail);
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

export async function PATCH(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      support_status?: unknown;
      support_note?: unknown;
    } | null;
    const supportStatus =
      typeof body?.support_status === "string" && supportStatuses.includes(body.support_status)
        ? (body.support_status as SupportStatus)
        : undefined;
    const supportNote = typeof body?.support_note === "string" ? body.support_note : null;
    const { orderNo } = await context.params;
    const order = await updateSupport(orderNo, {
      support_status: supportStatus,
      support_note: supportNote,
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    return NextResponse.json({ order });
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
