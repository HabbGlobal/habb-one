import { redirect } from "next/navigation";

/**
 * Root-Route: leitet direkt auf /login weiter. Damit die Wurzel-Domain
 * und /login identisch wirken — domain-unabhängig.
 */
export default function RootPage() {
  redirect("/login");
}
