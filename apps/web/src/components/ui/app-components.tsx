"use client";

import {
  Select as MantineSelect,
  type SelectProps,
  Switch as MantineSwitch,
  type SwitchProps,
  Tabs as MantineTabs,
  Textarea as MantineTextarea,
  type TextareaProps,
  TextInput as MantineTextInput,
  type TextInputProps,
  Title as MantineTitle,
  type TitleProps,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppButton } from "@/components/ui/app-button";

export {
  AppButton,
  AppLinkButton,
  AppIconButton,
  toneToMantineColor,
  type AppButtonProps,
  type AppButtonStyleProps,
  type AppIconButtonProps,
  type AppLinkButtonProps,
} from "@/components/ui/app-button";
export { AppTag, AppBadge, type AppTagProps, type AppTagVariant, type LegacyAppBadgeProps } from "@/components/ui/app-tag";
export {
  AppModal,
  AppModalFooter,
  DraggableModal,
  type AppModalProps,
  type AppModalSize,
  type LegacyDraggableModalProps,
} from "@/components/ui/app-modal";
export { AppConfirmProvider, AppConfirmDialog, useAppConfirm, type Confirm, type ConfirmOptions } from "@/components/ui/app-confirm-dialog";

type AppLinkProps = Omit<import("@/components/ui/app-button").AppButtonProps, "component" | "href" | "children" | "variant"> & {
  href: string;
  variant?: "filled" | "outline" | "text";
  children: ReactNode;
};

/** @deprecated Use AppLinkButton for typed button navigation. */
export function AppLink({ href, variant = "text", children, ...props }: AppLinkProps) {
  return (
    <AppButton
      component={Link}
      href={href}
      variant={variant === "text" ? "transparent" : variant}
      {...(variant === "text" ? { p: 0, styles: { root: { fontWeight: 700 } } } : {})}
      {...props}
    >
      {children}
    </AppButton>
  );
}

export function AppSelect(props: SelectProps) {
  return (
    <MantineSelect
      comboboxProps={{ withinPortal: false }}
      styles={{
        input: {
          borderColor: "var(--mantine-color-pink-2)",
          borderRadius: "var(--mantine-radius-md)",
        },
        dropdown: {
          borderColor: "var(--mantine-color-pink-2)",
          borderRadius: "var(--mantine-radius-md)",
        },
      }}
      classNames={{ input: "app-select-input", option: "app-select-option" }}
      {...props}
    />
  );
}

export function AppInput(props: TextInputProps) {
  return (
    <MantineTextInput
      styles={{
        input: {
          borderColor: "var(--mantine-color-pink-2)",
          borderRadius: "var(--mantine-radius-md)",
        },
      }}
      classNames={{ input: "app-input" }}
      {...props}
    />
  );
}

export function AppTextarea(props: TextareaProps) {
  return (
    <MantineTextarea
      styles={{
        input: {
          borderColor: "var(--mantine-color-pink-2)",
          borderRadius: "var(--mantine-radius-md)",
        },
      }}
      classNames={{ input: "app-textarea" }}
      {...props}
    />
  );
}

export function AppSwitch(props: SwitchProps) {
  return (
    <MantineSwitch
      color="pink.5"
      styles={{
        track: { cursor: "pointer" },
        thumb: { cursor: "pointer" },
        label: { cursor: "pointer" },
      }}
      {...props}
    />
  );
}

export { useDisclosure as useAppModal };
export const AppTabs = MantineTabs;

type AppTitleProps = TitleProps & { children: ReactNode };

export function AppTitle({ order = 1, children, ...props }: AppTitleProps) {
  return (
    <MantineTitle order={order} c="pink.5" {...props}>
      {children}
    </MantineTitle>
  );
}
