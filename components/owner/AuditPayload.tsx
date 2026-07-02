"use client";

import { useState } from "react";
import type { Prisma } from "@prisma/client";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  payloadBefore?: Prisma.JsonValue | null;
  payloadAfter?: Prisma.JsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  consentTokenId?: string | null;
}

/**
 * Collapsible detail view for an audit entry. Shows payload diff, IP/user
 * agent, and optional consent-token reference for impersonation. Rendered under
 * each audit list item when relevant data exists.
 */
export function AuditPayload({
  payloadBefore,
  payloadAfter,
  ipAddress,
  userAgent,
  requestId,
  consentTokenId,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-habb-muted hover:text-habb-ink"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? "Less" : "Details"}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-3 rounded-md border border-habb-line bg-habb-paper p-3 text-xs sm:grid-cols-2">
          {payloadBefore !== null && payloadBefore !== undefined && (
            <div>
              <p className="mb-1 font-medium uppercase tracking-wide text-habb-muted text-[10px]">
                Before
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words bg-white p-2 border border-habb-line rounded text-[11px] leading-snug">
                {JSON.stringify(payloadBefore, null, 2)}
              </pre>
            </div>
          )}
          {payloadAfter !== null && payloadAfter !== undefined && (
            <div>
              <p className="mb-1 font-medium uppercase tracking-wide text-habb-muted text-[10px]">
                After
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words bg-white p-2 border border-habb-line rounded text-[11px] leading-snug">
                {JSON.stringify(payloadAfter, null, 2)}
              </pre>
            </div>
          )}
          {(ipAddress || userAgent || requestId || consentTokenId) && (
            <dl className="sm:col-span-2 grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[11px]">
              {ipAddress && (
                <>
                  <dt className="text-habb-muted">IP</dt>
                  <dd className="font-mono text-habb-ink">{ipAddress}</dd>
                </>
              )}
              {userAgent && (
                <>
                  <dt className="text-habb-muted">User-Agent</dt>
                  <dd className="text-habb-ink truncate" title={userAgent}>
                    {userAgent}
                  </dd>
                </>
              )}
              {requestId && (
                <>
                  <dt className="text-habb-muted">Request-ID</dt>
                  <dd className="font-mono text-habb-ink">{requestId}</dd>
                </>
              )}
              {consentTokenId && (
                <>
                  <dt className="text-habb-muted">Consent-Token</dt>
                  <dd className="font-mono text-habb-ink">{consentTokenId}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
