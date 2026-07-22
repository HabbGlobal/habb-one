"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type KioskTheme = "light" | "dark";

const STORAGE_KEY = "habb-kiosk-theme";

const KioskThemeContext = createContext<{
  theme: KioskTheme;
  toggleTheme: () => void;
} | null>(null);

export function KioskThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<KioskTheme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
  }, []);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  return (
    <KioskThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={theme === "dark" ? "dark" : ""}>{children}</div>
    </KioskThemeContext.Provider>
  );
}

export function useKioskTheme() {
  const ctx = useContext(KioskThemeContext);
  if (!ctx) {
    throw new Error("useKioskTheme must be used within a KioskThemeProvider");
  }
  return ctx;
}
