import { IconMinus, IconSelector, IconX } from "@tabler/icons-react";
import type { Window } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";

type Props = {
  appWindow: Window;
};

export default function ButtonWindow({ appWindow }: Readonly<Props>) {
  const handleClose = async () => {
    await appWindow.close();
  };
  const handleMinimize = async () => {
    await appWindow.minimize();
  };
  const handleMaximize = async () => {
    await appWindow.maximize();
  };
  return (
    <div className="flex items-center gap-2 px-2 group">
      <Button
        onClick={() => handleClose()}
        className="w-4 h-4 rounded-full bg-red-500 hover:bg-red-600"
        size="icon-xs"
      >
        <IconX className="opacity-0 group-hover:opacity-100" />
      </Button>
      <Button
        onClick={() => handleMinimize()}
        className="w-4 h-4 rounded-full bg-yellow-400 hover:bg-yellow-500"
        size="icon-xs"
      >
        <IconMinus className="opacity-0 group-hover:opacity-100" />
      </Button>
      <Button
        onClick={() => handleMaximize()}
        className="w-4 h-4 rounded-full bg-green-500 hover:bg-green-600"
        size="icon-xs"
      >
        <IconSelector className="rotate-140 opacity-0 group-hover:opacity-100" />
      </Button>
    </div>
  );
}
