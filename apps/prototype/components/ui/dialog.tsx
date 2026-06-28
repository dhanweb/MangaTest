"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"
import Draggable, {
  type DraggableData,
  type DraggableEvent,
} from "react-draggable"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type DialogPoint = {
  x: number
  y: number
}

type DialogSize = {
  width: number
  height: number
}

const DialogOriginContext = React.createContext<{
  origin: DialogPoint | null
  setOrigin: React.Dispatch<React.SetStateAction<DialogPoint | null>>
} | null>(null)

function clampDialogPosition(point: DialogPoint, size: DialogSize) {
  if (typeof window === "undefined") {
    return point
  }

  const margin = 16

  return {
    x: Math.min(
      Math.max(point.x, margin),
      window.innerWidth - size.width - margin
    ),
    y: Math.min(
      Math.max(point.y, margin),
      window.innerHeight - size.height - margin
    ),
  }
}

function initialDialogPosition(origin: DialogPoint | null, size: DialogSize) {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 }
  }

  const point = origin
    ? {
        x: origin.x - size.width / 2,
        y: origin.y - size.height / 2,
      }
    : {
        x: (window.innerWidth - size.width) / 2,
        y: (window.innerHeight - size.height) / 2,
      }

  return clampDialogPosition(point, size)
}

function Dialog({
  children,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [origin, setOrigin] = React.useState<DialogPoint | null>(null)

  function handleOpenChange(open: boolean) {
    if (!open) {
      setOrigin(null)
    }
    onOpenChange?.(open)
  }

  return (
    <DialogOriginContext.Provider value={{ origin, setOrigin }}>
      <DialogPrimitive.Root
        data-slot="dialog"
        {...props}
        onOpenChange={handleOpenChange}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogOriginContext.Provider>
  )
}

function DialogTrigger({
  onPointerDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  const originContext = React.useContext(DialogOriginContext)

  function handlePointerDown(
    event: Parameters<
      NonNullable<
        React.ComponentProps<typeof DialogPrimitive.Trigger>["onPointerDown"]
      >
    >[0]
  ) {
    originContext?.setOrigin({ x: event.clientX, y: event.clientY })
    onPointerDown?.(event)
  }

  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      {...props}
      onPointerDown={handlePointerDown}
    />
  )
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  draggable = true,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  draggable?: boolean
}) {
  const originContext = React.useContext(DialogOriginContext)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [position, setPosition] = React.useState<DialogPoint | null>(null)

  const getDialogSize = React.useCallback<() => DialogSize>(() => {
    const rect = contentRef.current?.getBoundingClientRect()
    return {
      width: rect?.width ?? 640,
      height: rect?.height ?? 480,
    }
  }, [])

  React.useLayoutEffect(() => {
    setPosition(initialDialogPosition(originContext?.origin ?? null, getDialogSize()))
  }, [getDialogSize, originContext?.origin])

  function handleDrag(_event: DraggableEvent, data: DraggableData) {
    setPosition({ x: data.x, y: data.y })
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <div className="pointer-events-none fixed inset-0 z-50">
        <Draggable
          bounds="parent"
          disabled={!draggable}
          handle="[data-dialog-drag-handle]"
          nodeRef={contentRef}
          onDrag={handleDrag}
          position={position ?? { x: 0, y: 0 }}
        >
          <DialogPrimitive.Content
            ref={contentRef}
            data-slot="dialog-content"
            {...props}
            className={cn(
              "pointer-events-auto absolute top-0 left-0 z-50 grid max-h-[calc(100vh-2rem)] w-full max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              className
            )}
            style={style}
          >
            {children}
            {showCloseButton && (
              <DialogPrimitive.Close data-slot="dialog-close" asChild>
                <Button
                  variant="ghost"
                  className="absolute top-2 right-2"
                  size="icon-sm"
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogPrimitive.Close>
            )}
          </DialogPrimitive.Content>
        </Draggable>
      </div>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      data-dialog-drag-handle
      className={cn(
        "flex cursor-move flex-col gap-2 border-b bg-popover p-4 pr-12 select-none",
        className
      )}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 overflow-y-auto p-4", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
