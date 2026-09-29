import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/shared/lib/utils"

// 關掉 vaul 內建的 repositionInputs：它在 iOS Safari 叫出鍵盤時會把抽屜縮高度但留下空隙，
// 改由 DrawerContent 依 visualViewport 自行貼齊鍵盤上緣（見 useVisualViewportFit）。
function Drawer({
  repositionInputs = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" repositionInputs={repositionInputs} {...props} />
}

// 行動裝置叫出軟鍵盤時，iOS Safari 的行為不固定：有時 layout viewport 不變、鍵盤直接蓋住底部，
// 有時連 layout viewport（innerHeight）一起縮小。vh/dvh 都不會跟著鍵盤變，所以改用實測值：
//   - inset：可見區域下緣距 layout viewport 底部的距離（鍵盤蓋住的部分），抽屜 bottom 貼這裡
//   - maxHeight：可見高度與 layout 高度取小者，抽屜不得超過，否則頂部標題會被推出畫面
// 座標換算：inset = innerHeight - (offsetTop + height)，對 fixed 元素（相對 layout viewport）正確。
function useVisualViewportFit() {
  const [fit, setFit] = React.useState({ inset: 0, maxHeight: 0, height: 0 })

  React.useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)))
      const height = Math.round(vv.height)
      const maxHeight = Math.round(Math.min(vv.height, window.innerHeight)) - 8
      setFit((prev) =>
        prev.inset === inset && prev.maxHeight === maxHeight && prev.height === height
          ? prev
          : { inset, maxHeight, height }
      )
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])

  return fit
}

// 與 main.css 的 short variant 同一門檻：可見高度不足時壓縮抽屜上下 chrome
const SHORT_VIEWPORT_MAX = 600

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  style,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const fit = useVisualViewportFit()
  // 以 CSS 變數把實測可見高度交給 max-h 的 min()（見下方 class），鍵盤蓋住底部時再把 bottom 往上墊
  const fitStyle = {
    ...(fit.maxHeight > 0 ? { "--drawer-vv-max": `${fit.maxHeight}px` } : {}),
    ...(fit.inset > 0 ? { bottom: fit.inset } : {})
  } as React.CSSProperties
  const isShort = fit.height > 0 && fit.height <= SHORT_VIEWPORT_MAX

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col bg-background",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[min(80vh,var(--drawer-vv-max,100dvh))] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
          // 矮視窗放寬高度上限；平板/桌面限制寬度並置中，避免整排輸入框被拉滿螢幕
          "data-[vaul-drawer-direction=bottom]:short:max-h-[min(calc(100dvh-0.5rem),var(--drawer-vv-max,100dvh))] data-[vaul-drawer-direction=bottom]:sm:mx-auto data-[vaul-drawer-direction=bottom]:sm:max-w-xl data-[vaul-drawer-direction=bottom]:sm:border-x",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          className
        )}
        style={{ ...style, ...fitStyle }}
        data-vv-short={isShort ? "" : undefined}
        {...props}
      >
        <div className="mx-auto mt-4 hidden h-2 w-[100px] short:mt-2 shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 short:py-2 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4 short:py-2", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
