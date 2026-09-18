import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/sfa";
import type { DetailReport, DetailRow } from "@/lib/distributor-report";

export async function fetchDepotPanelReport(depotId: string | null) {
  let orderQ = supabase
    .from("orders")
    .select("*, csas(name, city, state), order_items(id, qty, free_qty, rate, amount, products(name, sku))")
    .eq("kind", "depot")
    .order("created_at", { ascending: false });
  if (depotId) orderQ = orderQ.eq("depot_id", depotId);

  const [orders, stock, csas, invoices] = await Promise.all([
    orderQ,
    depotId
      ? supabase.from("depot_stock").select("*, products(name, sku, pts)").eq("depot_id", depotId)
      : supabase.from("depot_stock").select("*, products(name, sku, pts)"),
    depotId
      ? supabase.from("csas").select("*").eq("depot_id", depotId).order("name")
      : supabase.from("csas").select("*").order("name"),
    supabase
      .from("invoices")
      .select("*, orders(order_no, kind, depot_id, csas(name, city))")
      .order("created_at", { ascending: false }),
  ]);

  return {
    orders: orders.data ?? [],
    stock: stock.data ?? [],
    csas: csas.data ?? [],
    invoices: (invoices.data ?? []).filter((i) => {
      const o = i.orders as { kind: string; depot_id: string | null } | null;
      return o?.kind === "depot" && (!depotId || o.depot_id === depotId);
    }),
  };
}

export type DepotPanelData = Awaited<ReturnType<typeof fetchDepotPanelReport>>;

const d = (v: unknown) => new Date(String(v)).toLocaleDateString("en-IN");

export function buildDepotReports(data: DepotPanelData): Record<string, DetailReport> {
  const orders = data.orders;
  const pending = orders.filter((o) => o.status === "pending");
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => String(o.created_at).slice(0, 10) === todayStr);
  const lowStock = data.stock.filter((s) => s.physical_qty - s.reserved_qty <= 10);
  const billed = data.invoices.reduce((s, i) => s + Number(i.net_amount), 0);
  const stockValue = data.stock.reduce(
    (s, r) => s + r.physical_qty * Number((r.products as { pts: number } | null)?.pts ?? 0),
    0,
  );

  const orderRows = (list: typeof orders): DetailRow[] =>
    list.map((o) => {
      const c = o.csas as { name: string; city?: string | null } | null;
      return {
        key: o.id,
        label: `${o.order_no} • ${c?.name ?? "CSA"}`,
        sub: `${(o.order_items ?? []).length} SKU • ${o.status} • ${d(o.created_at)}`,
        value: inr(o.total_amount),
        city: c?.city ?? null,
      };
    });

  const invoiceRows: DetailRow[] = data.invoices.map((i) => {
    const o = i.orders as { order_no: string; csas: { name: string } | null } | null;
    return {
      key: i.id,
      label: i.invoice_no,
      sub: `${o?.csas?.name ?? "CSA"} • ${o?.order_no ?? "—"} • CGST ${inr(i.cgst)} • SGST ${inr(i.sgst)} • ${d(i.created_at)}`,
      value: inr(i.net_amount),
    };
  });

  const billedByCsa = new Map<string, number>();
  for (const i of data.invoices) {
    const name = ((i.orders as { csas: { name: string } | null } | null)?.csas?.name) ?? "Unmapped";
    billedByCsa.set(name, (billedByCsa.get(name) ?? 0) + Number(i.net_amount));
  }

  return {
    orders: {
      title: "CSA Orders",
      description: `${orders.length} depot orders from CSAs`,
      columns: ["Order", "Details", "Value"],
      rows: orderRows(orders),
    },
    pending: {
      title: "Pending CSA Orders",
      description: `${pending.length} orders awaiting approval`,
      columns: ["Order", "Details", "Value"],
      rows: orderRows(pending),
    },
    csas: {
      title: "CSAs",
      description: `${data.csas.length} super stockists mapped to the depot`,
      columns: ["CSA", "Area", "Billed"],
      rows: data.csas.map((c) => ({
        key: c.id,
        label: c.name,
        sub: [c.city, c.state].filter(Boolean).join(", ") || "—",
        value: inr(billedByCsa.get(c.name) ?? 0),
        city: c.city,
      })),
    },
    stockValue: {
      title: "Depot Stock Value",
      description: `Warehouse value at PTS • ${inr(stockValue)}`,
      columns: ["Product", "Details", "Value"],
      rows: data.stock.map((s) => {
        const p = s.products as { name: string; sku: string; pts: number } | null;
        return {
          key: s.id,
          label: p?.name ?? "Product",
          sub: `${p?.sku ?? "—"} • ${s.physical_qty} pcs @ ${inr(Number(p?.pts ?? 0))} • Reserved ${s.reserved_qty}`,
          value: inr(s.physical_qty * Number(p?.pts ?? 0)),
        };
      }),
    },
    invoices: {
      title: "Depot Invoices",
      description: `${data.invoices.length} GST invoices • ${inr(billed)} billed`,
      columns: ["Invoice", "Details", "Net"],
      rows: invoiceRows,
    },
    billing: {
      title: "Billing",
      description: `${data.invoices.length} invoices • ${inr(billed)} billed to CSAs`,
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
          sub: `${p?.sku ?? "—"} • Batch ${s.batch_no ?? "—"} • Reserved ${s.reserved_qty}`,
          value: `${s.physical_qty - s.reserved_qty} left`,
        };
      }),
    },
    todayOrders: {
      title: "CSA Orders Today",
      description: `${todayOrders.length} orders booked today`,
      columns: ["Order", "Details", "Value"],
      rows: orderRows(todayOrders),
    },
  };
}
