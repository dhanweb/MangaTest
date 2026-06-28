import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans"
});

export const metadata: Metadata = {
  title: "ComicWeb Prototype",
  description: "Interactive MangaTest prototype with mock data"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={cn(geistSans.variable)}>
      <body>{children}</body>
    </html>
  );
}
