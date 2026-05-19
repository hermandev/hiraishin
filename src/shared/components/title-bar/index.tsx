import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";
import ThemeToggle from "@/shared/components/theme-toggle";
import ButtonWindow from "./button-window";

export default function TitleBar() {
  const divRef = useRef<HTMLDivElement | null>(null);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const titleBar = divRef.current;
    if (!titleBar) return;

    const handleMouseDown = async (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-no-drag]")) {
        return;
      }

      if (event.buttons === 1) {
        if (event.detail === 2) {
          await appWindow.toggleMaximize();
        } else {
          await appWindow.startDragging();
        }
      }
    };

    titleBar.addEventListener("mousedown", handleMouseDown);

    return () => {
      titleBar.removeEventListener("mousedown", handleMouseDown);
    };
  }, [appWindow]);

  return (
    <div
      className="h-8 w-full select-none border-b bg-background/80 backdrop-blur flex items-center"
      ref={divRef}
    >
      <ButtonWindow appWindow={appWindow} />
      <div className="ml-auto" data-no-drag>
        <ThemeToggle />
      </div>
    </div>
  );
}
