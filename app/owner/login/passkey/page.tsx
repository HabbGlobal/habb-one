import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_CEREMONY, verifyCeremonyToken } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";
import { OwnerAuthShell } from "@/components/owner/AuthShell";
import { SigninClient } from "./SigninClient";

export default async function PasskeySigninPage() {
  const jar = await cookies();
  const ceremony = jar.get(COOKIE_CEREMONY)?.value;
  if (!ceremony) redirect("/owner/login");

  let ownerAccountId: string;
  try {
    const claims = await verifyCeremonyToken(ceremony);
    if (claims.stage !== "SIGNIN") redirect("/owner/login");
    ownerAccountId = claims.ownerAccountId;
  } catch {
    redirect("/owner/login");
  }

  // Notfall-Option nur anbieten, wenn der Account tatsächlich einen
  // TOTP-Recovery-Faktor eingerichtet hat — sonst ist es eine Sackgasse.
  const account = await prisma.ownerAccount.findUnique({
    where: { id: ownerAccountId },
    select: { totpEnrolledAt: true },
  });
  const recoveryAvailable = !!account?.totpEnrolledAt;

  return (
    <OwnerAuthShell
      currentStep={2}
      title="Mit Passkey bestätigen"
      subtitle="Letzter Schritt: Bestätige die Anmeldung mit dem Passkey, den du auf diesem Gerät registriert hast."
    >
      <SigninClient recoveryAvailable={recoveryAvailable} />
    </OwnerAuthShell>
  );
}
