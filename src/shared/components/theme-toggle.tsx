import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/shared/provider/theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-2 px-2 text-muted-foreground">
      <Sun className="size-3.5" />
      <Switch
        aria-label="Toggle theme"
        checked={isDark}
        onCheckedChange={toggleTheme}
      />
      <Moon className="size-3.5" />
    </div>
  );
}
