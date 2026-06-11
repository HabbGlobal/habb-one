import { SessionProvider } from "@/components/SessionProvider";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
