"use client";

import { Center, Stack, Text, type MantineSpacing } from "@mantine/core";
import type { ReactNode } from "react";

export type AppEmptyStateProps = {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  minHeight?: number | string;
  padding?: MantineSpacing;
};

export function AppEmptyState({
  title = "暂无数据",
  description,
  icon,
  action,
  minHeight = 160,
  padding = "xl",
}: AppEmptyStateProps) {
  return (
    <Center mih={minHeight} p={padding}>
      <Stack align="center" gap="xs" ta="center">
        {icon ? <Text c="ink.4" lh={1}>{icon}</Text> : null}
        <Text fw={700} c="ink.6">{title}</Text>
        {description ? <Text size="sm" c="ink.5" maw={480}>{description}</Text> : null}
        {action}
      </Stack>
    </Center>
  );
}
