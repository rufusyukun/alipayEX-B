import { NextResponse } from "next/server";
import { generateOrderNo } from "@/lib/order";
import { createRechargeOrder } from "@/lib/recharge-store";

type CreateRechargeBody = {
  amount?: unknown;
  phone?: unknown;
};

function parseAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").trim());

  if (!Number.isFinite(amount)) {
    return null;
  }

  return amount;
}

function errorResponse(message: string, debug: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      message,
      debug,
    },
    { status },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as CreateRechargeBody | null;
    const amount = parseAmount(body?.amount);
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

    if (amount === null) {
      return errorResponse("创建订单失败，请稍后重试", "amount is not a number");
    }

    if (amount < 1) {
      return errorResponse("创建订单失败，请稍后重试", "amount must be at least 1");
    }

    if (phone && !/^1\d{10}$/.test(phone)) {
      return errorResponse("创建订单失败，请稍后重试", "invalid optional phone");
    }

    const amountCents = Math.round(amount * 100);
    const orderNo = generateOrderNo();
    const order = await createRechargeOrder({
      orderNo,
      amountCents,
      phone: phone || null,
      request,
    });

    return NextResponse.json({
      ok: true,
      orderNo: order.order_no,
      amount,
    });
  } catch (error) {
    console.error("create recharge order api failed", error);
    return errorResponse(
      "创建订单失败，请稍后重试",
      error instanceof Error ? error.message : "unknown error",
      500,
    );
  }
}
