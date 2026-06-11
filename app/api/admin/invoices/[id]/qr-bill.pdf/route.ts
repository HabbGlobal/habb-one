import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toInvoiceDetailDTO } from "@/lib/dto/invoice";
import { invoicePdf } from "@/lib/invoice/pdf";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, "invoices.read")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: session.user.companyId },
    include: {
      company: true,
      customer: { include: { contacts: true, addresses: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const dto = toInvoiceDetailDTO(invoice);

  try {
    const buf = await invoicePdf({
      company: {
        name: invoice.company.name,
        address: invoice.company.address,
        city: invoice.company.city,
        vatNumber: invoice.company.vatNumber,
        qrIban: invoice.company.qrIban,
        invoiceCreditorName: invoice.company.invoiceCreditorName,
        logoData: invoice.company.logoData,
        logoMimeType: invoice.company.logoMimeType,
      },
      invoice: dto,
    });
    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Rechnung_${dto.invoiceNumber}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[invoice qr-bill.pdf] failed:", err);
    return NextResponse.json(
      {
        error: "PDF_GENERATION_FAILED",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 },
    );
  }
}
