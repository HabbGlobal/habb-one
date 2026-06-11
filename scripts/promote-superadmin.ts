// Bootstrap-Script: hebt einen existierenden User auf SUPERADMIN.
//
// Verwendung:
//   pnpm tsx scripts/promote-superadmin.ts <email>
//   # Beispiel:
//   pnpm tsx scripts/promote-superadmin.ts admin@tschannen.ch
//
// Nutzen:
//   Der SUPERADMIN ist der einzige Account, der unter /admin/roles die
//   Rechte-Matrix bearbeiten darf. Initial existiert keiner — hebe einen
//   bestehenden User per CLI auf diese Rolle.

import { prisma } from "@/lib/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm tsx scripts/promote-superadmin.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`✗ User mit E-Mail "${email}" nicht gefunden.`);
    process.exit(1);
  }

  if (user.role === "SUPERADMIN") {
    console.log(`ℹ︎ ${email} ist bereits SUPERADMIN — nichts zu tun.`);
    process.exit(0);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "SUPERADMIN" },
  });

  console.log(`✓ ${email} ist jetzt SUPERADMIN.`);
  console.log(
    "  Login → /admin/roles → Permissions-Matrix konfigurierbar.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
