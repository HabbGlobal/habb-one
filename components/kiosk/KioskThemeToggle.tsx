"use client";

import { Moon, Sun } from "lucide-react";
import { useKioskTheme } from "./KioskThemeProvider";

export function KioskThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useKioskTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex items-center justify-center rounded-xl border border-habb-line bg-white p-2.5 text-habb-muted transition-all hover:text-habb-ink dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:backdrop-blur-md dark:hover:bg-white/10 dark:hover:text-white ${className}`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
