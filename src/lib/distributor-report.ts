import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/sfa";

export type DetailRow = {
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
export type DetailReport = { title: string; description: string; columns: [string, string, string]; rows: DetailRow[] };

export async function fetchDistributorPanel() {
  const [orders, stock, invoices, distributors] = await Promise.all([
    (supabase.from("orders") as any)
      .select(
        "*, retailers(name, city, area, pincode), order_items(id, qty, free_qty, rate, amount, product_id, products(name, sku))",
      )
      .eq("kind", "secondary")
      .order("created_at", { ascending: false }),
    supabase.from("distributor_stock").select("*, products(name, sku, ptr)").order("physical_qty", { ascending: true }),
    supabase
      .from("invoices")
      .select("*, orders(order_no, retailers(name, city), order_items(id, qty, free_qty, rate, amount, products(name)))")
      .order("created_at", { ascending: false }),
    supabase.from("distributors").select("*"),
  ]);
  return {
    orders: orders.data ?? [],
    stock: stock.data ?? [],
    invoices: invoices.data ?? [],
    distributors: distributors.data ?? [],
  };
}

export type DistributorPanelData = Awaited<ReturnType<typeof fetchDistributorPanel>>;

const d = (v: unknown) => new Date(String(v)).toLocaleDateString("en-IN");

export function buildDistributorReports(data: DistributorPanelData): Record<string, DetailReport> {
  const orders = (data.orders ?? []) as any[];
  const pending = orders.filter((o: any) => o.status === "pending");
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o: any) => String(o.created_at).slice(0, 10) === todayStr);
  const lowStock = data.stock.filter((s) => s.physical_qty - s.reserved_qty <= 10);
  const billing = data.invoices.reduce((s, i) => s + Number(i.net_amount), 0);
  const outstanding = data.distributors.reduce((s, x) => s + Number(x.outstanding), 0);
  const stockValue = data.stock.reduce(
    (s, r) => s + r.physical_qty * Number((r.products as { ptr: number } | null)?.ptr ?? 0),
    0,
  );

  const orderRows = (list: any[]): DetailRow[] =>
    list.map((o: any) => {
      const r = o.retailers as { name: string; city?: string | null; area?: string | null; pincode?: string | null } | null;
      return {
        key: o.id,
        label: `${o.order_no} • ${r?.name ?? "Retailer"}`,
        sub: `${(o.order_items ?? []).length} SKU • ${o.status} • ${d(o.created_at)}`,
        value: inr(o.total_amount),
        city: r?.city ?? null,
        area: r?.area ?? null,
        pincode: r?.pincode ?? null,
      };
    });

  const invoiceRows: DetailRow[] = data.invoices.map((i) => ({
    key: i.id,
    label: i.invoice_no,
    sub: `${(i.orders as { order_no: string } | null)?.order_no ?? "—"} • CGST ${inr(i.cgst)} • SGST ${inr(i.sgst)} • ${d(i.created_at)}`,
    value: inr(i.net_amount),
  }));

  return {
    orders: {
      title: "Total Orders",
      description: `${orders.length} secondary orders`,
      columns: ["Order", "Details", "Value"],
      rows: orderRows(orders),
    },
    pending: {
      title: "Pending Orders",
      description: `${pending.length} orders awaiting action`,
      columns: ["Order", "Details", "Value"],
      rows: orderRows(pending),
    },
    billing: {
      title: "Billing",
      description: `${data.invoices.length} invoices • ${inr(billing)} billed`,
      columns: ["Invoice", "Details", "Net"],
      rows: invoiceRows,
    },
    outstanding: {
      title: "Outstanding",
      description: `Total ${inr(outstanding)} pending from the network`,
      columns: ["Distributor", "Area", "Outstanding"],
      rows: data.distributors.map((x) => ({
        key: x.id,
        label: x.name,
        sub: [x.city, x.state].filter(Boolean).join(", ") || "—",
        value: inr(x.outstanding),
        city: x.city,
        link: { type: "distributor" as const, id: x.id },
      })),
    },
    stockValue: {
      title: "Stock Value",
      description: `Warehouse value at PTR • ${inr(stockValue)}`,
      columns: ["Product", "Details", "Value"],
      rows: data.stock.map((s) => {
        const p = s.products as { name: string; sku: string; ptr: number } | null;
        return {
          key: s.id,
          label: p?.name ?? "Product",
          sub: `${p?.sku ?? "—"} • ${s.physical_qty} pcs @ ${inr(Number(p?.ptr ?? 0))}`,
          value: inr(s.physical_qty * Number(p?.ptr ?? 0)),
        };
      }),
    },
    invoices: {
      title: "Invoices",
      description: `${data.invoices.length} GST invoices generated`,
      columns: ["Invoice", "Details", "Net"],
      rows: invoiceRows,
    },
    lowStock: {
      title: "Low Stock SKUs",
      description: `${lowStock.length} SKUs at or below 10 available units`,
      columns: ["Product", "Details", "Available"],
      rows: lowStock.map((s) => {
        const p = s.products as { name: string; sku: string } | null;
        return {
          key: s.id,
          label: p?.name ?? "Product",
          sub: `${p?.sku ?? "—"} • Batch ${s.batch_no} • Reserved ${s.reserved_qty}`,
          value: `${s.physical_qty - s.reserved_qty} left`,
        };
      }),
    },
    todayOrders: {
      title: "Retail Orders Today",
      description: `${todayOrders.length} orders booked today`,
      columns: ["Order", "Details", "Value"],
      rows: orderRows(todayOrders),
    },
  };
}
