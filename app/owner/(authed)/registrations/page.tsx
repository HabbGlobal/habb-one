import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { RegistrationActions } from "@/components/owner/RegistrationActions";
import { SectionTabs } from "@/components/owner/SectionTabs";

export const dynamic = "force-dynamic";

export default async function RegistrationsPage() {
  const [pending, rejectedCount] = await Promise.all([
    prisma.company.findMany({
      where: { registrationStatus: { in: ["PENDING_EMAIL_VERIFICATION", "PENDING_APPROVAL"] } },
      orderBy: { registrationSubmittedAt: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        city: true,
        country: true,
        registrationStatus: true,
        registrationSubmittedAt: true,
        registrationEmailVerifiedAt: true,
        users: {
          where: { role: "SUPERADMIN" },
          select: { email: true, name: true, emailVerifiedAt: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    }),
    prisma.company.count({
      where: { registrationStatus: "REJECTED" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">Platform</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">
          Registrierungs-Anfragen
        </h1>
        <p className="mt-1 text-sm text-habb-muted">
          {pending.length} Anfrage{pending.length === 1 ? "" : "n"} ausstehend
        </p>
      </header>

      <SectionTabs
        tabs={[
          { href: "/owner/registrations", label: "Offen", count: pending.length },
          { href: "/owner/registrations/archive", label: "Archiv", count: rejectedCount },
        ]}
      />

      {pending.length === 0 ? (
        <section className="rounded-lg border border-dashed border-habb-line bg-white px-5 py-10 text-center">
          <h2 className="text-sm font-medium text-habb-ink">Keine offenen Anfragen</h2>
          <p className="mt-1 text-xs text-habb-muted">
            Neue Self-Registrations landen automatisch hier, sobald die Email bestätigt ist.
          </p>
        </section>
      ) : (
        <ul className="space-y-4">
          {pending.map((r) => {
            const admin = r.users[0];
            const emailVerified = r.registrationStatus === "PENDING_APPROVAL";
            return (
              <li
                key={r.id}
                className="rounded-lg border border-habb-line bg-white px-5 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-habb-black">{r.name}</h2>
                      {emailVerified ? (
                        <span className="rounded-full border border-habb-success/30 bg-habb-success/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-habb-success">
                          Mail verifiziert
                        </span>
                      ) : (
                        <span className="rounded-full border border-habb-warning/30 bg-habb-warning/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-habb-warning">
                          Mail unbestätigt
                        </span>
                      )}
                    </div>
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                      <Row label="Phone" value={r.phone || "—"} />
                      <Row
                        label="Adresse"
                        value={[r.address, r.city, r.country].filter(Boolean).join(", ") || "—"}
                      />
                      <Row label="Admin" value={admin ? `${admin.name} <${admin.email}>` : "—"} />
                      <Row
                        label="Eingegangen"
                        value={
                          r.registrationSubmittedAt
                            ? r.registrationSubmittedAt.toLocaleString("de-CH")
                            : "—"
                        }
                      />
                    </dl>
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end">
                    {emailVerified ? (
                      <RegistrationActions companyId={r.id} companyName={r.name} />
                    ) : (
                      <p className="text-xs text-habb-muted sm:text-right">
                        Mail-Bestätigung steht aus. Genehmigung erst möglich, wenn der Admin
                        den Verify-Link geklickt hat.
                      </p>
                    )}
                    <Link
                      href={`/owner/tenants/${r.id}`}
                      className="text-xs text-habb-muted underline-offset-2 hover:underline"
                    >
                      Tenanten-Profil öffnen →
                    </Link>
                  </div>
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
