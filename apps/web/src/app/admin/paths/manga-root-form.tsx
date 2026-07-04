"use client";

import { Group, Stack, Text } from "@mantine/core";
import { Plus } from "lucide-react";
import { useActionState } from "react";

import { AppButton, AppInput } from "@/components/ui/app-components";

import { saveMangaRootAction, type SaveMangaRootState } from "./actions";

const initialState: SaveMangaRootState = {
  status: "idle",
  message: "",
};

export function MangaRootForm() {
  const [state, formAction, isPending] = useActionState(saveMangaRootAction, initialState);

  return (
    <form action={formAction}>
      <Stack gap="md" py="sm">
        <AppInput
          label="文件夹路径"
          name="absolutePath"
          placeholder="D:\\Comics\\Manga 或 \\\\NAS\\shared\\comics"
          description="必须使用绝对路径。系统不会自动创建父目录。"
        />
        <AppInput label="描述（可选）" name="displayName" placeholder="例如：主漫画库、下载待整理" />
        <Group justify="flex-end" mt="sm">
          <AppButton type="submit" disabled={isPending} leftSection={<Plus size={16} />}>
            {isPending ? "保存中..." : "添加"}
          </AppButton>
        </Group>
        {state.message ? (
          <Text size="sm" fw={700} c={state.status === "error" ? "red" : "pink.5"}>
            {state.message}
          </Text>
        ) : null}
      </Stack>
    </form>
  );
}
