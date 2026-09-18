import { inr } from "@/lib/sfa";

export const rs = (n: number) => inr(n).replace("₹", "Rs. ");

export type PdfTable = {
  title: string;
  head: string[];
  rows: (string | number)[][];
  /** column alignment; defaults to left for col 0 and right for the rest */
  align?: ("left" | "right")[];
  /** optional absolute column widths in points; must sum to page width minus margins */
  widths?: number[];
};

export type ReportPdfData = {
  fileName: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  tables: PdfTable[];
};

export async function downloadReportPdf(data: ReportPdfData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = 40;
  const R = W - 40;
  let y = 52;

  const newPageIfNeeded = (need: number) => {
    if (y + need <= H - 48) return;
    doc.addPage();
    y = 52;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("POPPiK", L, y);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(data.title, R, y, { align: "right" });
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(110);
  if (data.subtitle) {
    doc.text(data.subtitle, R, y, { align: "right" });
    y += 12;
  }
  doc.text("Generated: " + new Date().toLocaleString("en-IN"), L, y);
  y += 14;
  doc.setTextColor(0);

  for (const line of data.meta ?? []) {
    doc.setFontSize(10);
    doc.text(line, L, y);
    y += 13;
  }

  y += 6;
  doc.setDrawColor(200);
  doc.line(L, y, R, y);
  y += 18;

  for (const table of data.tables) {
    newPageIfNeeded(70);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(table.title, L, y);
    y += 12;

    const cols = table.head.length;
    const alignRaw = table.align ?? table.head.map((_, i) => (i === 0 ? "left" : "right"));
    const align = (i: number): "left" | "right" => alignRaw[i] ?? (i === 0 ? "left" : "right");
    const avail = R - L;
    const widths =
      table.widths && table.widths.length === cols
        ? table.widths
        : cols > 1
          ? [avail * 0.34, ...Array(cols - 1).fill((avail - avail * 0.34) / (cols - 1))]
          : [avail];
    const xOf = (i: number) => L + widths.slice(0, i).reduce((s, w) => s + w, 0);
    const cellX = (i: number) => (align(i) === "right" ? xOf(i) + widths[i] : xOf(i));

    const drawHead = () => {
      doc.setFillColor(243, 238, 243);
      doc.rect(L, y - 10, R - L, 18, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      table.head.forEach((h, i) => doc.text(String(h), cellX(i), y + 2, { align: align(i) }));
      y += 20;
    };
    drawHead();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (table.rows.length === 0) {
      doc.setTextColor(130);
      doc.text("No data", L, y + 2);
      doc.setTextColor(0);
      y += 16;
    }
    for (const row of table.rows) {
      if (y > H - 60) {
        doc.addPage();
        y = 52;
        drawHead();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
      }
      row.forEach((cell, i) => {
        let text = String(cell ?? "");
        const maxW = widths[i] - 8;
        while (doc.getTextWidth(text) > maxW && text.length > 4) text = text.slice(0, -2);
        if (text !== String(cell ?? "")) text += "…";
        doc.text(text, cellX(i), y, { align: align(i) });
      });
      y += 14;
      doc.setDrawColor(235);
      doc.line(L, y - 10, R, y - 10);
    }
    y += 18;
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${p} of ${pages}`, R, H - 24, { align: "right" });
    doc.text("POPPiK Sales Force Automation", L, H - 24);
  }

  doc.save(data.fileName);
}
