import type { Metadata } from "next";

import "@mantine/core/styles.css";
import "./globals.css";
import { PinnedActions } from "@/components/pinned-actions";
import { Providers } from "@/lib/theme";
import { getRuntimeSettings } from "@/modules/core/settings";

export const metadata: Metadata = {
  title: "MangaTest",
  description: "Local self-hosted manga library",
  icons: {
    icon: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getRuntimeSettings();

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers themeMode={settings.themeMode}>
          {children}
          <PinnedActions />
        </Providers>
      </body>
    </html>
  );
}
