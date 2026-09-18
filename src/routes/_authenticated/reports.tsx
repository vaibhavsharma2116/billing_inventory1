import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compactInr, inr } from "@/lib/sfa";
import { downloadReportPdf, rs } from "@/lib/report-pdf";

function TabActions({ section, onPdf }: { section: string; onPdf: () => void }) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="ghost" asChild>
        <Link to="/report-detail/$section" params={{ section }}>Full page</Link>
      </Button>
      <Button size="sm" variant="outline" onClick={onPdf}>
        PDF
      </Button>
    </div>
  );
}

function FilterBar({
  value,
  onChange,
  placeholder,
  count,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 max-w-xs" />
      {value ? (
        <Button size="sm" variant="ghost" onClick={() => onChange("")}>
          Clear
        </Button>
      ) : null}
      <span className="ml-auto text-[11px] text-muted-foreground">{count} rows</span>
    </div>
  );
}


export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Sales Reports — POPPiK SFA" },
      {
        name: "description",
        content:
          "Distributor-wise, area-wise and product-wise sales reports with primary vs secondary split and target vs achievement tracking.",
      },
      { property: "og:title", content: "Sales Reports — POPPiK SFA" },
      { property: "og:description", content: "Full sales analytics: distributor, area, product, salesman and target achievement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

type Range = "30" | "90" | "365" | "all";

const rangeStart = (r: Range) => {
  if (r === "all") return "1970-01-01T00:00:00Z";
  const d = new Date();
  d.setDate(d.getDate() - Number(r));
  return d.toISOString();
};

function Row({
  label,
  sub,
  value,
  extra,
  details,
}: {
  label: string;
  sub?: string;
  value: string;
  extra?: string;
  details?: { k: string; v: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div
        role={details ? "button" : undefined}
        onClick={details ? () => setOpen((o) => !o) : undefined}
        className={`flex items-center justify-between gap-3 p-3 text-sm ${details ? "cursor-pointer hover:bg-accent/40" : ""}`}
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{label}</p>
          {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular-nums font-semibold">{value}</p>
          {extra ? <p className="text-[11px] text-muted-foreground">{extra}</p> : null}
        </div>
      </div>
      {open && details ? (
        <div className="grid grid-cols-2 gap-2 border-t border-border/60 bg-muted/30 p-3 sm:grid-cols-3">
          {details.map((d) => (
            <div key={d.k}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.k}</p>
              <p className="text-sm font-medium tabular-nums">{d.v}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}


function ReportsPage() {
  const [range, setRange] = useState<Range>("90");
  const [card, setCard] = useState<null | "primary" | "secondary" | "total" | "collection">(null);
  const [q, setQ] = useState<Record<string, string>>({});
  const qv = (k: string) => q[k] ?? "";
  const setQv = (k: string) => (v: string) => setQ((p) => ({ ...p, [k]: v }));
  const match = (k: string, ...fields: (string | number | null | undefined)[]) => {
    const needle = qv(k).trim().toLowerCase();
    if (!needle) return true;
    return fields.some((f) => String(f ?? "").toLowerCase().includes(needle));
  };

  const from = rangeStart(range);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", range],
    queryFn: async () => {
      const [orders, items, targets, profiles, collections, distributors, retailers] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, kind, status, total_amount, created_at, salesman_id, distributor_id, retailers(name, city, distributor_id), distributors(name, city, state)",
          )
          .gte("created_at", from),
        supabase
          .from("order_items")
          .select("qty, free_qty, amount, products(name, sku, category), orders!inner(created_at, kind)")
          .gte("orders.created_at", from),
        supabase.from("targets").select("user_id, period_month, target_amount, visits_target"),
        supabase.from("profiles").select("id, full_name, designation"),
        supabase.from("collections").select("amount, created_at").gte("created_at", from),
        supabase.from("distributors").select("id, name, city, state, outstanding"),
        supabase.from("retailers").select("id, name, city, state, retailer_type, outstanding"),
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

  const totals = useMemo(() => {
    const primary = orders.filter((o) => o.kind === "primary").reduce((s, o) => s + Number(o.total_amount), 0);
    const secondary = orders.filter((o) => o.kind === "secondary").reduce((s, o) => s + Number(o.total_amount), 0);
    const collection = (data?.collections ?? []).reduce((s, c) => s + Number(c.amount), 0);
    return { primary, secondary, total: primary + secondary, collection };
  }, [orders, data?.collections]);

  const byDistributor = useMemo(() => {
    const map = new Map<string, { name: string; area: string; primary: number; secondary: number; orders: number }>();
    for (const o of orders) {
      const d = o.distributors as { name: string; city: string | null; state: string | null } | null;
      const key = d?.name ?? "Unmapped";
      const cur =
        map.get(key) ?? { name: key, area: [d?.city, d?.state].filter(Boolean).join(", "), primary: 0, secondary: 0, orders: 0 };
      if (o.kind === "primary") cur.primary += Number(o.total_amount);
      else cur.secondary += Number(o.total_amount);
      cur.orders += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.primary + b.secondary - (a.primary + a.secondary));
  }, [orders]);

  const byArea = useMemo(() => {
    const map = new Map<string, { area: string; value: number; orders: number }>();
    for (const o of orders) {
      const r = o.retailers as { city: string | null } | null;
      const d = o.distributors as { city: string | null; state: string | null } | null;
      const key = r?.city ?? d?.city ?? d?.state ?? "Unknown";
      const cur = map.get(key) ?? { area: key, value: 0, orders: 0 };
      cur.value += Number(o.total_amount);
      cur.orders += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [orders]);

  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; category: string; qty: number; free: number; value: number }>();
    for (const it of data?.items ?? []) {
      const p = it.products as { name: string; sku: string; category: string | null } | null;
      const key = p?.sku ?? "—";
      const cur =
        map.get(key) ?? { name: p?.name ?? "Unknown", sku: key, category: p?.category ?? "—", qty: 0, free: 0, value: 0 };
      cur.qty += Number(it.qty ?? 0);
      cur.free += Number(it.free_qty ?? 0);
      cur.value += Number(it.amount ?? 0);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [data?.items]);

  const bySalesman = useMemo(() => {
    const names = new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name || "Unnamed"]));
    const targetByUser = new Map<string, number>();
    for (const t of data?.targets ?? []) {
      targetByUser.set(t.user_id, (targetByUser.get(t.user_id) ?? 0) + Number(t.target_amount));
    }
    const map = new Map<string, { name: string; sales: number; orders: number; target: number }>();
    for (const o of orders) {
      if (!o.salesman_id) continue;
      const cur =
        map.get(o.salesman_id) ??
        { name: names.get(o.salesman_id) ?? "Unknown", sales: 0, orders: 0, target: targetByUser.get(o.salesman_id) ?? 0 };
      cur.sales += Number(o.total_amount);
      cur.orders += 1;
      map.set(o.salesman_id, cur);
    }
    for (const [uid, target] of targetByUser) {
      if (!map.has(uid)) map.set(uid, { name: names.get(uid) ?? "Unknown", sales: 0, orders: 0, target });
    }
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }, [orders, data?.profiles, data?.targets]);

  const totalTarget = bySalesman.reduce((s, r) => s + r.target, 0);
  const achievementPct = totalTarget > 0 ? Math.round((totals.total / totalTarget) * 100) : 0;

  const byCity = useMemo(() => {
    const map = new Map<string, { city: string; distributors: number; outlets: number; retail: number; rba: number; ba: number; outstanding: number }>();
    const ensure = (c: string) => {
      const cur = map.get(c) ?? { city: c, distributors: 0, outlets: 0, retail: 0, rba: 0, ba: 0, outstanding: 0 };
      map.set(c, cur);
      return cur;
    };
    for (const d of data?.distributors ?? []) ensure(d.city || d.state || "Unknown").distributors += 1;
    for (const r of data?.retailers ?? []) {
      const c = ensure(r.city || r.state || "Unknown");
      c.outlets += 1;
      if (r.retailer_type === "rba") c.rba += 1;
      else if (r.retailer_type === "ba") c.ba += 1;
      else c.retail += 1;
      c.outstanding += Number(r.outstanding ?? 0);
    }
    return [...map.values()].sort((a, b) => b.outlets - a.outlets || b.distributors - a.distributors);
  }, [data?.distributors, data?.retailers]);

  const periodLabel = range === "all" ? "All time" : `Last ${range} days`;

  const pdf = (section: string) => () => {
    const base = { subtitle: periodLabel };
    if (section === "distributor")
      return downloadReportPdf({
        fileName: "distributor-sales-report.pdf", title: "Distributor-wise Sales", ...base,
        tables: [{ title: "Distributor-wise Sales", head: ["Distributor", "Area", "Orders", "Primary", "Secondary", "Total"],
          rows: fDistributor.map((d) => [d.name, d.area || "—", String(d.orders), rs(d.primary), rs(d.secondary), rs(d.primary + d.secondary)]) }],
      });
    if (section === "area")
      return downloadReportPdf({
        fileName: "area-sales-report.pdf", title: "Area-wise Sales", ...base,
        tables: [{ title: "Area-wise Sales", head: ["Area", "Orders", "Sales Value", "Share"],
          rows: fArea.map((a) => [a.area, String(a.orders), rs(a.value), `${totals.total > 0 ? Math.round((a.value / totals.total) * 100) : 0}%`]) }],
      });
    if (section === "city")
      return downloadReportPdf({
        fileName: "city-network-report.pdf", title: "City Network Report", ...base,
        tables: [{ title: "City-wise network", head: ["City", "Distributors", "Total Outlets", "Retail", "RBA", "BA", "Outstanding"],
          rows: fCity.map((c) => [c.city, String(c.distributors), String(c.outlets), String(c.retail), String(c.rba), String(c.ba), rs(c.outstanding)]) }],
      });
    if (section === "product")
      return downloadReportPdf({
        fileName: "product-sales-report.pdf", title: "Product-wise Sales", ...base,
        tables: [{ title: "Product-wise Sales", head: ["Product", "SKU", "Category", "Qty", "Free", "Value"],
          rows: fProduct.map((p) => [p.name, p.sku, p.category, String(p.qty), String(p.free), rs(p.value)]) }],
      });
    return downloadReportPdf({
      fileName: "team-target-report.pdf", title: "Team Target vs Achievement", ...base,
      tables: [{ title: "Salesman Target vs Achievement", head: ["Salesman", "Orders", "Achieved", "Target", "Achievement"],
        rows: fTeam.map((s) => [s.name, String(s.orders), rs(s.sales), rs(s.target), s.target > 0 ? `${Math.round((s.sales / s.target) * 100)}%` : "—"]) }],
    });
  };

  const cardDetail = useMemo(() => {
    const empty = { title: "", stats: [] as { k: string; v: string }[], rows: [] as { label: string; sub?: string; value: string }[] };
    if (!card) return empty;
    if (card === "collection") {
      const list = (data?.collections ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return {
        title: "Collection",
        stats: [
          { k: "Total", v: inr(totals.collection) },
          { k: "Entries", v: String(list.length) },
          { k: "Avg / entry", v: inr(list.length ? totals.collection / list.length : 0) },
          { k: "Latest", v: list[0] ? new Date(list[0].created_at).toLocaleDateString("en-IN") : "—" },
        ],
        rows: list.slice(0, 10).map((c, i) => ({
          label: `Payment ${i + 1}`,
          sub: new Date(c.created_at).toLocaleDateString("en-IN"),
          value: inr(Number(c.amount)),
        })),
      };
    }
    const kind = card === "total" ? null : card;
    const list = kind ? orders.filter((o) => o.kind === kind) : orders;
    const value = list.reduce((s, o) => s + Number(o.total_amount), 0);
    const title = card === "primary" ? "Primary Sales" : card === "secondary" ? "Secondary Sales" : "Total Sales";
    const top = card === "secondary" ? byArea.slice(0, 8) : byDistributor.slice(0, 8);
    return {
      title,
      stats: [
        { k: "Value", v: inr(value) },
        { k: "Orders", v: String(list.length) },
        { k: "Avg order", v: inr(list.length ? value / list.length : 0) },
        { k: "Pending", v: String(list.filter((o) => o.status === "pending").length) },
      ],
      rows:
        card === "secondary"
          ? (top as typeof byArea).map((a) => ({ label: a.area, sub: `${a.orders} orders`, value: inr(a.value) }))
          : (top as typeof byDistributor).map((d) => ({
              label: d.name,
              sub: `${d.area || "—"} • ${d.orders} orders`,
              value: inr(card === "primary" ? d.primary : d.primary + d.secondary),
            })),
    };
  }, [card, orders, byArea, byDistributor, data?.collections, totals.collection]);

  const fDistributor = byDistributor.filter((d) => match("distributor", d.name, d.area));
  const fArea = byArea.filter((a) => match("area", a.area));
  const fCity = byCity.filter((c) => match("city", c.city));
  const fProduct = byProduct.filter((p) => match("product", p.name, p.sku, p.category));
  const fTeam = bySalesman.filter((s) => match("team", s.name));


  return (
    <Shell
      title="Reports & Analytics"
      subtitle="Distributor • Area • Product • Target vs Achievement"
      nav={[
        { to: "/admin", label: "Control Tower" },
        { to: "/reports", label: "Reports" },
        { to: "/live-map", label: "Live Map" },
      ]}
    >
      <div className="flex flex-wrap gap-2">
        {(["30", "90", "365", "all"] as Range[]).map((r) => (
          <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
            {r === "all" ? "All time" : `Last ${r} days`}
          </Button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Primary Sales"
          value={compactInr(totals.primary)}
          tone="primary"
          hint="CSA → Distributor"
          onClick={() => setCard(card === "primary" ? null : "primary")}
        />
        <StatCard
          label="Secondary Sales"
          value={compactInr(totals.secondary)}
          tone="success"
          hint="Distributor → Retailer"
          onClick={() => setCard(card === "secondary" ? null : "secondary")}
        />
        <StatCard label="Total Sales" value={compactInr(totals.total)} onClick={() => setCard(card === "total" ? null : "total")} />
        <StatCard
          label="Collection"
          value={compactInr(totals.collection)}
          tone="warning"
          onClick={() => setCard(card === "collection" ? null : "collection")}
        />
      </div>

      {card ? (
        <Section title={`${cardDetail.title} — brief detail`}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {cardDetail.stats.map((s) => (
              <div key={s.k}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.k}</p>
                <p className="text-sm font-semibold tabular-nums">{s.v}</p>
              </div>
            ))}
          </div>
          <div className="divide-y divide-border/60 border-t border-border/60">
            {cardDetail.rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No records in this period.</p>
            ) : (
              cardDetail.rows.map((r) => <Row key={r.label} label={r.label} sub={r.sub ?? ""} value={r.value} />)
            )}
          </div>
        </Section>
      ) : null}


      <Section title="Target vs Achievement">
        <div className="p-4">
          <div className="flex items-end justify-between text-sm">
            <div>
              <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Achieved</p>
              <p className="text-2xl font-semibold tabular-nums">{inr(totals.total)}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Target</p>
              <p className="text-2xl font-semibold tabular-nums">{inr(totalTarget)}</p>
            </div>
          </div>
          <Progress value={Math.min(100, achievementPct)} className="mt-3" />
          <p className="mt-2 text-sm">
            <span className="font-semibold text-primary">{achievementPct}%</span> of target achieved
            {totalTarget > totals.total ? ` • ${inr(totalTarget - totals.total)} gap` : " • target met"}
          </p>
        </div>
      </Section>

      <Tabs defaultValue="distributor" className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="distributor">Distributor-wise</TabsTrigger>
          <TabsTrigger value="area">Area-wise</TabsTrigger>
          <TabsTrigger value="city">City Network</TabsTrigger>
          <TabsTrigger value="product">Product-wise</TabsTrigger>
          <TabsTrigger value="team">Team target</TabsTrigger>
        </TabsList>

        <TabsContent value="distributor">
          <Section title="Distributor-wise Sales" action={<TabActions section="distributor" onPdf={pdf("distributor")} />}>
            <FilterBar value={qv("distributor")} onChange={setQv("distributor")} placeholder="Search distributor / area…" count={fDistributor.length} />
            <div className="divide-y divide-border/60">
              {fDistributor.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No orders in this period."}</p>
              ) : (
                fDistributor.map((d) => (
                  <Row
                    key={d.name}
                    label={d.name}
                    sub={`${d.area || "—"} • ${d.orders} orders`}
                    value={inr(d.primary + d.secondary)}
                    extra={`Primary ${compactInr(d.primary)} • Secondary ${compactInr(d.secondary)}`}
                    details={[
                      { k: "Primary", v: inr(d.primary) },
                      { k: "Secondary", v: inr(d.secondary) },
                      { k: "Orders", v: String(d.orders) },
                      { k: "Avg order", v: inr(d.orders ? (d.primary + d.secondary) / d.orders : 0) },
                      { k: "Area", v: d.area || "—" },
                      { k: "Share", v: `${totals.total > 0 ? Math.round(((d.primary + d.secondary) / totals.total) * 100) : 0}%` },
                    ]}
                  />
                ))

              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="area">
          <Section title="Area-wise Sales" action={<TabActions section="area" onPdf={pdf("area")} />}>
            <FilterBar value={qv("area")} onChange={setQv("area")} placeholder="Search area…" count={fArea.length} />
            <div className="divide-y divide-border/60">
              {fArea.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No orders in this period."}</p>
              ) : (
                fArea.map((a) => {
                  const share = totals.total > 0 ? Math.round((a.value / totals.total) * 100) : 0;
                  return (
                    <Row
                      key={a.area}
                      label={a.area}
                      sub={`${a.orders} orders`}
                      value={inr(a.value)}
                      extra={`${share}% share`}
                      details={[
                        { k: "Sales value", v: inr(a.value) },
                        { k: "Orders", v: String(a.orders) },
                        { k: "Avg order", v: inr(a.orders ? a.value / a.orders : 0) },
                        { k: "Share of total", v: `${share}%` },
                      ]}
                    />
                  );
                })

              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="city">
          <Section title="City-wise Network" action={<TabActions section="city" onPdf={pdf("city")} />}>
            <FilterBar value={qv("city")} onChange={setQv("city")} placeholder="Search city…" count={fCity.length} />
            <div className="divide-y divide-border/60">
              {fCity.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No network data yet."}</p>
              ) : (
                fCity.map((c) => (
                  <Row
                    key={c.city}
                    label={c.city}
                    sub={`${c.distributors} distributors • ${c.outlets} outlets`}
                    value={`${c.outlets} outlets`}
                    extra={`Retail ${c.retail} • RBA ${c.rba} • BA ${c.ba}`}
                    details={[
                      { k: "Distributors", v: String(c.distributors) },
                      { k: "Total outlets", v: String(c.outlets) },
                      { k: "Retail outlets", v: String(c.retail) },
                      { k: "RBA counters", v: String(c.rba) },
                      { k: "BA counters", v: String(c.ba) },
                      { k: "Retailer outstanding", v: inr(c.outstanding) },
                    ]}
                  />
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="product">
          <Section title="Product-wise Sales" action={<TabActions section="product" onPdf={pdf("product")} />}>
            <FilterBar value={qv("product")} onChange={setQv("product")} placeholder="Search product / SKU / category…" count={fProduct.length} />
            <div className="divide-y divide-border/60">
              {fProduct.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No product sales in this period."}</p>
              ) : (
                fProduct.map((p) => (
                  <Row
                    key={p.sku}
                    label={p.name}
                    sub={`${p.sku} • ${p.category}`}
                    value={inr(p.value)}
                    extra={`${p.qty} pcs${p.free ? ` + ${p.free} free` : ""}`}
                    details={[
                      { k: "SKU", v: p.sku },
                      { k: "Category", v: p.category },
                      { k: "Qty sold", v: `${p.qty} pcs` },
                      { k: "Free qty", v: `${p.free} pcs` },
                      { k: "Value", v: inr(p.value) },
                      { k: "Avg rate", v: inr(p.qty ? p.value / p.qty : 0) },
                    ]}
                  />
                ))

              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="team">
          <Section title="Salesman Target vs Achievement" action={<TabActions section="team" onPdf={pdf("team")} />}>
            <FilterBar value={qv("team")} onChange={setQv("team")} placeholder="Search salesman…" count={fTeam.length} />
            <div className="divide-y divide-border/60">
              {fTeam.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No salesman activity yet."}</p>
              ) : (
                fTeam.map((s) => {
                  const pct = s.target > 0 ? Math.round((s.sales / s.target) * 100) : 0;
                  return (
                    <Row
                      key={s.name}
                      label={s.name}
                      sub={`${inr(s.sales)} of ${inr(s.target)} • ${s.orders} orders`}
                      value={s.target > 0 ? `${pct}%` : "No target"}
                      extra={s.target > s.sales ? `${compactInr(s.target - s.sales)} gap` : "Target met"}
                      details={[
                        { k: "Achieved", v: inr(s.sales) },
                        { k: "Target", v: inr(s.target) },
                        { k: "Gap", v: inr(Math.max(0, s.target - s.sales)) },
                        { k: "Orders", v: String(s.orders) },
                        { k: "Avg order", v: inr(s.orders ? s.sales / s.orders : 0) },
                        { k: "Achievement", v: s.target > 0 ? `${pct}%` : "—" },
                      ]}
                    />
                  );
                })

              )}
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
