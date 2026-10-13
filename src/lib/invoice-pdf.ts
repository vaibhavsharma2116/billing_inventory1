import { inr, exactInr } from "@/lib/sfa";
import { getLogoDataUrl } from "@/lib/brand-logo";

export type InvoicePdfLine = {
  name: string;
  qty: number;
  freeQty?: number;
  rate: number;
  amount: number;
  hsn?: string | null;
  mrp?: number | null;
};

export type InvoiceParty = {
  role?: string | null;
  name: string;
  address?: string | null;
  shipping_address?: string | null;
  city?: string | null;
  state?: string | null;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type InvoicePdfData = {
  invoiceNo: string;
  title?: string;
  date?: string | null;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  shipTo?: InvoiceParty | null;
  orderNo?: string | null;
  discountAmount?: number | undefined;
  lines: InvoicePdfLine[];
  taxable: number;
  cgst: number;
  sgst: number;
  net: number;
};

const money = (n: number) => inr(n).replace("₹", "Rs. ");

function sellerLines(p: InvoiceParty): string[] {
  const out: string[] = [p.name];
  if (p.address) out.push(p.address);
  const loc = [p.city, p.state].filter(Boolean).join(", ");
  if (loc) out.push(loc);
  const extras = [
    p.gstin ? `GSTIN: ${p.gstin}` : null,
    p.phone ? `Mobile: ${p.phone}` : null,
    p.email ? `Email: ${p.email}` : null,
  ].filter(Boolean).join("  •  ");
  if (extras) out.push(extras);
  return out;
}

function billToLines(p: InvoiceParty): string[] {
  const out: string[] = [p.name];
  if (p.address) out.push(p.address);
  const loc = [p.city, p.state].filter(Boolean).join(", ");
  if (loc) out.push(loc);
  out.push(`GSTIN: ${p.gstin || "Not provided"}`);
  if (p.phone) out.push(`Mobile: ${p.phone}`);
  if (p.email) out.push(`Email: ${p.email}`);
  return out;
}

function shipToLines(p: InvoiceParty): string[] {
  const out: string[] = [p.name];
  const deliveryAddr = p.shipping_address || p.address;
  if (deliveryAddr) out.push(deliveryAddr);
  const loc = [p.city, p.state].filter(Boolean).join(", ");
  if (loc) out.push(loc);
  if (p.gstin) out.push(`GSTIN: ${p.gstin}`);
  if (p.phone) out.push(`Delivery Contact: ${p.phone}`);
  return out;
}

export async function downloadInvoicePdf(data: InvoicePdfData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 56;

  const logo = await getLogoDataUrl();
  if (logo) {
    doc.addImage(logo, "PNG", 40, y - 26, 108, 36, undefined, "FAST");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("POPPiK Lifestyle Private Limited", 160, y - 5);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("POPPiK Lifestyle Private Limited", 40, y);
  }
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(data.title ?? "TAX INVOICE", W - 40, y, { align: "right" });

  y += 16;
  doc.setFontSize(9);
  doc.text(`Invoice: ${data.invoiceNo}`, W - 40, y, { align: "right" });
  if (data.orderNo) doc.text(`Order: ${data.orderNo}`, 40, y);
  y += 13;
  if (data.date) doc.text(`Date: ${new Date(data.date).toLocaleDateString("en-IN")}`, W - 40, y, { align: "right" });

  y += 16;
  doc.setDrawColor(200);
  doc.line(40, y, W - 40, y);
  y += 13;

  // Seller Section
  const colL = 40;
  const colR = W / 2 + 10;
  const colW = W / 2 - 50;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(data.seller.role ? `Seller (Supplier) — ${data.seller.role}` : "Seller (Supplier)", colL, y);
  doc.setFont("helvetica", "normal");
  y += 12;

  const sLines = sellerLines(data.seller).flatMap((t) => doc.splitTextToSize(t, W - 80) as string[]);
  sLines.forEach((t) => {
    doc.text(t, colL, y);
    y += 11;
  });

  y += 4;
  doc.line(40, y, W - 40, y);
  y += 13;

  // Bill To (Left) & Ship To (Right)
  const shipParty = data.shipTo || data.buyer;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(data.buyer.role ? `Bill To (Buyer) — ${data.buyer.role}` : "Bill To (Buyer)", colL, y);
  doc.text("Ship To (Consignee / Delivery)", colR, y);
  doc.setFont("helvetica", "normal");

  const bLines = billToLines(data.buyer).flatMap((t) => doc.splitTextToSize(t, colW) as string[]);
  const shLines = shipToLines(shipParty).flatMap((t) => doc.splitTextToSize(t, colW) as string[]);
  const partyTop = y + 13;
  bLines.forEach((t, i) => doc.text(t, colL, partyTop + i * 11));
  shLines.forEach((t, i) => doc.text(t, colR, partyTop + i * 11));
  y = partyTop + Math.max(bLines.length, shLines.length) * 11 + 8;

  doc.line(40, y, W - 40, y);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.text("Item", 40, y);
  doc.text("HSN", 320, y, { align: "right" });
  doc.text("MRP", 375, y, { align: "right" });
  doc.text("Qty", 425, y, { align: "right" });
  doc.text("Rate", 485, y, { align: "right" });
  doc.text("Amount", W - 40, y, { align: "right" });
  y += 6;
  doc.line(40, y, W - 40, y);
  doc.setFont("helvetica", "normal");

  for (const l of data.lines) {
    y += 16;
    if (y > 740) {
      doc.addPage();
      y = 60;
    }
    const rawLabel = l.freeQty ? `${l.name} (+${l.freeQty} free)` : l.name;
    const label = rawLabel.length > 42 ? rawLabel.slice(0, 39) + "..." : rawLabel;
    doc.text(label, 40, y);
    doc.text((l.hsn || "-").slice(0, 10), 320, y, { align: "right" });
    doc.text(l.mrp ? exactInr(l.mrp).replace("₹", "") : "-", 375, y, { align: "right" });
    doc.text(String(l.qty), 425, y, { align: "right" });
    doc.text(exactInr(l.rate).replace("₹", ""), 485, y, { align: "right" });
    doc.text(money(l.amount), W - 40, y, { align: "right" });
  }

  y += 12;
  doc.line(40, y, W - 40, y);
  const rows: Array<[string, number, boolean]> = [];
  if (data.discountAmount) {
    rows.push(["Gross Value", data.taxable + data.discountAmount, false]);
    rows.push(["Cash Discount", -data.discountAmount, false]);
  }
  rows.push(
    ["Taxable Value", data.taxable, false],
    ["CGST (9%)", data.cgst, false],
    ["SGST (9%)", data.sgst, false],
    ["Net Payable", data.net, true]
  );
  for (const [label, value, bold] of rows) {
    y += 16;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, 400, y, { align: "right" });
    doc.text(money(value), W - 40, y, { align: "right" });
  }

  y += 34;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("Computer generated invoice — POPPiK Sales Force Automation", 40, y);

  doc.save(`${data.invoiceNo}.pdf`);
}
