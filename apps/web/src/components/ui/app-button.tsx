"use client";

import {
  ActionIcon,
  Button,
  Tooltip,
  type ActionIconProps,
  type ButtonProps,
  type MantineColor,
  type PolymorphicComponentProps,
} from "@mantine/core";
import Link, { type LinkProps } from "next/link";
import type { ReactElement, ReactNode } from "react";

import type { AppButtonVariant, AppControlSize, AppTone } from "@/components/admin-ui/types";

export { type AppButtonVariant, type AppControlSize, type AppTone } from "@/components/admin-ui/types";

export const toneToMantineColor: Record<AppTone, string> = {
  primary: "pink",
  neutral: "gray",
  success: "green",
  warning: "yellow",
  danger: "red",
  info: "blue",
};

export type AppButtonStyleProps = {
  tone?: AppTone;
  variant?: AppButtonVariant;
  size?: AppControlSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

type CompatibilityButtonVariant = AppButtonVariant | "default" | "white" | "gradient" | "text";
type CompatibilityButtonSize = AppControlSize | `compact-${AppControlSize}`;
type CompatibilityComponent = typeof Link | "a";
type CompatibilityLinkButtonProps = Omit<PolymorphicComponentProps<typeof Link, ButtonProps>, "component" | "href" | "target" | "rel">;
type CompatibilityAnchorButtonProps = Omit<PolymorphicComponentProps<"a", ButtonProps>, "component" | "href" | "target" | "rel">;

export type AppButtonProps = Omit<
  PolymorphicComponentProps<"button", ButtonProps>,
  "color" | "variant" | "size" | "leftSection" | "rightSection" | "component" | "ref"
> &
  Omit<AppButtonStyleProps, "variant" | "size"> & {
    /** @deprecated Use tone. Kept while feature call sites migrate. */
    color?: MantineColor;
    /** @deprecated Use leftIcon. */
    leftSection?: ReactNode;
    /** @deprecated Use rightIcon. */
    rightSection?: ReactNode;
    /** @deprecated Use AppLinkButton for typed navigation. */
    component?: CompatibilityComponent;
    /** @deprecated Navigation props are kept for the compatibility wrapper. */
    href?: LinkProps["href"];
    target?: string;
    rel?: string;
    /** @deprecated Use AppButtonVariant values; legacy values are translated. */
    variant?: CompatibilityButtonVariant;
    /** @deprecated Use AppControlSize values; compact Mantine sizes remain supported during migration. */
    size?: CompatibilityButtonSize;
  };

function normalizeVariant(variant: CompatibilityButtonVariant): AppButtonVariant {
  if (variant === "text") {
    return "transparent";
  }
  if (variant === "default") {
    return "outline";
  }
  if (variant === "white" || variant === "gradient") {
    return "filled";
  }
  return variant;
}

export function AppButton({
  tone,
  color,
  variant = "filled",
  size = "sm",
  leftIcon,
  rightIcon,
  leftSection,
  rightSection,
  component,
  href,
  target,
  rel,
  children,
  ...props
}: AppButtonProps) {
  const resolvedColor = tone ? toneToMantineColor[tone] : color ?? toneToMantineColor.primary;

  const buttonProps = {
    color: resolvedColor,
    variant: normalizeVariant(variant),
    size,
    leftSection: leftIcon ?? leftSection,
    rightSection: rightIcon ?? rightSection,
    ...props,
  };

  if (component === Link) {
    return (
      <Button<typeof Link>
        component={Link}
        href={href ?? "/"}
        target={target}
        rel={rel}
        {...(buttonProps as CompatibilityLinkButtonProps)}
      >
        {children}
      </Button>
    );
  }

  if (component === "a") {
    return (
      <Button<"a">
        component="a"
        href={typeof href === "string" ? href : undefined}
        target={target}
        rel={rel}
        {...(buttonProps as CompatibilityAnchorButtonProps)}
      >
        {children}
      </Button>
    );
  }

  return <Button {...buttonProps}>{children}</Button>;
}

export type AppLinkButtonProps = Omit<AppButtonProps, "component" | "href" | "children"> & {
  href: LinkProps["href"];
  children: ReactNode;
};

export function AppLinkButton({ href, children, ...props }: AppLinkButtonProps) {
  return (
    <AppButton component={Link} href={href} {...props}>
      {children}
    </AppButton>
  );
}

export type AppIconButtonProps = Omit<
  PolymorphicComponentProps<"button", ActionIconProps>,
  "aria-label" | "color" | "size" | "variant" | "children" | "component"
> & {
  label: string;
  tooltip?: string;
  tone?: AppTone;
  size?: AppControlSize;
  variant?: Exclude<AppButtonVariant, "transparent">;
  children: ReactElement;
};

export function AppIconButton({ label, tooltip, tone = "neutral", variant = "subtle", children, ...props }: AppIconButtonProps) {
  const action = (
    <ActionIcon
      aria-label={label}
      title={tooltip ?? label}
      color={toneToMantineColor[tone]}
      variant={variant}
      {...props}
    >
      {children}
    </ActionIcon>
  );

  return tooltip ? <Tooltip label={tooltip}>{action}</Tooltip> : action;
}
