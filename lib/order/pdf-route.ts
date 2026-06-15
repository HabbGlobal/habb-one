// Shared loader used by all three Order-PDF routes — keeps the route
// files tiny and the auth/load/wire logic in one place.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toOrderDetailDTO } from "@/lib/dto/order";
import {
  confirmationPdf,
  deliveryNotePdf,
  qrLabelPdf,
} from "@/lib/order/pdf";

type Variant = "confirmation" | "delivery-note" | "qr-label";

const FILENAME_PREFIX: Record<Variant, string> = {
  confirmation: "OrderConfirmation",
  "delivery-note": "DeliveryNote",
  "qr-label": "QR-Label",
};

export async function buildOrderPdfResponse(orderId: string, variant: Variant) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, "orders.read")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, companyId: session.user.companyId },
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
  const company = {
    name: order.company.name,
    address: order.company.address,
    city: order.company.city,
    vatNumber: order.company.vatNumber,
    email: null,
    logoData: order.company.logoData,
    logoMimeType: order.company.logoMimeType,
  };
  const args = {
    company,
    order: dto,
    shippingAddress: order.shippingAddress
      ? {
          street: order.shippingAddress.street,
          zip: order.shippingAddress.zip,
          city: order.shippingAddress.city,
          country: order.shippingAddress.country,
        }
      : null,
    billingAddress: order.billingAddress
      ? {
          street: order.billingAddress.street,
          zip: order.billingAddress.zip,
          city: order.billingAddress.city,
          country: order.billingAddress.country,
        }
      : null,
    // Kein Hardcode-Fallback mehr: eine leere ENV bedeutet "keine URL
    // aufs Etikett drucken" — niemals eine fest verdrahtete Fremd-
    // Domain auf den Dokumenten anderer Mandanten.
    trackingBaseUrl: process.env.PUBLIC_TRACKING_URL?.trim() || undefined,
  };

  let buf: Uint8Array;
  if (variant === "confirmation") buf = await confirmationPdf(args);
  else if (variant === "delivery-note") buf = await deliveryNotePdf(args);
  else buf = await qrLabelPdf(args);

  const filename = `${FILENAME_PREFIX[variant]}_${dto.orderNumber}.pdf`;
  return new NextResponse(Buffer.from(buf) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
