import { randomBytes } from "crypto";

function getOrderPrefix() {
  return process.env.ORDER_PREFIX || "B";
}

export function generateOrderNo(date = new Date()): string {
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = randomBytes(4).toString("hex").toUpperCase();

  return `${getOrderPrefix()}${timestamp}${suffix}`;
}
