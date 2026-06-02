import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_COOKIE_NAME = "alipayex_admin";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export function verifyAdminPassword(password: string | null | undefined): boolean {
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return false;
  }

  return password === expected;
}

function getSecret() {
  return process.env.ADMIN_PASSWORD || "";
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function createAdminSessionToken() {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  const secret = getSecret();

  if (!secret || !token) {
    return false;
  }

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) {
    return false;
  }

  const ageSeconds = (Date.now() - Number(issuedAt)) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) {
    return false;
  }

  const expected = sign(issuedAt);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function getAdminCookieName() {
  return ADMIN_COOKIE_NAME;
}

export function getAdminSessionMaxAge() {
  return SESSION_MAX_AGE_SECONDS;
}

export function isAdminRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );

  return verifyAdminSessionToken(cookies[ADMIN_COOKIE_NAME]);
}
