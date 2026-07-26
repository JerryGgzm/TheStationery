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
