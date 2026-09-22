import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/sfa";

export type AdminReportRow = {
  key: string;
  label: string;
  sub: string;
  value: string;
  link?: { id: string };
  city?: string | null | undefined;
  area?: string | null | undefined;
  pincode?: string | null | undefined;
  salesman?: string | null | undefined;
};
export type AdminReport = {
  title: string;
  description: string;
  columns: [string, string, string];
  rows: AdminReportRow[];
};

export async function fetchAdminPanel() {
  const [orders, invoices, collections, csas, distributors, retailers, profiles, attendance, stock, leaves] =
    await Promise.all([
      (supabase.from("orders") as any)
        .select(
          "id, kind, status, total_amount, created_at, order_no, retailer_id, distributor_id, salesman_id, retailers(name, city, area, pincode), distributors(name, city, state)",
        )
        .order("created_at", { ascending: false }),
      supabase.from("invoices").select("id, invoice_no, net_amount, created_at, order_id").order("created_at", { ascending: false }),
      (supabase.from("collections") as any)
        .select("id, amount, mode, reference, created_at, salesman_id, retailers(name, city, area, pincode)")
        .order("created_at", { ascending: false }),
      supabase.from("csas").select("id, name, city, state, phone, email").order("name"),
      supabase.from("distributors").select("id, name, city, state, outstanding, phone, email").order("name"),
      (supabase.from("retailers") as any).select("id, name, city, state, area, pincode, outstanding, credit_limit, retailer_type, phone, email").order("name"),
      supabase.from("profiles").select("id, full_name, phone, designation, employee_code"),
      supabase.from("attendance").select("user_id, punch_in, punch_out, work_date, location_label").order("work_date", { ascending: false }),
      supabase
        .from("distributor_stock")
        .select("id, physical_qty, reserved_qty, products(name, sku, ptr), distributors(name)"),
      supabase.from("leaves").select("id, user_id, leave_type, from_date, to_date, status, reason, created_at").order("created_at", { ascending: false }),
    ]);

  return {
    orders: orders.data ?? [],
    invoices: invoices.data ?? [],
    collections: collections.data ?? [],
    csas: csas.data ?? [],
    distributors: distributors.data ?? [],
    retailers: retailers.data ?? [],
    profiles: profiles.data ?? [],
    attendance: attendance.data ?? [],
    stock: stock.data ?? [],
    leaves: leaves.data ?? [],
  };
}

export type AdminPanel = Awaited<ReturnType<typeof fetchAdminPanel>>;

const num = (v: unknown) => Number(v ?? 0);
const dateStr = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("en-IN") : "—");
const dayStr = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("en-IN") : "—");

export function buildAdminReports(data: AdminPanel): Record<string, AdminReport> {
  const nameOf = (id: string | null | undefined) =>
    data.profiles.find((p) => p.id === id)?.full_name ?? "Team member";

  const today = new Date().toISOString().slice(0, 10);

  const allOrders = (data.orders ?? []) as any[];
  const primaryOrders = allOrders.filter((o: any) => o.kind === "primary");
  const secondaryOrders = allOrders.filter((o: any) => o.kind === "secondary");
  const pendingOrders = allOrders.filter((o: any) => o.status === "pending");
  const todayAttendance = data.attendance.filter((a) => a.work_date === today && a.punch_in);
  const lowStock = data.stock.filter((s) => num(s.physical_qty) - num(s.reserved_qty) <= 10);

  const orderRows = (list: any[], party: "primary" | "secondary"): AdminReportRow[] =>
    list.map((o: any) => {
      const r = o.retailers as { name: string; city?: string | null; area?: string | null; pincode?: string | null } | null;
      const dist = o.distributors as { name: string; city?: string | null } | null;
      return {
        key: o.id,
        label: o.order_no,
        sub: `${party === "primary" ? (dist?.name ?? "Distributor") : (r?.name ?? "Retailer")} • ${o.status} • ${dateStr(o.created_at)}`,
        value: inr(o.total_amount),
        city: party === "primary" ? dist?.city ?? null : r?.city ?? null,
        area: r?.area ?? null,
        pincode: r?.pincode ?? null,
        salesman: o.salesman_id ? nameOf(o.salesman_id) : null,
      };
    });

  return {
    "primary-sales": {
      title: "Primary Sales",
      description: "All distributor → company primary orders",
      columns: ["Order", "Distributor / Status / Date", "Amount"],
      rows: orderRows(primaryOrders, "primary"),
    },
    "secondary-sales": {
      title: "Secondary Sales",
      description: "All retailer secondary orders booked by field team",
      columns: ["Order", "Retailer / Status / Date", "Amount"],
      rows: orderRows(secondaryOrders, "secondary"),
    },
    collection: {
      title: "Collections",
      description: "Retailer payments received (Payment In)",
      columns: ["Retailer", "Mode / Collected by / Date", "Amount"],
      rows: (data.collections as any[]).map((c: any) => {
        const r = c.retailers as { name: string; city?: string | null; area?: string | null; pincode?: string | null } | null;
        return {
          key: c.id,
          label: r?.name ?? "Retailer",
          sub: `${c.mode}${c.reference ? ` • ${c.reference}` : ""} • ${nameOf(c.salesman_id)} • ${dateStr(c.created_at)}`,
          value: inr(c.amount),
          city: r?.city ?? null,
          area: r?.area ?? null,
          pincode: r?.pincode ?? null,
          salesman: nameOf(c.salesman_id),
        };
      }),
    },
    csas: {
      title: "CSA Network",
      description: "All CSAs / super stockists",
      columns: ["CSA", "City / Contact", "State"],
      rows: data.csas.map((c) => ({
        key: c.id,
        link: { id: c.id },
        label: c.name,
        sub: `${c.city ?? "—"}${c.phone ? ` • ${c.phone}` : ""}${c.email ? ` • ${c.email}` : ""}`,
        value: c.state ?? "—",
        city: c.city,
      })),
    },
    distributors: {
      title: "Distributor Network",
      description: "All distributors with outstanding balance",
      columns: ["Distributor", "City / Contact", "Outstanding"],
      rows: data.distributors.map((d) => ({
        key: d.id,
        label: d.name,
        sub: `${d.city ?? "—"}, ${d.state ?? "—"}${d.phone ? ` • ${d.phone}` : ""}${d.email ? ` • ${d.email}` : ""}`,
        value: inr(d.outstanding),
        city: d.city,
      })),
    },
    retailers: {
      title: "Retail Network",
      description: "All retailers / outlets with outstanding",
      columns: ["Retailer", "Type / City / Area / Pincode / Contact", "Outstanding"],
      rows: (data.retailers as any[]).map((r: any) => {
        return {
          key: r.id,
          label: r.name,
          sub: `${r.retailer_type ?? "—"} • ${r.city ?? "—"}${r.area ? `, ${r.area}` : ""}${r.pincode ? ` - ${r.pincode}` : ""}${r.phone ? ` • ${r.phone}` : ""}${r.email ? ` • ${r.email}` : ""}`,
          value: inr(r.outstanding),
          city: r.city,
          area: r.area,
          pincode: r.pincode,
        };
      }),
    },
    employees: {
      title: "Employees",
      description: "All user profiles in the system",
      columns: ["Name", "Designation / Code / Mobile", "—"],
      rows: data.profiles.map((p) => ({
        key: p.id,
        label: p.full_name,
        sub: `${p.designation ?? "—"}${p.employee_code ? ` • ${p.employee_code}` : ""}${p.phone ? ` • ${p.phone}` : ""}`,
        value: "",
      })),
    },
    "team-present": {
      title: "Team Present Today",
      description: `Attendance punched in on ${dayStr(today)}`,
      columns: ["Employee", "Punch in / Location", "Punch out"],
      rows: todayAttendance.map((a) => ({
        key: `${a.user_id}-${a.work_date}`,
        label: nameOf(a.user_id),
        sub: `${dateStr(a.punch_in)}${a.location_label ? ` • ${a.location_label}` : ""}`,
        value: a.punch_out ? dateStr(a.punch_out) : "Working",
        salesman: nameOf(a.user_id),
      })),
    },
    "pending-orders": {
      title: "Pending Orders",
      description: "Orders waiting for acceptance or processing",
      columns: ["Order", "Party / Date", "Amount"],
      rows: (pendingOrders as any[]).map((o: any) => {
        const r = o.retailers as { name: string; city?: string | null; area?: string | null; pincode?: string | null } | null;
        const dist = o.distributors as { name: string; city?: string | null } | null;
        return {
          key: o.id,
          label: o.order_no,
          sub: `${o.kind} • ${r?.name ?? dist?.name ?? "—"} • ${dateStr(o.created_at)}`,
          value: inr(o.total_amount),
          city: r?.city ?? dist?.city ?? null,
          area: r?.area ?? null,
          pincode: r?.pincode ?? null,
          salesman: o.salesman_id ? nameOf(o.salesman_id) : null,
        };
      }),
    },
    "low-stock": {
      title: "Low Stock SKUs",
      description: "Distributor stock with available quantity ≤ 10",
      columns: ["Product", "Distributor / SKU", "Available"],
      rows: lowStock.map((s) => ({
        key: s.id,
        label: (s.products as { name: string } | null)?.name ?? "Product",
        sub: `${(s.distributors as { name: string } | null)?.name ?? "—"} • ${(s.products as { sku: string } | null)?.sku ?? ""} • Physical ${s.physical_qty} / Reserved ${s.reserved_qty}`,
        value: String(num(s.physical_qty) - num(s.reserved_qty)),
      })),
    },
    "leave-requests": {
      title: "Leave Requests",
      description: "All leave applications and their status",
      columns: ["Employee", "Type / Dates / Reason", "Status"],
      rows: data.leaves.map((l) => ({
        key: l.id,
        label: nameOf(l.user_id),
        sub: `${l.leave_type} • ${dayStr(l.from_date)} → ${dayStr(l.to_date)}${l.reason ? ` • ${l.reason}` : ""}`,
        value: l.status,
        salesman: nameOf(l.user_id),
      })),
    },
  };
}
