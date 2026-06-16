import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SectionTabs } from "@/components/owner/SectionTabs";

export const dynamic = "force-dynamic";

/**
 * Archiv abgelehnter Registrierungs-Anfragen. Read-only; falls der Tenant
 * doch noch akzeptiert werden soll, muss der Status manuell zurückgesetzt
 * werden (via Stammdaten-Bearbeitung im Tenanten-Profil).
 */
export default async function ArchivedRegistrationsPage() {
  const [rejected, pendingCount] = await Promise.all([
    prisma.company.findMany({
      where: { registrationStatus: "REJECTED" },
      orderBy: { registrationRejectedAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        city: true,
        country: true,
        registrationSubmittedAt: true,
        registrationRejectedAt: true,
        registrationRejectionReason: true,
        users: {
          where: { role: "SUPERADMIN" },
          select: { email: true, name: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    }),
    prisma.company.count({
      where: { registrationStatus: { in: ["PENDING_EMAIL_VERIFICATION", "PENDING_APPROVAL"] } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">Platform</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">
          Registration Archive
        </h1>
        <p className="mt-1 text-sm text-habb-muted">
          {rejected.length} rejected request{rejected.length === 1 ? "" : "s"}
        </p>
      </header>

      <SectionTabs
        tabs={[
          { href: "/owner/registrations", label: "Open", count: pendingCount },
          { href: "/owner/registrations/archive", label: "Archive", count: rejected.length },
        ]}
      />

      {rejected.length === 0 ? (
        <section className="rounded-lg border border-dashed border-habb-line bg-white px-5 py-10 text-center">
          <h2 className="text-sm font-medium text-habb-ink">Archive is empty</h2>
          <p className="mt-1 text-xs text-habb-muted">
            Rejected registrations are documented here for evidence and audit history.
          </p>
        </section>
      ) : (
        <ul className="space-y-4">
          {rejected.map((r) => {
            const admin = r.users[0];
            return (
              <li
                key={r.id}
                className="rounded-lg border border-habb-line bg-white px-5 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-habb-black">{r.name}</h2>
                      <span className="rounded-full border border-habb-red/30 bg-habb-red/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-habb-red-dark">
                        Rejected
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                      <Row label="Phone" value={r.phone || "—"} />
                      <Row
                        label="Address"
                        value={[r.address, r.city, r.country].filter(Boolean).join(", ") || "—"}
                      />
                      <Row label="Admin" value={admin ? `${admin.name} <${admin.email}>` : "—"} />
                      <Row
                        label="Received"
                        value={
                          r.registrationSubmittedAt
                            ? r.registrationSubmittedAt.toLocaleString("de-CH")
                            : "—"
                        }
                      />
                      <Row
                        label="Rejected at"
                        value={
                          r.registrationRejectedAt
                            ? r.registrationRejectedAt.toLocaleString("de-CH")
                            : "—"
                        }
                      />
                      <Row
                        label="Reason"
                        value={r.registrationRejectionReason || "—"}
                      />
                    </dl>
                  </div>

                  <Link
                    href={`/owner/tenants/${r.id}`}
                    className="text-xs text-habb-muted underline-offset-2 hover:underline self-start"
                  >
                    Open profile →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-habb-muted">{label}</dt>
      <dd className="text-habb-ink">{value}</dd>
    </>
  );
}
