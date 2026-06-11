import { redirect } from "next/navigation";
import { getOwnerContext } from "@/lib/owner/auth";
import { OwnerAuthShell } from "@/components/owner/AuthShell";
import { PasswordForm } from "./PasswordForm";

export default async function OwnerLoginPage() {
  const existing = await getOwnerContext();
  if (existing) redirect("/owner");

  return (
    <OwnerAuthShell
      currentStep={1}
      title="Anmelden"
      subtitle="E-Mail und Passwort. Anschliessend Passkey-Bestätigung."
    >
      <PasswordForm />
    </OwnerAuthShell>
  );
}
