import type { ReactNode } from "react";
import { KioskThemeProvider } from "@/components/kiosk/KioskThemeProvider";

export default function KioskLayout({ children }: { children: ReactNode }) {
  return <KioskThemeProvider>{children}</KioskThemeProvider>;
}
