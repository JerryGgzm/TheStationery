import type { Metadata } from "next";
import "./globals.css";
import ClickSound from "@/components/ClickSound";

export const metadata: Metadata = {
  title: "见信 · The Stationery",
  description:
    "见信 — 一间安静的像素书店，写下并等待值得等候的信。A quiet pixel bookshop for letters worth the waiting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Handwriting fonts for letter text: Caveat (Latin) + Ma Shan Zheng (CJK brush). */}
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&family=Ma+Shan+Zheng&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClickSound />
        {children}
      </body>
    </html>
  );
}
