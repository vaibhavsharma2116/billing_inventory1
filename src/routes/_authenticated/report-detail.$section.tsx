import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { compactInr, inr } from "@/lib/sfa";
import { downloadReportPdf, rs } from "@/lib/report-pdf";

const SECTIONS = ["distributor", "area", "city", "product", "team"] as const;
type SectionKey = (typeof SECTIONS)[number];

const TITLES: Record<SectionKey, string> = {
  distributor: "Distributor-wise Sales Report",
  area: "Area-wise Sales Report",
  city: "City Network Report",
  product: "Product-wise Sales Report",
  team: "Team Target vs Achievement Report",
};

export const Route = createFileRoute("/_authenticated/report-detail/$section")({
  beforeLoad: ({ params }) => {
    if (!SECTIONS.includes(params.section as SectionKey)) throw notFound();
  },
  head: ({ params }) => {
    const t = TITLES[params.section as SectionKey] ?? "Report";
    return {
      meta: [
        { title: `${t} — POPPiK SFA` },
        { name: "description", content: `${t} with full detail, filters and PDF download.` },
        { property: "og:title", content: `${t} — POPPiK SFA` },
        { property: "og:description", content: `${t} with full detail, filters and PDF download.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ReportDetailPage,
});

type Range = "30" | "90" | "365" | "all";
const rangeStart = (r: Range) => {
  if (r === "all") return "1970-01-01T00:00:00Z";
  const d = new Date();
  d.setDate(d.getDate() - Number(r));
  return d.toISOString();
};

function ReportDetailPage() {
  const { section } = Route.useParams();
  const key = section as SectionKey;
  const [range, setRange] = useState<Range>("90");
  const [expanded, setExpanded] = useState<string | null>(null);
  const from = rangeStart(range);

  const { data, isLoading } = useQuery({
    queryKey: ["report-detail", range],
    queryFn: async () => {
      const [orders, items, targets, profiles, collections, distributors, retailers] = await Promise.all([
        supabase
          .from("orders")
          .select("id, kind, status, total_amount, created_at, salesman_id, distributor_id, retailers(name, city), distributors(name, city, state)")
          .gte("created_at", from),
        supabase
          .from("order_items")
          .select("qty, free_qty, amount, products(name, sku, category), orders!inner(created_at)")
          .gte("orders.created_at", from),
        supabase.from("targets").select("user_id, target_amount"),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("collections").select("amount, created_at").gte("created_at", from),
        supabase.from("distributors").select("id, name, city, state, outstanding"),
        supabase.from("retailers").select("id, name, city, state, retailer_type, outstanding, distributor_id"),
      ]);
      return {
        orders: orders.data ?? [],
        items: items.data ?? [],
        targets: targets.data ?? [],
        profiles: profiles.data ?? [],
        collections: collections.data ?? [],
        distributors: distributors.data ?? [],
        retailers: retailers.data ?? [],
      };
    },
  });

  const orders = data?.orders ?? [];
  const totalSales = useMemo(() => orders.reduce((s, o) => s + Number(o.total_amount), 0), [orders]);

  const table = useMemo(() => {
    if (!data) return { head: [] as string[], rows: [] as string[][], stats: [] as { label: string; value: string }[] };

    if (key === "distributor") {
      const map = new Map<string, { name: string; area: string; primary: number; secondary: number; orders: number }>();
      for (const o of orders) {
        const d = o.distributors as { name: string; city: string | null; state: string | null } | null;
        const k = d?.name ?? "Unmapped";
        const cur = map.get(k) ?? { name: k, area: [d?.city, d?.state].filter(Boolean).join(", "), primary: 0, secondary: 0, orders: 0 };
        if (o.kind === "primary") cur.primary += Number(o.total_amount);
        else cur.secondary += Number(o.total_amount);
        cur.orders += 1;
        map.set(k, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.primary + b.secondary - (a.primary + a.secondary));
      return {
        head: ["Distributor", "Area", "Orders", "Primary", "Secondary", "Total", "Share"],
        rows: rows.map((d) => [
          d.name,
          d.area || "—",
          String(d.orders),
          rs(d.primary),
          rs(d.secondary),
          rs(d.primary + d.secondary),
          `${totalSales > 0 ? Math.round(((d.primary + d.secondary) / totalSales) * 100) : 0}%`,
        ]),
        stats: [
          { label: "Distributors billed", value: String(rows.length) },
          { label: "Total sales", value: compactInr(totalSales) },
          { label: "Orders", value: String(orders.length) },
        ],
      };
    }

    if (key === "area") {
      const map = new Map<string, { area: string; value: number; orders: number }>();
      for (const o of orders) {
        const r = o.retailers as { city: string | null } | null;
        const d = o.distributors as { city: string | null; state: string | null } | null;
        const k = r?.city ?? d?.city ?? d?.state ?? "Unknown";
        const cur = map.get(k) ?? { area: k, value: 0, orders: 0 };
        cur.value += Number(o.total_amount);
        cur.orders += 1;
        map.set(k, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.value - a.value);
      return {
        head: ["Area / City", "Orders", "Sales Value", "Avg Order", "Share"],
        rows: rows.map((a) => [
          a.area,
          String(a.orders),
          rs(a.value),
          rs(a.orders ? a.value / a.orders : 0),
          `${totalSales > 0 ? Math.round((a.value / totalSales) * 100) : 0}%`,
        ]),
        stats: [
          { label: "Areas covered", value: String(rows.length) },
          { label: "Total sales", value: compactInr(totalSales) },
        ],
      };
    }

    if (key === "city") {
      const cities = new Map<string, { city: string; distributors: number; outlets: number; retail: number; rba: number; ba: number; outstanding: number }>();
      const ensure = (c: string) => {
        const cur = cities.get(c) ?? { city: c, distributors: 0, outlets: 0, retail: 0, rba: 0, ba: 0, outstanding: 0 };
        cities.set(c, cur);
        return cur;
      };
      for (const d of data.distributors) ensure(d.city || d.state || "Unknown").distributors += 1;
      for (const r of data.retailers) {
        const c = ensure(r.city || r.state || "Unknown");
        c.outlets += 1;
        if (r.retailer_type === "rba") c.rba += 1;
        else if (r.retailer_type === "ba") c.ba += 1;
        else c.retail += 1;
        c.outstanding += Number(r.outstanding ?? 0);
      }
      const rows = [...cities.values()].sort((a, b) => b.outlets - a.outlets || b.distributors - a.distributors);
      const totD = data.distributors.length;
      const totR = data.retailers.length;
      return {
        head: ["City", "Distributors", "Total Outlets", "Retail Outlets", "RBA Counters", "BA Counters", "Retailer Outstanding"],
        rows: rows.map((c) => [
          c.city,
          String(c.distributors),
          String(c.outlets),
          String(c.retail),
          String(c.rba),
          String(c.ba),
          rs(c.outstanding),
        ]),
        stats: [
          { label: "Cities", value: String(rows.length) },
          { label: "Distributors", value: String(totD) },
          { label: "Total outlets", value: String(totR) },
          { label: "RBA counters", value: String(data.retailers.filter((r) => r.retailer_type === "rba").length) },
        ],
      };
    }

    if (key === "product") {
      const map = new Map<string, { name: string; sku: string; category: string; qty: number; free: number; value: number }>();
      for (const it of data.items) {
        const p = it.products as { name: string; sku: string; category: string | null } | null;
        const k = p?.sku ?? "—";
        const cur = map.get(k) ?? { name: p?.name ?? "Unknown", sku: k, category: p?.category ?? "—", qty: 0, free: 0, value: 0 };
        cur.qty += Number(it.qty ?? 0);
        cur.free += Number(it.free_qty ?? 0);
        cur.value += Number(it.amount ?? 0);
        map.set(k, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.value - a.value);
      return {
        head: ["Product", "SKU", "Category", "Qty", "Free Qty", "Avg Rate", "Value"],
        rows: rows.map((p) => [p.name, p.sku, p.category, String(p.qty), String(p.free), rs(p.qty ? p.value / p.qty : 0), rs(p.value)]),
        stats: [
          { label: "Products sold", value: String(rows.length) },
          { label: "Total value", value: compactInr(rows.reduce((s, r) => s + r.value, 0)) },
          { label: "Units", value: String(rows.reduce((s, r) => s + r.qty, 0)) },
        ],
      };
    }

    // team
    const names = new Map(data.profiles.map((p) => [p.id, p.full_name || "Unnamed"]));
    const targetByUser = new Map<string, number>();
    for (const t of data.targets) targetByUser.set(t.user_id, (targetByUser.get(t.user_id) ?? 0) + Number(t.target_amount));
    const map = new Map<string, { name: string; sales: number; orders: number; target: number }>();
    for (const o of orders) {
      if (!o.salesman_id) continue;
      const cur = map.get(o.salesman_id) ?? { name: names.get(o.salesman_id) ?? "Unknown", sales: 0, orders: 0, target: targetByUser.get(o.salesman_id) ?? 0 };
      cur.sales += Number(o.total_amount);
      cur.orders += 1;
      map.set(o.salesman_id, cur);
    }
    for (const [uid, target] of targetByUser) if (!map.has(uid)) map.set(uid, { name: names.get(uid) ?? "Unknown", sales: 0, orders: 0, target });
    const rows = [...map.values()].sort((a, b) => b.sales - a.sales);
    const totTarget = rows.reduce((s, r) => s + r.target, 0);
    return {
      head: ["Salesman", "Orders", "Achieved", "Target", "Gap", "Achievement"],
      rows: rows.map((s) => [
        s.name,
        String(s.orders),
        rs(s.sales),
        rs(s.target),
        rs(Math.max(0, s.target - s.sales)),
        s.target > 0 ? `${Math.round((s.sales / s.target) * 100)}%` : "—",
      ]),
      stats: [
        { label: "Team members", value: String(rows.length) },
        { label: "Total target", value: compactInr(totTarget) },
        { label: "Achieved", value: compactInr(rows.reduce((s, r) => s + r.sales, 0)) },
      ],
    };
  }, [data, key, orders, totalSales]);

  const exportPdf = () =>
    downloadReportPdf({
      fileName: `${key}-report.pdf`,
      title: TITLES[key],
      subtitle: range === "all" ? "All time" : `Last ${range} days`,
      tables: [{ title: TITLES[key], head: table.head, rows: table.rows }],
    });

  return (
    <Shell
      title={TITLES[key]}
      subtitle="Full page report with PDF download"
      nav={[
        { to: "/admin", label: "Control Tower" },
        { to: "/reports", label: "Reports" },
        { to: "/live-map", label: "Live Map" },
      ]}
    >
      <div className="flex flex-wrap items-center gap-2">
        {(["30", "90", "365", "all"] as Range[]).map((r) => (
          <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
            {r === "all" ? "All time" : `Last ${r} days`}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/reports">Back to Reports</Link>
          </Button>
          <Button size="sm" onClick={exportPdf} disabled={!data}>
            Download PDF
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        {table.stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      <Section title={TITLES[key]}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                {table.head.map((h) => (
                  <th key={h} className="p-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr><td className="p-4 text-muted-foreground" colSpan={table.head.length}>Loading…</td></tr>
              ) : table.rows.length === 0 ? (
                <tr><td className="p-4 text-muted-foreground" colSpan={table.head.length}>No records in this period.</td></tr>
               ) : (
                 table.rows.map((row, i) => {
                   const cityKey = key === "city" ? row[0] : null;
                   const cityDistributors =
                     cityKey && data ? data.distributors.filter((x) => (x.city || x.state || "Unknown") === cityKey) : [];
                   const cityRetailers =
                     cityKey && data ? data.retailers.filter((x) => (x.city || x.state || "Unknown") === cityKey) : [];
                   return (
                     <Fragment key={i}>
                       <tr
                         className={cityKey ? "cursor-pointer hover:bg-muted/40" : ""}
                         onClick={() => cityKey && setExpanded(expanded === cityKey ? null : cityKey)}
                       >
                         {row.map((cell, j) => (
                           <td key={j} className={`p-3 ${j === 0 ? "font-medium" : "tabular-nums"}`}>
                             {cityKey && (j === 1 || j === 2) ? (
                               <span className="underline decoration-dotted underline-offset-2">{cell}</span>
                             ) : (
                               cell
                             )}
                           </td>
                         ))}
                       </tr>
                       {cityKey && expanded === cityKey && (
                         <tr>
                           <td colSpan={table.head.length} className="bg-muted/30 p-4">
                             <div className="grid gap-4 md:grid-cols-2">
                               <div>
                                 <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                   Distributors ({cityDistributors.length})
                                 </p>
                                 <div className="space-y-1">
                                   {cityDistributors.length === 0 ? (
                                     <p className="text-sm text-muted-foreground">No distributors in this city.</p>
                                   ) : (
                                     cityDistributors.map((x) => (
                                       <div key={x.id} className="flex items-center justify-between rounded border border-border/60 px-3 py-1.5 text-sm">
                                         <span className="font-medium">{x.name}</span>
                                         <span className="tabular-nums text-muted-foreground">OS: {inr(x.outstanding)}</span>
                                       </div>
                                     ))
                                   )}
                                 </div>
                               </div>
                               <div>
                                 <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                   Outlets ({cityRetailers.length})
                                 </p>
                                 <div className="space-y-1">
                                   {cityRetailers.length === 0 ? (
                                     <p className="text-sm text-muted-foreground">No outlets in this city.</p>
                                   ) : (
                                     cityRetailers.map((x) => (
                                       <div key={x.id} className="flex items-center justify-between rounded border border-border/60 px-3 py-1.5 text-sm">
                                         <span className="font-medium">
                                           {x.name} <span className="text-xs uppercase text-muted-foreground">({x.retailer_type ?? "retail"})</span>
                                         </span>
                                         <span className="tabular-nums text-muted-foreground">OS: {inr(x.outstanding)}</span>
                                       </div>
                                     ))
                                   )}
                                 </div>
                               </div>
                             </div>
                           </td>
                         </tr>
                       )}
                     </Fragment>
                   );
                 })
               )}
            </tbody>
          </table>
        </div>
      </Section>
    </Shell>
  );
}
