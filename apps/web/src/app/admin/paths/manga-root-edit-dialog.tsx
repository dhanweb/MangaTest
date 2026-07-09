"use client";

import { ActionIcon, Group, Stack, Text, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Pencil, Save } from "lucide-react";
import { useActionState } from "react";

import { AppButton, AppInput, AppModal, AppSwitch } from "@/components/ui/app-components";
import type { MangaRootWithStats } from "@/modules/library";

import { updateMangaRootAction, type SaveMangaRootState } from "./actions";

const initialState: SaveMangaRootState = {
  status: "idle",
  message: "",
};

export function MangaRootEditDialog({ root }: { root: MangaRootWithStats }) {
  const [opened, { open, close }] = useDisclosure(false);
  const [state, formAction, isPending] = useActionState(updateMangaRootAction, initialState);

  return (
    <>
      <Tooltip label="编辑路径设置" withArrow>
        <ActionIcon variant="subtle" color="ink" size="md" onClick={open} aria-label={`编辑 ${root.absolutePath}`}>
          <Pencil size={15} />
        </ActionIcon>
      </Tooltip>
      <AppModal opened={opened} onClose={close} title="编辑路径" size="lg">
        <form action={formAction}>
          <input name="mangaRootId" type="hidden" value={root.id} />
          <Stack gap="md" py="sm">
            <AppInput
              label="文件夹路径"
              value={root.absolutePath}
              readOnly
              description="MVP 阶段不在这里批量改写路径；移动漫画文件后请用文件维护里的路径修复。"
            />
            <AppInput label="描述" name="displayName" defaultValue={root.displayName ?? ""} placeholder="例如：主漫画库、下载待整理" />
            <AppSwitch name="isEnabled" label="启用扫描" defaultChecked={root.isEnabled} />
            <Group justify="flex-end" mt="sm">
              <AppButton type="submit" disabled={isPending} leftSection={<Save size={16} />}>
                {isPending ? "保存中..." : "保存"}
              </AppButton>
            </Group>
            {state.message ? (
              <Text size="sm" fw={700} c={state.status === "error" ? "red" : "pink.5"}>
                {state.message}
              </Text>
            ) : null}
          </Stack>
        </form>
      </AppModal>
    </>
  );
}
