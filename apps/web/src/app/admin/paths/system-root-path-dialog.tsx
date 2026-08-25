"use client";

import { ActionIcon, Stack, Text, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { FolderPen } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { AppButton, AppInput, AppModal } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import type { MangaRootWithStats } from "@/modules/library";

import { relocateSystemMangaRootAction, type SaveMangaRootState } from "./actions";

const initialState: SaveMangaRootState = {
  status: "idle",
  message: "",
};

type Step = "edit" | "confirm";

export function SystemRootPathDialog({ root }: { root: MangaRootWithStats }) {
  const [opened, { open, close }] = useDisclosure(false);
  const [step, setStep] = useState<Step>("edit");
  const [nextAbsolutePath, setNextAbsolutePath] = useState(root.absolutePath);
  const [state, formAction, isPending] = useActionState(relocateSystemMangaRootAction, initialState);
  const lastMessageRef = useRef("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.message || state.message === lastMessageRef.current) {
      return;
    }
    lastMessageRef.current = state.message;
    if (state.status === "error") {
      toast.error(state.message);
    } else if (state.status === "success") {
      toast.success(state.message);
      close();
    }
  }, [close, state.message, state.status]);

  function handleClose() {
    if (isPending) return;
    close();
  }

  function handleOpen() {
    setStep("edit");
    setNextAbsolutePath(root.absolutePath);
    open();
  }

  function goConfirm() {
    const trimmed = nextAbsolutePath.trim();
    if (!trimmed) {
      toast.error("请输入新的绝对路径。");
      return;
    }
    if (trimmed === root.absolutePath) {
      toast.error("新路径不能与当前路径相同。");
      return;
    }
    setStep("confirm");
  }

  function submitMoveFiles(moveFiles: boolean) {
    const form = formRef.current;
    if (!form) return;
    const moveInput = form.elements.namedItem("moveFiles") as HTMLInputElement | null;
    if (moveInput) {
      moveInput.value = moveFiles ? "true" : "false";
    }
    form.requestSubmit();
  }

  if (root.kind !== "system") {
    return null;
  }

  return (
    <>
      <Tooltip label="修改系统默认目录路径" withArrow>
        <ActionIcon
          variant="subtle"
          color="pink"
          size="md"
          onClick={handleOpen}
          aria-label={`修改系统路径 ${root.absolutePath}`}
        >
          <FolderPen size={15} />
        </ActionIcon>
      </Tooltip>

      <AppModal
        opened={opened}
        onClose={handleClose}
        title={step === "edit" ? "修改系统默认目录路径" : "是否移动目录内的漫画？"}
        size="lg"
        draggable
        bodyMaxHeight="calc(100dvh - 180px)"
        footer={step === "edit" ? (
          <>
            <AppButton type="button" variant="outline" disabled={isPending} onClick={handleClose}>
              取消
            </AppButton>
            <AppButton type="button" disabled={isPending} onClick={goConfirm}>
              下一步
            </AppButton>
          </>
        ) : (
          <>
            <AppButton type="button" variant="outline" disabled={isPending} onClick={() => setStep("edit")}>
              返回
            </AppButton>
            <AppButton type="button" variant="outline" disabled={isPending} loading={isPending} onClick={() => submitMoveFiles(false)}>
              否，只改路径
            </AppButton>
            <AppButton type="button" color="red" disabled={isPending} loading={isPending} onClick={() => submitMoveFiles(true)}>
              是，移动文件
            </AppButton>
          </>
        )}
      >
        <form ref={formRef} action={formAction}>
          <input name="mangaRootId" type="hidden" value={root.id} />
          <input name="nextAbsolutePath" type="hidden" value={nextAbsolutePath.trim()} />
          <input name="moveFiles" type="hidden" defaultValue="false" />

          {step === "edit" ? (
            <Stack gap="md" py="sm">
              <AppInput label="描述" value="系统默认目录" readOnly description="固定名称，不可修改。" />
              <AppInput label="当前路径" value={root.absolutePath} readOnly />
              <AppInput
                label="新路径"
                description="必须是绝对路径。系统目录仅支持修改路径（可选择是否移动文件）。"
                value={nextAbsolutePath}
                onChange={(event) => setNextAbsolutePath(event.currentTarget.value)}
                placeholder="例如 D:\MangaLibrary"
              />
              <Text size="sm" c="ink.5">
                下一步会询问是否把目录内的漫画一起移动到新路径。用户添加的其它根目录不受影响。
              </Text>
            </Stack>
          ) : (
            <Stack gap="md" py="sm">
              <Text size="sm" c="ink.6">
                即将把系统默认目录从：
              </Text>
              <Text size="sm" fw={700} style={{ wordBreak: "break-all" }}>
                {root.absolutePath}
              </Text>
              <Text size="sm" c="ink.6">
                改为：
              </Text>
              <Text size="sm" fw={700} style={{ wordBreak: "break-all" }}>
                {nextAbsolutePath.trim()}
              </Text>
              <Text size="sm" c="ink.5">
                选择「是，移动文件」会把当前目录下的漫画子项物理移动到新路径，并更新库内相关路径。
                选择「否，只改路径」只改数据库记录，文件仍留在旧目录（可能显示为缺失）。
              </Text>
              <Text size="sm" c="ink.5">
                关联漫画约 {root.comicCount} 本。目标目录在移动时必须为空。
              </Text>
            </Stack>
          )}
        </form>
      </AppModal>
    </>
  );
}
