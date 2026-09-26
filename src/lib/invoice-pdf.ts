import { inr, exactInr } from "@/lib/sfa";
import { getLogoDataUrl } from "@/lib/brand-logo";

export type InvoicePdfLine = {
  name: string;
  qty: number;
  freeQty?: number;
  rate: number;
  amount: number;
};

export type InvoiceParty = {
  role?: string | null;
  name: string;
  address?: string | null;
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
  orderNo?: string | null;
  discountAmount?: number | undefined;
  lines: InvoicePdfLine[];
  taxable: number;
  cgst: number;
  sgst: number;
  net: number;
};

const money = (n: number) => inr(n).replace("₹", "Rs. ");

function partyLines(p: InvoiceParty): string[] {
  const out: string[] = [p.name];
  if (p.address) out.push(p.address);
  const loc = [p.city, p.state].filter(Boolean).join(", ");
  if (loc) out.push(loc);
  out.push(`GSTIN: ${p.gstin || "Not provided"}`);
  out.push(`Mobile: ${p.phone || "Not provided"}`);
  out.push(`Email: ${p.email || "Not provided"}`);
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

  y += 18;
  doc.setDrawColor(200);
  doc.line(40, y, W - 40, y);
  y += 16;

  const colL = 40;
  const colR = W / 2 + 10;
  const colW = W / 2 - 60;
  doc.setFont("helvetica", "bold");
  doc.text(data.seller.role ? `Seller — ${data.seller.role}` : "Seller", colL, y);
  doc.text(data.buyer.role ? `Bill To — ${data.buyer.role}` : "Bill To", colR, y);
  doc.setFont("helvetica", "normal");

  const left = partyLines(data.seller).flatMap((t) => doc.splitTextToSize(t, colW) as string[]);
  const right = partyLines(data.buyer).flatMap((t) => doc.splitTextToSize(t, colW) as string[]);
  const top = y + 14;
  left.forEach((t, i) => doc.text(t, colL, top + i * 12));
  right.forEach((t, i) => doc.text(t, colR, top + i * 12));
  y = top + Math.max(left.length, right.length) * 12 + 10;

  doc.line(40, y, W - 40, y);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.text("Item", 40, y);
  doc.text("Qty", 320, y, { align: "right" });
  doc.text("Rate", 400, y, { align: "right" });
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
    const label = l.freeQty ? `${l.name} (+${l.freeQty} free)` : l.name;
    doc.text(label.slice(0, 48), 40, y);
    doc.text(String(l.qty), 320, y, { align: "right" });
    doc.text(exactInr(l.rate).replace("₹", "Rs. "), 400, y, { align: "right" });
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
