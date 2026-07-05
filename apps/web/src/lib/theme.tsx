"use client";

import { createTheme, MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

const theme = createTheme({
  colors: {
    pink: [
      "#fff4fa",
      "#ffe0f0",
      "#ffc0de",
      "#ff9ec7",
      "#fa75ad",
      "#ef3b91",
      "#e82780",
      "#cf116a",
      "#a80a54",
      "#860741",
    ],
    ink: [
      "#f5f0f5",
      "#e0d5e2",
      "#c0aec3",
      "#9b7f9f",
      "#7a5b7e",
      "#543156",
      "#3d203f",
      "#261928",
      "#1c101d",
      "#0f080f",
    ],
  },
  primaryColor: "pink",
  primaryShade: { light: 5, dark: 4 },
  defaultRadius: "md",
  fontFamily: 'var(--font-sans), "Microsoft YaHei", "PingFang SC", Arial, sans-serif',
  fontFamilyMonospace: 'Consolas, "SFMono-Regular", "Microsoft YaHei", monospace',
  headings: {
    fontFamily: 'var(--font-sans), "Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    sizes: {
      h1: { fontSize: "28px", lineHeight: "1.15", fontWeight: "700" },
      h2: { fontSize: "20px", lineHeight: "1.3", fontWeight: "700" },
      h3: { fontSize: "16px", lineHeight: "1.4", fontWeight: "700" },
    },
  },
  components: {
    Button: {
      defaultProps: {
        variant: "filled",
        size: "sm",
      },
    },
    Badge: {
      defaultProps: {
        variant: "outline",
        size: "md",
      },
    },
    Select: {
      defaultProps: {
        size: "sm",
      },
    },
    TextInput: {
      defaultProps: {
        size: "sm",
      },
    },
    Textarea: {
      defaultProps: {
        size: "sm",
      },
    },
    Switch: {
      defaultProps: {
        size: "md",
      },
    },
    Dialog: {
      defaultProps: {
        size: "xl",
      },
    },
  },
});

export { theme };

export function Providers({ children, themeMode }: { children: ReactNode; themeMode: "system" | "light" | "dark" }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme={themeMode === "system" ? "auto" : themeMode}>
      {children}
    </MantineProvider>
  );
}
