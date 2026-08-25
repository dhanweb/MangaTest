import type { ReactNode } from "react";

export type AppTone = "primary" | "neutral" | "success" | "warning" | "danger" | "info";
export type AppControlSize = "xs" | "sm" | "md" | "lg";
export type AppButtonVariant = "filled" | "light" | "outline" | "subtle" | "transparent";

export type AdminTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T, rowIndex: number) => ReactNode;
  width?: number | string;
  minWidth?: number | string;
  align?: "left" | "center" | "right";
  fixed?: "left" | "right";
  wrap?: boolean;
  headerLabel?: string;
};

export type AdminTableSelection<T> = {
  selectedKeys: ReadonlySet<string>;
  onSelectedKeysChange: (keys: Set<string>) => void;
  isRowSelectable?: (row: T) => boolean;
  getCheckboxLabel: (row: T) => string;
};

export type AdminDataTableProps<T> = {
  rows: readonly T[];
  columns: readonly AdminTableColumn<T>[];
  getRowKey: (row: T) => string;
  rowNumber?: false | { page: number; pageSize: number; header?: ReactNode };
  selection?: AdminTableSelection<T>;
  loading?: boolean;
  empty?: ReactNode;
  minWidth?: number;
  onRowClick?: (row: T) => void;
  ariaLabel?: string;
};

export type AdminListFilter = {
  key: string;
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | null) => void;
  width?: number;
};

export type AdminListPagination = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
};

export type AdminCrudListProps = {
  search?: { value: string; onChange: (value: string) => void; placeholder: string; ariaLabel: string };
  filters?: readonly AdminListFilter[];
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  primaryActions?: ReactNode;
  batchActions?: ReactNode;
  pagination?: false | AdminListPagination;
  children: ReactNode;
};
