// Bootstrap-Script für den ersten Owner-Account des SaaS-Betreibers HABB Global (PVT) LTD.
//
// WICHTIG: Owner-Accounts sind technisch und prozessual streng von Tenant-Usern
// getrennt. Sie leben in der `OwnerAccount`-Tabelle, nicht in `User`. Ein
// Owner kann nie versehentlich zum Tenant-User werden und umgekehrt.
//
// Verwendung:
//   pnpm tsx scripts/create-owner.ts \
//     --email marco@HABB Global (PVT) LTD \
//     --name "Marco Habermacher" \
//     --password "<starkes-passwort>" \
//     --role OWNER_ROOT
//
// Was angelegt wird:
//   1. OwnerAccount mit bcrypt-Hash des Passworts.
//   2. Audit-Eintrag OWNER_ACCOUNT_CREATED (selbst-referenziert beim ersten
//      Owner, da kein "vorheriger" Owner existiert).
//
// Was NICHT angelegt wird:
//   - WebAuthn-Credential: das wird beim ersten Login im Browser registriert
//     (Phase 1). Das Script erstellt den Account, das Enrollment erzwingt
//     der Login-Flow.

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { OwnerRole } from "@prisma/client";

interface Args {
  email: string;
  name: string;
  password: string;
  role: OwnerRole;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && idx < argv.length - 1 ? argv[idx + 1] : undefined;
  };
  const email = get("--email");
  const name = get("--name");
  const password = get("--password");
  const roleRaw = get("--role") ?? "OWNER_ROOT";

  const validRoles: OwnerRole[] = ["OWNER_ROOT", "OWNER_ADMIN", "OWNER_SUPPORT"];
  if (!validRoles.includes(roleRaw as OwnerRole)) {
    console.error(
      `Invalid --role: ${roleRaw}. Must be one of: ${validRoles.join(", ")}`,
    );
    process.exit(1);
  }
  if (!email || !name || !password) {
    console.error(
      "Usage: pnpm tsx scripts/create-owner.ts --email <email> --name <name> --password <password> [--role OWNER_ROOT|OWNER_ADMIN|OWNER_SUPPORT]",
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error(
      "Refusing weak password — Owner accounts require at least 12 characters.",
    );
    process.exit(1);
  }
  return { email: email.toLowerCase(), name, password, role: roleRaw as OwnerRole };
}

async function main() {
  const args = parseArgs();

  const existing = await prisma.ownerAccount.findUnique({
    where: { email: args.email },
    select: { id: true },
  });
  if (existing) {
    console.error(`Owner account ${args.email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(args.password, 12);

  const owner = await prisma.ownerAccount.create({
    data: {
      email: args.email,
      name: args.name,
      passwordHash,
      role: args.role,
      isActive: true,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  // Self-referenced audit entry: at bootstrap time there is no "previous"
  // owner who could authorise the creation, so we record the account as
  // having created itself. This makes the audit trail self-consistent.
  await prisma.ownerAuditLog.create({
    data: {
      ownerAccountId: owner.id,
      ownerEmail: owner.email,
      action: "OWNER_ACCOUNT_CREATED",
      reason: "Bootstrap via scripts/create-owner.ts",
      payloadAfter: {
        email: owner.email,
        name: owner.name,
        role: owner.role,
      },
    },
  });

  console.log("✓ Owner-Account angelegt:");
  console.log(`  E-Mail:   ${owner.email}`);
  console.log(`  Name:     ${owner.name}`);
  console.log(`  Rolle:    ${owner.role}`);
  console.log("");
  console.log("Beim ersten Login (PR 1) wird WebAuthn-Enrollment erzwungen.");
  console.log("Bitte einen Passkey (z.B. iCloud Keychain, YubiKey) bereithalten.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
