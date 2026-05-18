import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";
import ButtonWindow from "./button-window";

export default function TitleBar() {
  const divRef = useRef<HTMLDivElement | null>(null);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    if (divRef.current) {
      divRef.current.addEventListener("mousedown", async (e: MouseEvent) => {
        if (e.buttons === 1) {
          if (e.detail === 2) {
            await appWindow.toggleMaximize();
          } else {
            await appWindow.startDragging();
          }
        }
      });
    }
  }, [appWindow]);

  return (
    <div
      className="h-8 w-full select-none border-b bg-background/80 backdrop-blur flex items-center"
      ref={divRef}
    >
      <ButtonWindow appWindow={appWindow} />
    </div>
  );
}
