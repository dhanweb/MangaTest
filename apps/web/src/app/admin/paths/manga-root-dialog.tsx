"use client";

import { Modal } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Plus } from "lucide-react";

import { AppButton } from "@/components/ui/app-components";

import { MangaRootForm } from "./manga-root-form";

export function MangaRootDialog() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <AppButton leftSection={<Plus size={16} />} onClick={open}>
        添加路径
      </AppButton>
      <Modal
        opened={opened}
        onClose={close}
        title="添加路径"
        size="lg"
        styles={{
          title: { fontWeight: 700, fontSize: "18px" },
          header: { borderBottom: "1px solid var(--mantine-color-pink-1)" },
        }}
      >
        <MangaRootForm />
      </Modal>
    </>
  );
}
