"use client";

import { Group, Stack } from "@mantine/core";
import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { AppButton, AppInput } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";

import { saveMangaRootAction, type SaveMangaRootState } from "./actions";

const initialState: SaveMangaRootState = {
  status: "idle",
  message: "",
};

export function MangaRootForm() {
  const [state, formAction, isPending] = useActionState(saveMangaRootAction, initialState);
  const lastMessageRef = useRef("");

  useEffect(() => {
    if (!state.message || state.message === lastMessageRef.current) {
      return;
    }
    lastMessageRef.current = state.message;
    if (state.status === "error") {
      toast.error(state.message);
    } else if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state.message, state.status]);

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
      </Stack>
    </form>
  );
}
