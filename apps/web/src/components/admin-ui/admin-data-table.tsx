"use client";

import { Box, Checkbox, Skeleton, Table, Text } from "@mantine/core";
import type { CSSProperties, MouseEvent } from "react";

import { getRowNumber, getSelectablePageKeys, togglePageSelection } from "@/components/admin-ui/admin-list-state";
import type { AdminDataTableProps, AdminTableColumn } from "@/components/admin-ui/types";
import { AppEmptyState } from "@/components/ui/empty-state";

type TableColumn<T> = AdminTableColumn<T> & { special?: "selection" | "rowNumber" };

function numericWidth(width: number | string | undefined, key: string): number {
  if (typeof width === "number" && Number.isFinite(width) && width > 0) {
    return width;
  }

  if (typeof width === "string" && /^\d+(?:\.\d+)?px$/.test(width)) {
    return Number.parseFloat(width);
  }

  if (process.env.NODE_ENV !== "production") {
    throw new Error(`AdminDataTable fixed column "${key}" must provide a numeric width or a pixel width.`);
  }

  return 0;
}

function knownWidth(width: number | string | undefined): number {
  if (typeof width === "number" && Number.isFinite(width) && width > 0) {
    return width;
  }
  if (typeof width === "string" && /^\d+(?:\.\d+)?px$/.test(width)) {
    return Number.parseFloat(width);
  }
  return 0;
}

function columnWidth(column: TableColumn<unknown>): CSSProperties["width"] {
  return typeof column.width === "number" ? `${column.width}px` : column.width;
}

function fixedOffsets<T>(columns: readonly TableColumn<T>[]) {
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  let leftOffset = 0;
  let rightOffset = 0;

  for (const column of columns) {
    if (column.fixed === "left") {
      left.set(column.key, leftOffset);
    }
    leftOffset += knownWidth(column.width ?? column.minWidth);
  }

  for (const column of [...columns].reverse()) {
    if (column.fixed === "right") {
      right.set(column.key, rightOffset);
      rightOffset += numericWidth(column.width ?? column.minWidth, column.key);
    }
  }

  return { left, right };
}

function cellStyle<T>(column: TableColumn<T>, offsets: ReturnType<typeof fixedOffsets<T>>, isHeader: boolean, rightBoundary: boolean): CSSProperties {
  const style: CSSProperties = {
    textAlign: column.align,
    width: columnWidth(column as TableColumn<unknown>),
    minWidth: column.minWidth,
    whiteSpace: column.wrap === false ? "nowrap" : undefined,
  };

  if (column.fixed) {
    style.position = "sticky";
    style.zIndex = isHeader ? 4 : 2;
    if (column.fixed === "left") {
      style.left = offsets.left.get(column.key);
    } else {
      style.right = offsets.right.get(column.key);
      if (rightBoundary) {
        style.boxShadow = "-8px 0 12px -12px rgba(61, 32, 63, 0.45)";
      }
    }
  }

  return style;
}

export function AdminDataTable<T>({
  rows,
  columns,
  getRowKey,
  rowNumber = false,
  selection,
  loading = false,
  empty,
  minWidth = 760,
  onRowClick,
  ariaLabel = "后台数据表格",
}: AdminDataTableProps<T>) {
  const renderedColumns: TableColumn<T>[] = [
    ...(selection
      ? [{ key: "__selection", header: "选择", headerLabel: "选择当前页", cell: () => null, width: 52, fixed: "left" as const, special: "selection" as const }]
      : []),
    ...(rowNumber
      ? [{ key: "__row-number", header: rowNumber.header ?? "序号", cell: () => null, width: 64, fixed: undefined, special: "rowNumber" as const }]
      : []),
    ...columns,
  ];
  const offsets = fixedOffsets(renderedColumns);
  const selectable = selection ? (row: T) => selection.isRowSelectable?.(row) ?? true : undefined;
  const selectableKeys = selection ? getSelectablePageKeys(rows, getRowKey, selectable) : [];
  const selectedCurrentPageKeys = selection ? selectableKeys.filter((key) => selection.selectedKeys.has(key)) : [];
  const allSelected = selectableKeys.length > 0 && selectedCurrentPageKeys.length === selectableKeys.length;
  const partiallySelected = selectedCurrentPageKeys.length > 0 && !allSelected;
  const dataMinWidth = Math.max(minWidth, renderedColumns.reduce((total, column) => total + knownWidth(column.width ?? column.minWidth), 0));

  const updateCurrentPageSelection = (selected: boolean) => {
    selection?.onSelectedKeysChange(togglePageSelection(selection.selectedKeys, selectableKeys, selected));
  };

  const isRightBoundary = (column: TableColumn<T>, index: number) => column.fixed === "right" && renderedColumns[index + 1]?.fixed !== "right";

  return (
    <Box style={{ minWidth: 0, overflowX: "auto" }}>
      <Table
        aria-label={ariaLabel}
        highlightOnHover
        striped
        withTableBorder={false}
        verticalSpacing="sm"
        horizontalSpacing="md"
        style={{ minWidth: dataMinWidth, tableLayout: "fixed" }}
      >
        <Table.Thead>
          <Table.Tr>
            {renderedColumns.map((column, index) => {
              const style = cellStyle(column, offsets, true, isRightBoundary(column, index));
              return (
                  <Table.Th
                    key={column.key}
                    className={column.fixed ? "admin-data-table__fixed-cell admin-data-table__fixed-cell--header" : undefined}
                    style={style}
                    aria-label={column.headerLabel}
                  >
                  {column.special === "selection" && selection ? (
                    <Checkbox
                      aria-label="选择当前页全部可选行"
                      checked={allSelected}
                      indeterminate={partiallySelected}
                      disabled={selectableKeys.length === 0}
                      onChange={(event) => updateCurrentPageSelection(event.currentTarget.checked)}
                    />
                  ) : column.header}
                </Table.Th>
              );
            })}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading
            ? Array.from({ length: Math.min(Math.max(rows.length, 3), 6) }, (_, rowIndex) => (
                <Table.Tr key={`loading-${rowIndex}`}>
                  {renderedColumns.map((column) => <Table.Td key={column.key}><Skeleton height={16} radius="sm" /></Table.Td>)}
                </Table.Tr>
              ))
            : rows.length === 0
              ? <Table.Tr><Table.Td colSpan={renderedColumns.length}>{empty ?? <AppEmptyState title="暂无数据" />}</Table.Td></Table.Tr>
              : rows.map((row, rowIndex) => {
                  const rowKey = getRowKey(row);
                  const rowSelected = selection?.selectedKeys.has(rowKey) ?? false;
                  const rowSelectable = selection ? selectable?.(row) ?? true : true;
                  const rowClick = onRowClick
                    ? (event: MouseEvent<HTMLTableRowElement>) => {
                        const target = event.target as HTMLElement;
                        if (!target.closest("a,button,input,select,textarea")) {
                          onRowClick(row);
                        }
                      }
                    : undefined;

                  return (
                    <Table.Tr
                      key={rowKey}
                      className="admin-data-table__row"
                      data-selected={rowSelected || undefined}
                      onClick={rowClick}
                      style={{ cursor: onRowClick ? "pointer" : undefined }}
                    >
                      {renderedColumns.map((column, columnIndex) => {
                        const style = cellStyle(column, offsets, false, isRightBoundary(column, columnIndex));
                        return (
                          <Table.Td
                            key={column.key}
                            className={column.fixed ? "admin-data-table__fixed-cell" : undefined}
                            style={style}
                          >
                            {column.special === "selection" && selection ? (
                              <Checkbox
                                aria-label={selection.getCheckboxLabel(row)}
                                checked={rowSelected}
                                disabled={!rowSelectable}
                                onChange={(event) => selection.onSelectedKeysChange(togglePageSelection(selection.selectedKeys, [rowKey], event.currentTarget.checked))}
                              />
                            ) : column.special === "rowNumber" && rowNumber ? (
                              <Text size="sm" c="ink.5">{getRowNumber(rowIndex, rowNumber.page, rowNumber.pageSize)}</Text>
                            ) : column.cell(row, rowIndex)}
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  );
                })}
        </Table.Tbody>
      </Table>
      <style>{`
        .admin-data-table__fixed-cell { background: var(--mantine-color-white); }
        .admin-data-table__fixed-cell--header { background: var(--mantine-color-pink-0); }
        .admin-data-table__row:hover .admin-data-table__fixed-cell { background: var(--mantine-color-pink-0); }
        .admin-data-table__row[data-selected="true"] .admin-data-table__fixed-cell { background: var(--mantine-color-pink-1); }
      `}</style>
    </Box>
  );
}
