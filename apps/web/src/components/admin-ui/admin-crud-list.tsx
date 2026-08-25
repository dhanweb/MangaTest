"use client";

import { Box, Group, Pagination, Text } from "@mantine/core";
import { RefreshCw, Search } from "lucide-react";
import { useEffect } from "react";

import { clampPage } from "@/components/admin-ui/admin-list-state";
import type { AdminCrudListProps } from "@/components/admin-ui/types";
import { AppButton, AppInput, AppSelect } from "@/components/ui/app-components";

const defaultPageSizes = [10, 20, 50] as const;

export function AdminCrudList({
  search,
  filters = [],
  onRefresh,
  refreshing = false,
  primaryActions,
  batchActions,
  pagination = false,
  children,
}: AdminCrudListProps) {
  const safePagination = pagination || undefined;
  const page = safePagination ? clampPage(safePagination.page, safePagination.total, safePagination.pageSize) : 1;
  const pageSizes = safePagination
    ? [...new Set((safePagination.pageSizeOptions ?? defaultPageSizes).filter((size) => Number.isFinite(size) && size > 0))]
    : [];
  const totalPages = safePagination ? Math.max(1, Math.ceil(Math.max(0, safePagination.total) / Math.max(1, safePagination.pageSize))) : 1;

  useEffect(() => {
    if (safePagination && safePagination.page !== page) {
      safePagination.onPageChange(page);
    }
  }, [page, safePagination]);

  const handlePageSizeChange = (value: string | null) => {
    if (!safePagination || !value) {
      return;
    }

    const nextPageSize = Number(value);
    if (!Number.isFinite(nextPageSize) || nextPageSize <= 0) {
      return;
    }

    safePagination.onPageSizeChange(nextPageSize);
    safePagination.onPageChange(clampPage(safePagination.page, safePagination.total, nextPageSize));
  };

  return (
    <Box>
      <Group
        align="flex-end"
        gap="sm"
        mb="md"
        wrap="wrap"
        style={{ width: "100%" }}
      >
        {search ? (
          <Box style={{ flex: "1 1 280px", minWidth: 220 }}>
            <AppInput
              value={search.value}
              placeholder={search.placeholder}
              aria-label={search.ariaLabel}
              onChange={(event) => search.onChange(event.currentTarget.value)}
              leftSection={<Search size={15} aria-hidden="true" />}
            />
          </Box>
        ) : null}
        {filters.map((filter) => (
          <AppSelect
            key={filter.key}
            label={filter.label}
            value={filter.value}
            data={filter.options}
            clearable
            allowDeselect
            onChange={filter.onChange}
            style={{ width: filter.width ?? 150, flex: `0 1 ${filter.width ?? 150}px` }}
          />
        ))}
        {batchActions ? <Group gap="xs" wrap="nowrap">{batchActions}</Group> : null}
        {onRefresh ? (
          <AppButton
            tone="neutral"
            variant="outline"
            loading={refreshing}
            disabled={refreshing}
            leftIcon={<RefreshCw size={14} />}
            onClick={() => void onRefresh()}
          >
            刷新
          </AppButton>
        ) : null}
        {primaryActions ? <Group gap="xs" wrap="nowrap">{primaryActions}</Group> : null}
      </Group>

      {children}

      {safePagination ? (
        <Group justify="space-between" align="center" gap="md" mt="md" wrap="wrap">
          <Text size="sm" c="ink.5">共 {safePagination.total} 条</Text>
          <Group gap="sm" align="center" wrap="wrap">
            <AppSelect
              aria-label="每页条数"
              value={String(safePagination.pageSize)}
              data={pageSizes.map((size) => ({ value: String(size), label: `${size} 条/页` }))}
              onChange={handlePageSizeChange}
              style={{ width: 116 }}
            />
            <Pagination
              value={page}
              total={totalPages}
              withEdges
              onChange={safePagination.onPageChange}
            />
          </Group>
        </Group>
      ) : null}
    </Box>
  );
}
