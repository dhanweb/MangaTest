import type { Metadata } from "next";

import "@mantine/core/styles.css";
import "./globals.css";
import { PinnedActions } from "@/components/pinned-actions";
import { Providers } from "@/lib/theme";

export const metadata: Metadata = {
  title: "MangaTest",
  description: "Local self-hosted manga library",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          {children}
          <PinnedActions />
        </Providers>
      </body>
    </html>
  );
}
