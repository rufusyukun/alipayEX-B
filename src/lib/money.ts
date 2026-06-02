export function yuanToCents(value: string | number): number {
  const normalized = String(value).trim();

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return 0;
  }

  const [yuan, fraction = ""] = normalized.split(".");
  return Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToYuan(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("cents must be an integer");
  }

  return (cents / 100).toFixed(2);
}
