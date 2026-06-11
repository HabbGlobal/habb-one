// Helper-Script: legt einen KIOSK_OPERATOR-Account für eine bestehende
// Firma an. Solche Accounts werden auf Werkstatt-Tablets verwendet:
// nach dem Login landet das Tablet direkt im Stempel-Kiosk (Mitarbeiter-
// Kacheln) — kein Zugriff auf /admin.
//
// Verwendung:
//   pnpm tsx scripts/create-kiosk-user.ts \
//     --company "Tschannen Spritzwerk AG" \
//     --email zeit@tschannen.ch \
//     --password "Zeit1234" \
//     [--name "Werkstatt-Tablet"]
//
// Sicherheits-Hinweis:
//   Das Passwort steht in `argv` und kann in der Shell-History landen.
//   Für Produktiv-Tablets bitte ein langes Zufalls-Passwort generieren und
//   in einem Passwort-Manager hinterlegen.

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

interface Args {
  company: string;
  email: string;
  password: string;
  name: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && idx < argv.length - 1 ? argv[idx + 1] : undefined;
  };
  const company = get("--company");
  const email = get("--email");
  const password = get("--password");
  const name = get("--name") ?? "Werkstatt-Tablet";
  if (!company || !email || !password) {
    console.error(
      "Usage: pnpm tsx scripts/create-kiosk-user.ts --company '<Name>' --email <email> --password <password> [--name <displayName>]",
    );
    process.exit(1);
  }
  return { company, email, password, name };
}

async function main() {
  const args = parseArgs();

  const company = await prisma.company.findFirst({
    where: { name: { equals: args.company, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error(`Company not found: "${args.company}"`);
    const all = await prisma.company.findMany({ select: { name: true } });
    console.error("Existing companies:");
    for (const c of all) console.error(`  - ${c.name}`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email: args.email.toLowerCase() },
    select: { id: true, role: true, companyId: true },
  });
  if (existing) {
    console.error(
      `User ${args.email} already exists (role=${existing.role}). Aborting — delete or rename it first.`,
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(args.password, 12);

  const user = await prisma.user.create({
    data: {
      email: args.email.toLowerCase(),
      name: args.name,
      passwordHash,
      role: "KIOSK_OPERATOR",
      companyId: company.id,
      isActive: true,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log("✓ Kiosk-Account angelegt:");
  console.log(`  Firma:    ${company.name}`);
  console.log(`  E-Mail:   ${user.email}`);
  console.log(`  Name:     ${user.name}`);
  console.log(`  Rolle:    ${user.role}`);
  console.log("");
  console.log("Nächste Schritte:");
  console.log("  1. Tablet → /login öffnen");
  console.log("  2. mit obigen Credentials einloggen");
  console.log("  3. Tablet landet direkt auf /kiosk mit Mitarbeiter-Kacheln");
  console.log("  4. Schicht-Ende: Abmelden-Button oben rechts");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
