import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_CEREMONY, verifyCeremonyToken } from "@/lib/owner/auth";
import { OwnerAuthShell } from "@/components/owner/AuthShell";
import { EnrollClient } from "./EnrollClient";

export default async function EnrollPasskeyPage() {
  const jar = await cookies();
  const ceremony = jar.get(COOKIE_CEREMONY)?.value;
  if (!ceremony) redirect("/owner/login");
  try {
    const claims = await verifyCeremonyToken(ceremony);
    if (claims.stage !== "ENROLL") redirect("/owner/login");
  } catch {
    redirect("/owner/login");
  }

  return (
    <OwnerAuthShell
      currentStep={2}
      title="Passkey einrichten"
      subtitle="Diesen Schritt machst du einmal pro Gerät — Touch ID, Windows Hello, iCloud Schlüsselbund oder Sicherheitsschlüssel."
    >
      <EnrollClient />
    </OwnerAuthShell>
  );
}
