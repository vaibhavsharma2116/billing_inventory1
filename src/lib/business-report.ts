import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/sfa";

export type BizRow = {
  key: string;
  label: string;
  sub: string;
  value: string;
  link?: { type: "retailer" | "distributor"; id: string };
  city?: string | null;
  area?: string | null;
  pincode?: string | null;
  salesman?: string | null;
};
export type BizReport = { title: string; description: string; columns: [string, string, string]; rows: BizRow[] };

export async function fetchBusinessData(from: string, to: string) {
  const fromIso = new Date(from + "T00:00:00").toISOString();
  const toIso = new Date(to + "T23:59:59").toISOString();
  const [orders, invoices, retailers, distributors] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_no, kind, status, total_amount, created_at, retailers(name, city, retailer_type), distributors(name, city, state), csas(name, city)",
      )
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, invoice_no, taxable_value, cgst, sgst, igst, net_amount, created_at, orders(order_no, retailers(name, city))")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false }),
    supabase.from("retailers").select("id, name, city, retailer_type, outstanding, credit_limit"),
    supabase.from("distributors").select("id, name, city, state, outstanding"),
  ]);
  return {
    orders: orders.data ?? [],
    invoices: invoices.data ?? [],
    retailers: retailers.data ?? [],
    distributors: distributors.data ?? [],
  };
}

export type BusinessData = Awaited<ReturnType<typeof fetchBusinessData>>;

const d = (v: unknown) => new Date(String(v)).toLocaleDateString("en-IN");

export function buildBusinessReports(data: BusinessData): Record<string, BizReport> {
  const sales = data.orders.filter((o) => o.kind === "secondary");
  const purchase = data.orders.filter((o) => o.kind === "primary");

  const orderRows = (list: typeof data.orders): BizRow[] =>
    list.map((o) => {
      const r = o.retailers as { name: string; city: string | null } | null;
      const dist = o.distributors as { name: string; city: string | null; state: string | null } | null;
      const csa = o.csas as { name: string; city: string | null } | null;
      const party = r?.name ?? csa?.name ?? dist?.name ?? "—";
      const area = r?.city ?? csa?.city ?? dist?.city ?? dist?.state ?? "—";
      return {
        key: o.id,
        label: `${o.order_no} • ${party}`,
        sub: `${area} • ${o.status} • ${d(o.created_at)}`,
        value: inr(o.total_amount),
        city: r?.city ?? csa?.city ?? dist?.city ?? null,
      };
    });

  const outParties = [
    ...data.retailers.map((r) => ({
      id: r.id,
      type: "retailer" as const,
      name: r.name,
      area: r.city ?? "—",
      outstanding: Number(r.outstanding),
      limit: Number(r.credit_limit),
    })),
    ...data.distributors.map((x) => ({
      id: x.id,
      type: "distributor" as const,
      name: x.name,
      area: [x.city, x.state].filter(Boolean).join(", ") || "—",
      outstanding: Number(x.outstanding),
      limit: 0,
    })),
  ]
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
  const outTotal = outParties.reduce((s, r) => s + r.outstanding, 0);
  const outstandingRows: BizRow[] = outParties.map((r) => ({
      key: `${r.type}-${r.id}`,
      label: r.name,
      sub: `${r.type === "retailer" ? "Retailer" : "Distributor"} • ${r.area}${r.limit ? ` • Limit ${inr(r.limit)}` : ""}`,
      value: inr(r.outstanding),
      link: { type: r.type, id: r.id },
      city: r.area,
  }));

  const gstTotal = data.invoices.reduce((s, i) => s + Number(i.cgst) + Number(i.sgst) + Number(i.igst), 0);

  return {
    sales: {
      title: "Sales (Secondary)",
      description: `${sales.length} secondary orders • ${inr(sales.reduce((s, o) => s + Number(o.total_amount), 0))}`,
      columns: ["Order", "Details", "Value"],
      rows: orderRows(sales),
    },
    purchase: {
      title: "Purchase (Primary)",
      description: `${purchase.length} primary orders • ${inr(purchase.reduce((s, o) => s + Number(o.total_amount), 0))}`,
      columns: ["Order", "Details", "Value"],
      rows: orderRows(purchase),
    },
    gst: {
      title: "GST Collected",
      description: `${data.invoices.length} invoices • ${inr(gstTotal)} tax collected`,
      columns: ["Invoice", "Details", "GST"],
      rows: data.invoices.map((i) => {
        const o = i.orders as { order_no: string; retailers: { name: string; city: string | null } | null } | null;
        const tax = Number(i.cgst) + Number(i.sgst) + Number(i.igst);
        return {
          key: i.id,
          label: `${i.invoice_no} • ${o?.retailers?.name ?? "—"}`,
          sub: `Taxable ${inr(i.taxable_value)} • CGST ${inr(i.cgst)} • SGST ${inr(i.sgst)} • IGST ${inr(i.igst)} • Net ${inr(i.net_amount)} • ${d(i.created_at)}`,
          value: inr(tax),
          city: o?.retailers?.city ?? null,
        };
      }),
    },
    outstanding: {
      title: "Outstanding",
      description: `${outstandingRows.length} parties • ${inr(outTotal)} pending`,
      columns: ["Party", "Details", "Outstanding"],
      rows: outstandingRows,
    },
  };
}
