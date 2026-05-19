import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "@/shared/components/theme-toggle";
import ButtonWindow from "./button-window";

function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export default function TitleBar() {
  const divRef = useRef<HTMLDivElement | null>(null);
  const [isMacOs] = useState(isMacPlatform);
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
      className="flex h-8 w-full select-none items-center border-b bg-background/80 backdrop-blur"
      ref={divRef}
    >
      {isMacOs && (
        <div data-no-drag>
          <ButtonWindow appWindow={appWindow} />
        </div>
      )}

      <div className="flex-1" />

      <div className="flex items-center" data-no-drag>
        <ThemeToggle />
        {!isMacOs && <ButtonWindow appWindow={appWindow} />}
      </div>
    </div>
  );
}
