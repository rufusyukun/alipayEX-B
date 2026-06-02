import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "alipayEX",
  description: "Independent recharge and payment center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
