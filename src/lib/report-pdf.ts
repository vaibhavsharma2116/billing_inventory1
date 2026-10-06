import { inr } from "@/lib/sfa";

export const rs = (n: number) => inr(n).replace("₹", "Rs. ");

export type PdfTable = {
  title: string;
  head: string[];
  rows: (string | number)[][];
  align?: ("left" | "right")[];
  widths?: number[];
};

export type ReportPdfData = {
  fileName: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  tables: PdfTable[];
};

export async function downloadReportExcel(data: ReportPdfData) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  for (const table of data.tables) {
    const wsData: any[][] = [];
    
    wsData.push([data.title]);
    if (data.subtitle) wsData.push([data.subtitle]);
    for (const m of data.meta ?? []) wsData.push([m]);
    wsData.push([]); 

    wsData.push(table.head);
    for (const row of table.rows) {
      wsData.push(row);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    let sheetName = table.title.substring(0, 31).replace(/[\[\]\*\/\?\:]/g, "").trim();
    if (!sheetName) sheetName = "Report";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, data.fileName.replace(".pdf", ".xlsx"));
}

async function _generatePdf(data: ReportPdfData) {
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
  doc.text("Poppik Lifestyle Private Limited", L, y);
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

export async function downloadReportPdf(data: ReportPdfData) {
  const div = document.createElement('div');
  div.id = "export-dialog-backdrop";
  div.style.position = "fixed";
  div.style.top = "0";
  div.style.left = "0";
  div.style.width = "100vw";
  div.style.height = "100vh";
  div.style.background = "rgba(0,0,0,0.4)";
  div.style.backdropFilter = "blur(2px)";
  div.style.zIndex = "99999";
  div.style.display = "flex";
  div.style.alignItems = "center";
  div.style.justifyContent = "center";
  div.style.fontFamily = "system-ui, -apple-system, sans-serif";
  div.style.opacity = "0";
  div.style.transition = "opacity 0.2s ease";

  div.innerHTML = `
    <div style="background:white;padding:24px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.1);max-width:320px;width:100%;transform:translateY(10px);transition:transform 0.2s ease;" id="export-dialog-box">
      <h3 style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#0f172a;">Export Report</h3>
      <p style="margin:0 0 24px 0;font-size:14px;color:#64748b;line-height:1.4;">Choose the format you want to download:</p>
      
      <div style="display:flex;gap:12px;flex-direction:column;">
        <button id="btn-export-pdf" style="padding:10px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-weight:500;color:#0f172a;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s ease;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Download PDF
        </button>
        <button id="btn-export-excel" style="padding:10px 16px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:500;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s ease;box-shadow:0 2px 4px rgba(16,185,129,0.2);">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
          Download Excel
        </button>
      </div>
      
      <div style="margin-top:20px;text-align:right;">
        <button id="btn-export-cancel" style="padding:6px 12px;background:none;border:none;cursor:pointer;color:#64748b;font-size:14px;font-weight:500;transition:color 0.15s ease;">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  
  // Animate in
  setTimeout(() => {
    div.style.opacity = "1";
    document.getElementById('export-dialog-box')!.style.transform = "translateY(0)";
  }, 10);

  const close = () => {
    div.style.opacity = "0";
    document.getElementById('export-dialog-box')!.style.transform = "translateY(10px)";
    setTimeout(() => {
      if (document.body.contains(div)) document.body.removeChild(div);
    }, 200);
  };

  // Hover effects
  const btnPdf = document.getElementById('btn-export-pdf')!;
  const btnExcel = document.getElementById('btn-export-excel')!;
  const btnCancel = document.getElementById('btn-export-cancel')!;
  
  btnPdf.onmouseover = () => btnPdf.style.background = "#f1f5f9";
  btnPdf.onmouseout = () => btnPdf.style.background = "#f8fafc";
  
  btnExcel.onmouseover = () => btnExcel.style.background = "#059669";
  btnExcel.onmouseout = () => btnExcel.style.background = "#10b981";
  
  btnCancel.onmouseover = () => btnCancel.style.color = "#0f172a";
  btnCancel.onmouseout = () => btnCancel.style.color = "#64748b";

  btnPdf.onclick = () => { close(); _generatePdf(data); };
  btnExcel.onclick = () => { close(); downloadReportExcel(data); };
  btnCancel.onclick = () => close();
  
  // Close on backdrop click
  div.onclick = (e) => {
    if (e.target === div) close();
  };
}
