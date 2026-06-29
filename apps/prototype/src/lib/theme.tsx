"use client";

import { createTheme, MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

const theme = createTheme({
  /** Pink color palette */
  colors: {
    pink: [
      "#fff4fa", // 0 - softest
      "#ffe0f0", // 1
      "#ffc0de", // 2
      "#ff9ec7", // 3
      "#fa75ad", // 4
      "#ef3b91", // 5 - main pink
      "#e82780", // 6 - strong
      "#cf116a", // 7
      "#a80a54", // 8
      "#860741", // 9 - darkest
    ],
    ink: [
      "#f5f0f5", // 0
      "#e0d5e2", // 1
      "#c0aec3", // 2
      "#9b7f9f", // 3
      "#7a5b7e", // 4
      "#543156", // 5
      "#3d203f", // 6
      "#261928", // 7 - main ink
      "#1c101d", // 8
      "#0f080f", // 9
    ],
  },

  primaryColor: "pink",
  primaryShade: { light: 5, dark: 4 },

  defaultRadius: "md",

  fontFamily: '"Geist", "Microsoft YaHei", "PingFang SC", Arial, sans-serif',
  fontFamilyMonospace: 'Consolas, "SFMono-Regular", "Microsoft YaHei", monospace',

  headings: {
    fontFamily: '"Geist", "Microsoft YaHei", "PingFang SC", Arial, sans-serif',
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

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      {children}
    </MantineProvider>
  );
}
