"use client";

import { Box, Modal, Text, type MantineSpacing, type ModalProps as MantineModalProps } from "@mantine/core";
import { DraggableCore, type DraggableData } from "react-draggable";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type AppModalSize = "sm" | "md" | "lg" | "xl" | "fullscreen";

export type AppModalProps = Omit<MantineModalProps, "children" | "title" | "size" | "styles" | "onClose" | "fullScreen"> & {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: AppModalSize;
  draggable?: boolean;
  preventClose?: boolean;
  bodyPadding?: MantineSpacing;
};

type ModalPosition = { x: number; y: number };

const initialPosition: ModalPosition = { x: 0, y: 0 };

export function AppModal({
  opened,
  onClose,
  title,
  description,
  headerExtra,
  children,
  footer,
  size = "md",
  draggable = false,
  preventClose = false,
  bodyPadding,
  withCloseButton = true,
  withOverlay = true,
  overlayProps,
  closeButtonProps,
  centered = true,
  ...props
}: AppModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ModalPosition>(initialPosition);
  const [canDrag, setCanDrag] = useState(false);
  const modalId = useId();
  const descriptionId = description ? `${modalId.replace(/:/g, "")}-description` : undefined;
  const rootSize = size === "fullscreen" ? "100%" : size;

  useEffect(() => {
    if (!draggable) {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateDragAvailability = () => {
      setCanDrag(mediaQuery.matches);
      if (!mediaQuery.matches) {
        setPosition(initialPosition);
      }
    };

    updateDragAvailability();
    mediaQuery.addEventListener("change", updateDragAvailability);
    return () => mediaQuery.removeEventListener("change", updateDragAvailability);
  }, [draggable]);

  const handleClose = () => {
    if (!preventClose) {
      setPosition(initialPosition);
      onClose();
    }
  };

  const handleDrag = (_event: MouseEvent, data: DraggableData) => {
    setPosition((current) => ({ x: current.x + data.deltaX, y: current.y + data.deltaY }));
  };

  const contentStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    maxHeight: size === "fullscreen" ? "100dvh" : "calc(100dvh - 32px)",
    overflow: "hidden",
    transform: position.x || position.y ? `translate3d(${position.x}px, ${position.y}px, 0)` : undefined,
  };

  const content = (
    <Modal.Content
      ref={contentRef}
      aria-describedby={descriptionId}
      style={contentStyle}
    >
      <Modal.Header
        className={draggable && canDrag ? "app-modal__header" : undefined}
        style={{
          flex: "0 0 auto",
          borderBottom: "1px solid var(--mantine-color-pink-1)",
          cursor: draggable && canDrag ? "move" : undefined,
          userSelect: draggable && canDrag ? "none" : undefined,
        }}
      >
        <Box style={{ minWidth: 0, flex: "1 1 auto" }}>
          <Modal.Title style={{ fontWeight: 700, fontSize: "18px" }}>{title}</Modal.Title>
          {description ? <Text id={descriptionId} size="sm" c="ink.5" mt={3}>{description}</Text> : null}
        </Box>
        {headerExtra}
        {withCloseButton ? <Modal.CloseButton aria-label="关闭弹窗" {...closeButtonProps} /> : null}
      </Modal.Header>
      <Modal.Body
        p={bodyPadding}
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        {children}
      </Modal.Body>
      {footer ? <AppModalFooter>{footer}</AppModalFooter> : null}
    </Modal.Content>
  );

  return (
    <Modal.Root
      {...props}
      opened={opened}
      onClose={handleClose}
      centered={centered}
      size={rootSize}
      fullScreen={size === "fullscreen"}
      closeOnClickOutside={preventClose ? false : props.closeOnClickOutside}
      closeOnEscape={preventClose ? false : props.closeOnEscape}
    >
      {withOverlay ? <Modal.Overlay {...overlayProps} /> : null}
      {draggable && canDrag ? (
        <DraggableCore
          handle=".app-modal__header"
          cancel="input, textarea, button, select, option, a, [role='button'], [data-no-drag]"
          nodeRef={contentRef}
          onDrag={handleDrag}
        >
          {content}
        </DraggableCore>
      ) : content}
    </Modal.Root>
  );
}

export function AppModalFooter({ children }: { children: ReactNode }) {
  return (
    <Box
      component="footer"
      className="app-modal__footer"
      style={{
        display: "flex",
        flex: "0 0 auto",
        flexWrap: "nowrap",
        justifyContent: "flex-end",
        gap: "var(--mantine-spacing-sm)",
        overflowX: "auto",
        borderTop: "1px solid var(--mantine-color-pink-1)",
        padding: "var(--mantine-spacing-md)",
      }}
      >
        <style>{`
          .app-modal__footer > * { flex: 0 0 auto; }
          .app-modal__footer button { flex-shrink: 0; }
        `}</style>
        {children}
      </Box>
  );
}

export type LegacyDraggableModalProps = AppModalProps & {
  /** @deprecated AppModal owns the structural styles. */
  styles?: MantineModalProps["styles"];
};

/** @deprecated Use AppModal with draggable when desktop dragging is needed. */
export function DraggableModal({ styles, ...props }: LegacyDraggableModalProps) {
  void styles;
  return <AppModal {...props} draggable />;
}
