import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "@mantine/core/styles.css";
import "./globals.css";
import { Providers } from "@/lib/theme";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "ComicWeb Prototype",
  description: "Interactive MangaTest prototype with mock data",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={geistSans.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
