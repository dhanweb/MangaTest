"use client";

import { Badge, type MantineColor } from "@mantine/core";
import { X } from "lucide-react";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

import type { AppControlSize, AppTone } from "@/components/admin-ui/types";
import { AppIconButton, toneToMantineColor } from "@/components/ui/app-button";

export type AppTagVariant = "soft" | "outline" | "filled";

type AppTagBaseProps = {
  children: ReactNode;
  tone?: AppTone;
  variant?: AppTagVariant;
  size?: Extract<AppControlSize, "xs" | "sm" | "md">;
  icon?: ReactNode;
  interactive?: boolean;
  onRemove?: never;
  removeLabel?: never;
  className?: string;
  style?: React.CSSProperties;
};

type AppTagRemoveProps = {
  onRemove: () => void;
  removeLabel: string;
};

type AppTagTargetProps =
  | { href: string; onClick?: never }
  | { href?: never; onClick?: MouseEventHandler<HTMLButtonElement> };

export type AppTagProps = (AppTagBaseProps | (Omit<AppTagBaseProps, "onRemove" | "removeLabel"> & AppTagRemoveProps)) & AppTagTargetProps;

export function AppTag({
  children,
  tone = "neutral",
  variant = "soft",
  size = "sm",
  icon,
  interactive = false,
  onRemove,
  removeLabel,
  href,
  onClick,
  className,
  style,
}: AppTagProps) {
  const isInteractive = interactive || Boolean(href) || Boolean(onClick) || Boolean(onRemove);
  const badgeVariant = variant === "soft" ? "light" : variant;
  const removeButton = onRemove ? (
    <AppIconButton
      label={removeLabel}
      tooltip={removeLabel}
      tone={tone}
      variant="subtle"
      size="xs"
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    >
      <X size={12} aria-hidden="true" />
    </AppIconButton>
  ) : undefined;

  const commonProps = {
    color: toneToMantineColor[tone],
    variant: badgeVariant,
    size,
    leftSection: icon,
    rightSection: removeButton,
    className,
    style: {
      textTransform: "none" as const,
      fontWeight: 600,
      cursor: isInteractive ? "pointer" : "default",
      transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
      ...style,
    },
    styles: {
      root: isInteractive
        ? {
            "&:hover": {
              backgroundColor: "var(--mantine-color-pink-1)",
              borderColor: "var(--mantine-color-pink-3)",
            },
          }
        : undefined,
    },
  };

  if (href) {
    return <Badge component={Link} href={href} {...commonProps}>{children}</Badge>;
  }

  if (onClick) {
    return <Badge component="button" type="button" onClick={onClick} {...commonProps}>{children}</Badge>;
  }

  return <Badge component="span" {...commonProps}>{children}</Badge>;
}

export type LegacyAppBadgeProps = {
  children: ReactNode;
  color?: MantineColor;
  variant?: "outline" | "light" | "filled";
  size?: Extract<AppControlSize, "xs" | "sm" | "md">;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/** @deprecated Use AppTag with semantic tone and icon props. */
export function AppBadge({ children, color = "pink", variant = "outline", size = "sm", leftSection, rightSection, ...props }: LegacyAppBadgeProps) {
  return (
    <Badge
      color={color}
      variant={variant}
      size={size}
      leftSection={leftSection}
      rightSection={rightSection}
      {...props}
      styles={{
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
      }}
    >
      {children}
    </Badge>
  );
}
