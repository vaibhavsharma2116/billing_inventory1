import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe, roleHome } from "@/hooks/useAuth";
import { compactInr, inr } from "@/lib/sfa";
import { downloadReportPdf, rs } from "@/lib/report-pdf";

export const Route = createFileRoute("/_authenticated/business-reports")({
  validateSearch: (search: Record<string, unknown>): { panel?: "depot" | "distributor" | undefined } => ({
    panel: search["panel"] === "depot" || search["panel"] === "distributor" ? search["panel"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Business Reports — POPPiK SFA" },
      {
        name: "description",
        content:
          "Month-wise sales and purchase, area, city and outlet-wise sales, outstanding payments and GST summary with charts and filters.",
      },
      { property: "og:title", content: "Business Reports — POPPiK SFA" },
      { property: "og:description", content: "Graphical business analytics: sales, purchase, outstanding and GST reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BusinessReportsPage,
});

const CHART = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const monthKey = (v: unknown) => String(v).slice(0, 7);
const monthLabel = (k: string) =>
  new Date(k + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

function fmtAxis(n: number) {
  return compactInr(n).replace("₹", "");
}

type Order = {
  id: string;
  kind: string;
  status: string;
  total_amount: number;
  created_at: string;
  retailers: { name: string; city: string | null; retailer_type: string | null; outstanding: number } | null;
  distributors: { name: string; city: string | null; state: string | null } | null;
  csas: { name: string; city: string | null } | null;
};

function BusinessReportsPage() {
  const { panel } = Route.useSearch();
  const today = new Date();
  const defFrom = new Date(today.getFullYear(), today.getMonth() - 11, 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defFrom);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const openCard = (card: string) =>
    navigate({ to: "/business-report/$card", params: { card }, search: { from, to, q: "", panel } });

  const { data, isLoading } = useQuery({
    queryKey: ["business-reports", from, to],
    queryFn: async () => {
      const fromIso = new Date(from + "T00:00:00").toISOString();
      const toIso = new Date(to + "T23:59:59").toISOString();
      const [orders, invoices, retailers, distributors] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, kind, status, total_amount, created_at, retailers(name, city, retailer_type, outstanding), distributors(name, city, state), csas(name, city)",
          )
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        supabase
          .from("invoices")
          .select("id, invoice_no, taxable_value, cgst, sgst, igst, net_amount, created_at, orders(order_no, retailers(name, city))")
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        supabase.from("retailers").select("id, name, city, retailer_type, outstanding, credit_limit"),
        supabase.from("distributors").select("id, name, city, state, outstanding"),
      ]);
      return {
        orders: (orders.data ?? []) as unknown as Order[],
        invoices: invoices.data ?? [],
        retailers: retailers.data ?? [],
        distributors: distributors.data ?? [],
      };
    },
  });

  const orders = data?.orders ?? [];
  const invoices = data?.invoices ?? [];

  const sales = orders.filter((o) => o.kind === "secondary");
  const purchases = orders.filter((o) => o.kind === "primary");

  const totals = useMemo(() => {
    const s = sales.reduce((a, o) => a + Number(o.total_amount), 0);
    const p = purchases.reduce((a, o) => a + Number(o.total_amount), 0);
    const gst = invoices.reduce((a, i) => a + Number(i.cgst) + Number(i.sgst) + Number(i.igst), 0);
    const outRetail = (data?.retailers ?? []).reduce((a, r) => a + Number(r.outstanding), 0);
    const outDist = (data?.distributors ?? []).reduce((a, r) => a + Number(r.outstanding), 0);
    return { sales: s, purchase: p, gst, outstanding: outRetail + outDist, outRetail, outDist };
  }, [sales, purchases, invoices, data?.retailers, data?.distributors]);

  const monthly = useMemo(() => {
    const map = new Map<string, { key: string; month: string; sales: number; purchase: number; orders: number }>();
    for (const o of orders) {
      const k = monthKey(o.created_at);
      const cur = map.get(k) ?? { key: k, month: monthLabel(k), sales: 0, purchase: 0, orders: 0 };
      if (o.kind === "primary") cur.purchase += Number(o.total_amount);
      else cur.sales += Number(o.total_amount);
      cur.orders += 1;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [orders]);

  const group = (rows: Order[], pick: (o: Order) => string) => {
    const map = new Map<string, { name: string; value: number; orders: number }>();
    for (const o of rows) {
      const key = pick(o) || "Unknown";
      const cur = map.get(key) ?? { name: key, value: 0, orders: 0 };
      cur.value += Number(o.total_amount);
      cur.orders += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  };

  const byArea = useMemo(
    () => group(sales, (o) => o.retailers?.city ?? o.distributors?.state ?? o.distributors?.city ?? "Unknown"),
    [sales],
  );
  const byCity = useMemo(() => group(sales, (o) => o.retailers?.city ?? "Unknown"), [sales]);
  const byOutlet = useMemo(() => group(sales, (o) => o.retailers?.name ?? "Unmapped outlet"), [sales]);
  const byOutletType = useMemo(
    () => group(sales, (o) => (o.retailers?.retailer_type === "ba" ? "BA Outlet" : "Retail Outlet")),
    [sales],
  );

  const { data: me } = useMe();
  const backTo = panel === "depot"
    ? "/depot"
    : panel === "distributor"
      ? "/distributor"
      : ((me?.role ? roleHome[me.role] : "/home") ?? "/home");

  const gstMonthly = useMemo(() => {
    const map = new Map<string, { key: string; month: string; taxable: number; cgst: number; sgst: number; igst: number; net: number }>();
    for (const i of invoices) {
      const k = monthKey(i.created_at);
      const cur = map.get(k) ?? { key: k, month: monthLabel(k), taxable: 0, cgst: 0, sgst: 0, igst: 0, net: 0 };
      cur.taxable += Number(i.taxable_value);
      cur.cgst += Number(i.cgst);
      cur.sgst += Number(i.sgst);
      cur.igst += Number(i.igst);
      cur.net += Number(i.net_amount);
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [invoices]);

  const outstandingRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = [
      ...(data?.retailers ?? []).map((r) => ({
        id: r.id,
        type: "retailer" as const,
        name: r.name,
        area: r.city ?? "—",
        outstanding: Number(r.outstanding),
        limit: Number(r.credit_limit),
      })),
      ...(data?.distributors ?? []).map((d) => ({
        id: d.id,
        type: "distributor" as const,
        name: d.name,
        area: [d.city, d.state].filter(Boolean).join(", ") || "—",
        outstanding: Number(d.outstanding),
        limit: 0,
      })),
    ].filter((r) => r.outstanding > 0);
    return rows
      .filter((r) => !term || r.name.toLowerCase().includes(term) || r.area.toLowerCase().includes(term))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [data?.retailers, data?.distributors, q]);

  const exportAll = () => {
    downloadReportPdf({
      fileName: `poppik-business-report-${from}-to-${to}.pdf`,
      title: "Business Report",
      subtitle: `${from} to ${to}`,
      meta: [
        `Sales: ${rs(totals.sales)}`,
        `Purchase: ${rs(totals.purchase)}`,
        `GST collected: ${rs(totals.gst)}`,
        `Outstanding: ${rs(totals.outstanding)}`,
      ],
      tables: [
        {
          title: "Month-wise Sales vs Purchase",
          head: ["Month", "Sales", "Purchase", "Orders"],
          rows: monthly.map((m) => [m.month, rs(m.sales), rs(m.purchase), m.orders]),
        },
        { title: "Area-wise Sales", head: ["Area", "Orders", "Sales"], rows: byArea.map((r) => [r.name, r.orders, rs(r.value)]) },
        { title: "City-wise Sales", head: ["City", "Orders", "Sales"], rows: byCity.map((r) => [r.name, r.orders, rs(r.value)]) },
        {
          title: "Outlet-wise Sales",
          head: ["Outlet", "Orders", "Sales"],
          rows: byOutlet.map((r) => [r.name, r.orders, rs(r.value)]),
        },
        {
          title: "Outstanding Payments",
          head: ["Party", "Type", "Area", "Outstanding"],
          rows: outstandingRows.map((r) => [r.name, r.type, r.area, rs(r.outstanding)]),
        },
        {
          title: "GST Summary",
          head: ["Month", "Taxable", "CGST", "SGST", "IGST", "Net"],
          rows: gstMonthly.map((g) => [g.month, rs(g.taxable), rs(g.cgst), rs(g.sgst), rs(g.igst), rs(g.net)]),
        },
      ],
    }).catch((e: Error) => toast.error(e.message));
  };

  const empty = (msg: string) => <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : msg}</p>;

  const listRows = (rows: { name: string; value: number; orders: number }[], total: number) =>
    rows.length === 0
      ? empty("No sales in this period.")
      : rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {r.orders} orders • {total > 0 ? Math.round((r.value / total) * 100) : 0}% share
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{inr(r.value)}</span>
          </div>
        ));

  return (
    <Shell title="Business Reports" subtitle="Sales • Purchase • Area • Outlet • Outstanding • GST">
      <div className="flex flex-wrap items-end gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={backTo}>
            <ArrowLeft className="mr-1 size-3.5" /> Back to panel
          </Link>
        </Button>
        <div>
          <Label className="text-[11px] text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Search party / area</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or city" className="h-9 w-[190px]" />
        </div>
        <Button size="sm" onClick={exportAll}>
          <Download className="mr-1 size-3.5" /> Download PDF
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sales (Secondary)" value={compactInr(totals.sales)} tone="success" hint={`${sales.length} orders`} onClick={() => openCard("sales")} />
        <StatCard label="Purchase (Primary)" value={compactInr(totals.purchase)} tone="primary" hint={`${purchases.length} orders`} onClick={() => openCard("purchase")} />
        <StatCard label="GST Collected" value={compactInr(totals.gst)} tone="warning" hint={`${invoices.length} invoices`} onClick={() => openCard("gst")} />
        <StatCard label="Outstanding" value={compactInr(totals.outstanding)} tone="danger" hint="Retailers + distributors" onClick={() => openCard("outstanding")} />

      </div>

      <Section title="Month-wise Sales vs Purchase">
        <div className="h-72 w-full p-3">
          {monthly.length === 0 ? (
            empty("No orders in this period.")
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={54} />
                <Tooltip formatter={(v: number) => inr(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sales" name="Sales" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchase" name="Purchase" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>

      <Tabs defaultValue="area" className="mt-6">
        <TabsList>
          <TabsTrigger value="area">Area-wise</TabsTrigger>
          <TabsTrigger value="city">City-wise</TabsTrigger>
          <TabsTrigger value="outlet">Outlet-wise</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="gst">GST</TabsTrigger>
        </TabsList>

        <TabsContent value="area">
          <Section title="Area-wise Sales">
            <div className="h-64 w-full p-3">
              {byArea.length === 0 ? (
                empty("No sales in this period.")
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byArea.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtAxis} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => inr(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" name="Sales" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="divide-y divide-border/60 border-t border-border/60">{listRows(byArea, totals.sales)}</div>
          </Section>
        </TabsContent>

        <TabsContent value="city">
          <Section title="City-wise Sales">
            <div className="divide-y divide-border/60">{listRows(byCity, totals.sales)}</div>
          </Section>
        </TabsContent>

        <TabsContent value="outlet">
          <Section title="Outlet Type Split">
            <div className="h-60 w-full p-3">
              {byOutletType.length === 0 ? (
                empty("No sales in this period.")
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byOutletType} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {byOutletType.map((entry, i) => (
                        <Cell key={entry.name} fill={CHART[i % CHART.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => inr(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Section>
          <Section title="Outlet-wise Sales">
            <div className="divide-y divide-border/60">
              {listRows(
                byOutlet.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())),
                totals.sales,
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="outstanding">
          <Section title={`Outstanding Payments — ${inr(totals.outstanding)}`}>
            <div className="divide-y divide-border/60">
              {outstandingRows.length === 0
                ? empty("No outstanding balance.")
                : outstandingRows.map((r) => (
                    <Link
                      key={`${r.type}-${r.id}`}
                      to="/party-ledger/$type/$id"
                      params={{ type: r.type, id: r.id }}
                      className="flex items-center justify-between gap-3 p-3 text-sm transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.type === "retailer" ? "Retailer" : "Distributor"} • {r.area}
                          {r.limit > 0 ? ` • Limit ${inr(r.limit)}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-destructive">{inr(r.outstanding)}</span>
                    </Link>
                  ))}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="gst">
          <Section title="GST Summary (Month-wise)">
            <div className="h-64 w-full p-3">
              {gstMonthly.length === 0 ? (
                empty("No invoices in this period.")
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={gstMonthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={54} />
                    <Tooltip formatter={(v: number) => inr(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="taxable" name="Taxable" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="net" name="Net billed" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="divide-y divide-border/60 border-t border-border/60">
              {gstMonthly.length === 0
                ? empty("No invoices in this period.")
                : gstMonthly.map((g) => (
                    <div key={g.key} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{g.month}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Taxable {inr(g.taxable)} • CGST {inr(g.cgst)} • SGST {inr(g.sgst)} • IGST {inr(g.igst)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">{inr(g.net)}</span>
                    </div>
                  ))}
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
