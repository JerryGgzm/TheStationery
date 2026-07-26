import type { Metadata } from "next";
import "./globals.css";
import ClickSound from "@/components/ClickSound";

export const metadata: Metadata = {
  title: "The Stationery — Pixel Bookshop",
  description: "A cozy pixel bookshop where you write and receive letters.",
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
