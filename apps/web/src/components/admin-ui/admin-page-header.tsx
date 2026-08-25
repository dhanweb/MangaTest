"use client";

import { Box, Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export type AdminPageHeaderProps = {
  title: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function AdminPageHeader({ title, icon, description, actions }: AdminPageHeaderProps) {
  return (
    <Group mb="lg" justify="space-between" align="flex-start" wrap="wrap" gap="md">
      <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
        {icon ? <Box c="pink.5" style={{ flex: "0 0 auto" }}>{icon}</Box> : null}
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Title order={1} size="xl" c="ink.8">{title}</Title>
          {description ? <Text size="sm" c="ink.5">{description}</Text> : null}
        </Stack>
      </Group>
      {actions ? <Group gap="xs">{actions}</Group> : null}
    </Group>
  );
}
