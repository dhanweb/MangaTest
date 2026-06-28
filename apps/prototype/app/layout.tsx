import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ComicWeb Prototype",
  description: "Interactive MangaTest prototype with mock data"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
