import type { Metadata } from "next";
import "./globals.css";
import ClickSound from "@/components/ClickSound";

export const metadata: Metadata = {
  title: "The Stationery — Pixel Bookshop",
  description: "Asset & scene preview harness for the pixel bookshop letter community.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <ClickSound />
        {children}
      </body>
    </html>
  );
}
