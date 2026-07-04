"use client";

import {
  Badge as MantineBadge,
  Button as MantineButton,
  Modal as MantineModal,
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

// Mantine polymorphic components expose interaction props through the final
// rendered element. Keep this wrapper permissive to match the prototype API.
type AppButtonProps = {
  variant?: string;
  children: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export function AppButton({ variant = "filled", children, ...props }: AppButtonProps) {
  return (
    <MantineButton variant={variant} {...props}>
      {children}
    </MantineButton>
  );
}

type AppLinkProps = {
  href: string;
  variant?: "filled" | "outline" | "text";
  children: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export function AppLink({ href, variant = "text", children, ...props }: AppLinkProps) {
  if (variant === "filled" || variant === "outline") {
    return (
      <MantineButton component={Link} href={href} variant={variant} {...props}>
        {children}
      </MantineButton>
    );
  }

  return (
    <MantineButton
      component={Link}
      href={href}
      variant="transparent"
      c="pink.5"
      p={0}
      styles={{ root: { fontWeight: 700, "&:hover": { color: "var(--mantine-color-pink-6)" } } }}
      {...props}
    >
      {children}
    </MantineButton>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AppBadge({ children, ...props }: { children: ReactNode; [key: string]: any }) {
  return (
    <MantineBadge
      variant="outline"
      color="pink.5"
      size="sm"
      styles={{
        root: {
          border: "1px solid var(--mantine-color-pink-2)",
          textTransform: "none",
          fontWeight: 600,
        },
      }}
      {...props}
    >
      {children}
    </MantineBadge>
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
          "&:focus, &:focus-within": { borderColor: "var(--mantine-color-pink-5)" },
        },
        dropdown: {
          borderColor: "var(--mantine-color-pink-2)",
          borderRadius: "var(--mantine-radius-md)",
        },
        option: {
          "&[data-combobox-selected]": {
            background: "var(--mantine-color-pink-0)",
            color: "var(--mantine-color-pink-5)",
          },
          "&:hover": {
            background: "var(--mantine-color-pink-1)",
          },
        },
      }}
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
          "&:focus": { borderColor: "var(--mantine-color-pink-5)" },
        },
      }}
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
          "&:focus": { borderColor: "var(--mantine-color-pink-5)" },
        },
      }}
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

type AppModalProps = {
  opened: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
} & React.ComponentProps<typeof MantineModal>;

export function AppModal({ opened, onClose, title, children, ...props }: AppModalProps) {
  return (
    <MantineModal
      opened={opened}
      onClose={onClose}
      title={title}
      size="xl"
      styles={{
        title: { fontWeight: 700, fontSize: "18px" },
        header: { borderBottom: "1px solid var(--mantine-color-pink-1)" },
      }}
      {...props}
    >
      {children}
    </MantineModal>
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
