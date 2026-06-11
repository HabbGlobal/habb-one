import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toOrderDetailDTO } from "@/lib/dto/order";
import { travelerPdf } from "@/lib/order/traveler-pdf";

// `qrcode` braucht Node-Runtime (verwendet Buffer + native PNG-encoding).
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, "orders.read")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, companyId: session.user.companyId },
    include: {
      company: true,
      customer: { include: { contacts: true, addresses: true } },
      contactPerson: true,
      shippingAddress: true,
      billingAddress: true,
      items: { include: { processSteps: true }, orderBy: { position: "asc" } },
      statusHistory: true,
    },
  });
  if (!order) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const dto = toOrderDetailDTO(order);

  // Basis-URL aus Request bauen — sodass die QR-Codes auf die jeweils
  // genutzte Domain zeigen (Vercel Preview, Production, Localhost).
  const url = new URL(req.url);
  const appBaseUrl = `${url.protocol}//${url.host}`;

  try {
    const buf = await travelerPdf({
      company: {
        name: order.company.name,
        logoData: order.company.logoData,
        logoMimeType: order.company.logoMimeType,
      },
      order: dto,
      appBaseUrl,
    });

    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Laufzettel_${dto.orderNumber}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[traveler.pdf] generation failed:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "PDF_GENERATION_FAILED", message: msg },
      { status: 500 },
    );
  }
}
