import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { inr } from "@/lib/sfa";
import { downloadReportPdf } from "@/lib/report-pdf";
import { useReportFilters } from "@/components/sfa/ReportFilterBar";

export const Route = createFileRoute("/_authenticated/salesman-report/$card")({
  head: () => ({
    meta: [
      { title: "My Day Detail Report — POPPiK SFA" },
      {
        name: "description",
        content: "Salesman day drill-down: planned beat, completed visits, booked orders and collections with PDF download.",
      },
      { property: "og:title", content: "My Day Detail Report — POPPiK SFA" },
      { property: "og:description", content: "Field sales day report with visit, order and collection detail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesmanReportPage,
});

const today = () => new Date().toISOString().slice(0, 10);

type Row = { key: string; label: string; sub: string; value: string };

function SalesmanReportPage() {
  const { card } = Route.useParams();
  const { data: me } = useMe();
  const userId = me?.profile?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["salesman-report", userId],
    enabled: !!userId,
    queryFn: async () => {
      const start = today() + "T00:00:00Z";
      const [visits, distVisits, orders, collections, target, retailers] = await Promise.all([
        supabase
          .from("visits")
          .select("id, productive, notes, checked_in_at, retailers(name, city)")
          .eq("salesman_id", userId!)
          .gte("checked_in_at", start)
          .order("checked_in_at", { ascending: false }),
        supabase
          .from("distributor_visits")
          .select("id, distributor_name, phone, address, notes, visited_at")
          .eq("salesman_id", userId!)
          .gte("visited_at", start)
          .order("visited_at", { ascending: false }),
        supabase
          .from("orders")
          .select("id, order_no, status, total_amount, created_at, retailers(name, city), order_items(id, qty)")
          .eq("salesman_id", userId!)
          .gte("created_at", start)
          .order("created_at", { ascending: false }),
        supabase
          .from("collections")
          .select("id, amount, mode, reference, status, created_at, retailers(name, city)")
          .eq("salesman_id", userId!)
          .gte("created_at", start)
          .order("created_at", { ascending: false }),
        supabase.from("targets").select("*").eq("user_id", userId!).order("period_month", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("retailers").select("id, name, city, outstanding, credit_limit, retailer_type").order("name"),
      ]);
      return {
        visits: visits.data ?? [],
        distVisits: distVisits.data ?? [],
        orders: orders.data ?? [],
        collections: collections.data ?? [],
        target: target.data,
        retailers: retailers.data ?? [],
      };
    },
  });

  const name = (v: unknown) => (v as { name?: string } | null)?.name ?? "-";
  const city = (v: unknown) => (v as { city?: string } | null)?.city ?? "-";

  const reports: Record<string, { title: string; description: string; columns: [string, string, string]; rows: Row[]; summary: { label: string; value: string }[] }> = {};

  if (data) {
    const visited = new Set(data.visits.map((v) => name(v.retailers)));
    const sales = data.orders.reduce((s, o) => s + Number(o.total_amount), 0);
    const approved = data.collections.filter((c) => c.status === "approved");
    const collected = approved.reduce((s, c) => s + Number(c.amount), 0);
    const pendingAmt = data.collections.filter((c) => c.status !== "approved").reduce((s, c) => s + Number(c.amount), 0);
    const visitsTarget = data.target?.visits_target || 18;

    reports["plan"] = {
      title: "Beat Plan — Outlets To Cover",
      description: `Planned coverage of ${visitsTarget} outlets today. Pending outlets are the ones not yet visited.`,
      columns: ["Outlet", "City • Type", "Outstanding"],
      summary: [
        { label: "Planned visits", value: String(visitsTarget) },
        { label: "Covered", value: String(data.visits.length + data.distVisits.length) },
        { label: "Balance", value: String(Math.max(0, visitsTarget - data.visits.length - data.distVisits.length)) },
      ],
      rows: data.retailers.map((r) => ({
        key: r.id,
        label: `${r.name}${visited.has(r.name) ? " ✓" : ""}`,
        sub: `${r.city ?? "-"} • ${r.retailer_type ?? "-"}${visited.has(r.name) ? " • visited" : " • pending"}`,
        value: inr(r.outstanding),
      })),
    };

    reports["visits"] = {
      title: "Visits Completed Today",
      description: "Every outlet and CSA/distributor visit logged today with outcome and remarks.",
      columns: ["Outlet / CSA", "Time • Remark", "Outcome"],
      summary: [
        { label: "Total visits", value: String(data.visits.length + data.distVisits.length) },
        { label: "Productive", value: String(data.visits.filter((v) => v.productive).length) },
        { label: "No order", value: String(data.visits.filter((v) => !v.productive).length) },
      ],
      rows: [
        ...data.visits.map((v) => ({
          key: v.id,
          at: v.checked_in_at,
          label: `${name(v.retailers)} (${city(v.retailers)})`,
          sub: `${new Date(v.checked_in_at).toLocaleTimeString("en-IN")}${v.notes ? ` • ${v.notes}` : ""}`,
          value: v.productive ? "Productive" : "No order",
        })),
        ...data.distVisits.map((v) => ({
          key: `dv-${v.id}`,
          at: v.visited_at,
          label: `${v.distributor_name} (CSA)`,
          sub: `${new Date(v.visited_at).toLocaleTimeString("en-IN")}${v.phone ? ` • ${v.phone}` : ""}${v.notes ? ` • ${v.notes}` : ""}`,
          value: "CSA visit",
        })),
      ]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .map(({ key, label, sub, value }) => ({ key, label, sub, value })),
    };

    reports["orders"] = {
      title: "Orders Booked Today",
      description: "Order-wise booking with outlet, SKU count and status.",
      columns: ["Order / Outlet", "Time • SKU • Status", "Amount"],
      summary: [
        { label: "Orders", value: String(data.orders.length) },
        { label: "Value", value: inr(sales) },
        {
          label: "Avg order",
          value: inr(data.orders.length ? sales / data.orders.length : 0),
        },
      ],
      rows: data.orders.map((o) => ({
        key: o.id,
        label: `${o.order_no} • ${name(o.retailers)}`,
        sub: `${new Date(o.created_at).toLocaleTimeString("en-IN")} • ${(o.order_items ?? []).length} SKU • ${o.status}`,
        value: inr(o.total_amount),
      })),
    };

    reports["collection"] = {
      title: "Collections Today",
      description: "Payments collected from outlets. Only distributor-approved entries count in your total.",
      columns: ["Outlet", "Mode • Reference • Status", "Amount"],
      summary: [
        { label: "Approved", value: inr(collected) },
        { label: "Pending approval", value: inr(pendingAmt) },
        { label: "Entries", value: String(data.collections.length) },
      ],
      rows: data.collections.map((c) => ({
        key: c.id,
        label: `${name(c.retailers)} (${city(c.retailers)})`,
        sub: `${c.mode}${c.reference ? ` • ${c.reference}` : ""} • ${c.status}`,
        value: inr(c.amount),
      })),
    };

    reports["sales"] = {
      title: "Target vs Achievement",
      description: "Today's booked value against your assigned target, outlet-wise.",
      columns: ["Outlet", "Orders", "Value"],
      summary: [
        { label: "Target", value: inr(Number(data.target?.target_amount ?? 75000)) },
        { label: "Achieved", value: inr(sales) },
        {
          label: "Achievement",
          value: `${Math.round((sales / Number(data.target?.target_amount ?? 75000)) * 100)}%`,
        },
      ],
      rows: Object.values(
        data.orders.reduce<Record<string, Row & { amt: number; count: number }>>((acc, o) => {
          const key = name(o.retailers);
          const cur = acc[key] ?? { key, label: key, sub: "", value: "", amt: 0, count: 0 };
          cur.amt += Number(o.total_amount);
          cur.count += 1;
          acc[key] = cur;
          return acc;
        }, {}),
      )
        .sort((a, b) => b.amt - a.amt)
        .map((r) => ({ key: r.key, label: r.label, sub: `${r.count} order(s)`, value: inr(r.amt) })),
    };
  }

  const report = reports[card] ?? null;
  const { filtered: rows, bar } = useReportFilters(report?.rows ?? [], card);

  const exportPdf = () => {
    if (!report) return;
    downloadReportPdf({
      fileName: `poppik-salesman-${card}-report.pdf`,
      title: report.title,
      subtitle: report.description,
      meta: [
        `Salesman: ${me?.profile?.full_name ?? "-"}`,
        `Records: ${rows.length}`,
        `Generated: ${new Date().toLocaleString("en-IN")}`,
      ],
      tables: [
        {
          title: report.title,
          head: [report.columns[0], report.columns[1], report.columns[2]],
          rows: rows.map((r) => [r.label, r.sub, r.value]),
          align: ["left", "left", "right"],
        },
      ],
    }).catch((e: Error) => toast.error(e.message));
  };

  return (
    <Shell mobile title={report?.title ?? "Detail Report"} subtitle={report?.description ?? "Field sales drill-down"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/salesman">
            <ArrowLeft className="mr-1 size-3.5" /> Back to today
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/my-report">My reports</Link>
        </Button>
        <Button size="sm" onClick={exportPdf} disabled={!report}>
          <Download className="mr-1 size-3.5" /> Download PDF
        </Button>
      </div>

      {report ? (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {report.summary.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      ) : null}

      <div className="mt-4">{bar}</div>

      <Section title={report ? `${report.title} — ${rows.length} records` : "Report"}>
        {!report ? (
          <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "Unknown report."}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No records."}</p>
        ) : (
          <div className="divide-y divide-border/60">
            <div className="hidden gap-3 p-3 text-[11px] uppercase tracking-wider text-muted-foreground md:flex">
              <span className="flex-1">{report.columns[0]}</span>
              <span className="flex-1">{report.columns[1]}</span>
              <span className="w-32 text-right">{report.columns[2]}</span>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground md:hidden">{r.sub}</p>
                </div>
                <p className="hidden flex-1 text-[12px] text-muted-foreground md:block">{r.sub}</p>
                <span className="w-32 shrink-0 text-right font-semibold tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Shell>
  );
}
