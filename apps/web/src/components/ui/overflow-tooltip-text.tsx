"use client";

import { Text, Tooltip, type TextProps } from "@mantine/core";
import type { ReactNode } from "react";

export type OverflowTooltipTextProps = Omit<TextProps, "children"> & {
  children: ReactNode;
  tooltip?: ReactNode;
};

export function OverflowTooltipText({ children, tooltip = children, ...props }: OverflowTooltipTextProps) {
  return (
    <Tooltip label={tooltip} disabled={tooltip === null || tooltip === undefined || tooltip === ""} withArrow>
      <Text truncate {...props}>{children}</Text>
    </Tooltip>
  );
}
