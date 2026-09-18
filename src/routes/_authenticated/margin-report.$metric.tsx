import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { inr } from "@/lib/sfa";
import { fetchMarginBudget, type PartyMargin } from "@/lib/margin-budget";
import { downloadReportPdf, rs } from "@/lib/report-pdf";

export const Route = createFileRoute("/_authenticated/margin-report/$metric")({
  head: () => ({
    meta: [
      { title: "Margin Report — POPPiK SFA" },
      { name: "description", content: "Party-wise margin budget detail report." },
      { property: "og:title", content: "Margin Report — POPPiK SFA" },
      { property: "og:description", content: "Party-wise margin budget detail report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarginReportPage,
});

type Metric = "allowed" | "given" | "balance" | "overspent";

const META: Record<Metric, { title: string; hint: string }> = {
  allowed: { title: "Allowed Margin Budget", hint: "Company-fixed margin available to each party (PTR−PTS for distributors, PTS−CSA rate for CSAs)" },
  given: { title: "Margin Given", hint: "Margin already used via lower-rate billing, free goods and approved claims" },
  balance: { title: "Balance Margin", hint: "Remaining margin budget = allowed − given" },
  overspent: { title: "Extra Margin Given", hint: "Parties whose margin given exceeds their allowed budget" },
};

function metricValue(p: PartyMargin, m: Metric) {
  return m === "allowed" ? p.allowed : m === "given" ? p.given : m === "balance" ? p.balance : p.balance < 0 ? -p.balance : 0;
}

const fmt = (v: number) => (v < 0 ? `-${inr(-v)}` : inr(v));

function MarginReportPage() {
  const { metric: metricParam } = Route.useParams();
  const metric: Metric = (["allowed", "given", "balance", "overspent"] as const).includes(metricParam as Metric)
    ? (metricParam as Metric)
    : "allowed";
  const meta = META[metric];

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [partyFilter, setPartyFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["margin-budget-report", from, to],
    queryFn: () => fetchMarginBudget({ from: from || undefined, to: to || undefined }),
  });

  const parties = useMemo(() => {
    let list = data?.parties ?? [];
    if (metric === "overspent") list = list.filter((p) => p.balance < 0);
    const q = partyFilter.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q));
    return [...list].sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  }, [data, metric, partyFilter]);

  const totalValue = parties.reduce((s, p) => s + metricValue(p, metric), 0);

  const head = ["Party", "Type", "Area", "Bills", "Sales", "Allowed", "Billing Loss", "Free Goods", "Claims", "Total Given", "Balance"];
  const tableRows = parties.map((p) => [
    p.name,
    p.type === "csa" ? "CSA" : "Distributor",
    p.area,
    p.orders,
    rs(p.sales),
    rs(p.allowed),
    rs(p.givenBilling),
    rs(p.givenFree),
    rs(p.givenClaims),
    rs(p.given),
    rs(p.balance),
  ]);

  const exportPdf = () =>
    downloadReportPdf({
      fileName: `margin-${metric}.pdf`,
      title: `${meta.title} Report`,
      subtitle: `${parties.length} parties | Total ${rs(totalValue)}`,
      meta: [meta.hint, ...(from || to ? [`Period: ${from || "start"} to ${to || "today"}`] : [])],
      tables: [{ title: meta.title, head, rows: tableRows }],
    });

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = parties.map((p) => ({
      Party: p.name,
      Type: p.type === "csa" ? "CSA" : "Distributor",
      Area: p.area,
      Bills: p.orders,
      "Sales (Rs)": Math.round(p.sales),
      "Allowed Budget (Rs)": Math.round(p.allowed),
      "Given via Billing (Rs)": Math.round(p.givenBilling),
      "Given via Free Goods (Rs)": Math.round(p.givenFree),
      "Approved Claims (Rs)": Math.round(p.givenClaims),
      "Total Margin Given (Rs)": Math.round(p.given),
      "Balance Margin (Rs)": Math.round(p.balance),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, ...Array(7).fill({ wch: 18 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Margin Report");
    XLSX.writeFile(wb, `margin-${metric}.xlsx`);
  };

  return (
    <Shell title={meta.title}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/home">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={parties.length === 0}>
            Download PDF
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={parties.length === 0}>
            Download Excel
          </Button>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{meta.hint}</p>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Parties</p>
          <p className="text-lg font-bold tabular-nums">{parties.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total {meta.title}</p>
          <p className={`text-lg font-bold tabular-nums ${totalValue < 0 ? "text-destructive" : ""}`}>{fmt(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 col-span-2 md:col-span-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Margin Given Breakup</p>
          <p className="text-xs text-muted-foreground">
            Billing {inr(data?.totals.givenBilling)} • Free {inr(data?.totals.givenFree)} • Claims {inr(data?.totals.givenClaims)}
          </p>
        </div>
      </div>

      <Section title="Party-wise Detail">
        <div className="flex flex-wrap items-end gap-3 border-b border-border/60 p-3">
          <div>
            <Label className="text-[11px]">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8" />
          </div>
          <div>
            <Label className="text-[11px]">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8" />
          </div>
          <div className="min-w-[180px] flex-1 sm:flex-none">
            <Label className="text-[11px]">Party name</Label>
            <Input placeholder="Search party / area…" value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} className="h-8" />
          </div>
          {from || to || partyFilter ? (
            <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); setPartyFilter(""); }}>
              Clear
            </Button>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="p-3">Party</th>
                <th className="p-3">Type / Area</th>
                <th className="p-3 text-right">Bills</th>
                <th className="p-3 text-right">Sales</th>
                <th className="p-3 text-right">Allowed</th>
                <th className="p-3 text-right">Given</th>
                <th className="p-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr><td colSpan={7} className="p-4 text-muted-foreground">Loading…</td></tr>
              ) : parties.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-muted-foreground">No data for this filter.</td></tr>
              ) : (
                parties.map((p) => {
                  const highlight = metric === "allowed" ? p.allowed : metric === "given" ? p.given : p.balance;
                  return (
                    <tr key={`${p.type}-${p.id}`} className="hover:bg-accent/30">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="mr-1">{p.type === "csa" ? "CSA" : "Distributor"}</Badge>
                        {p.area}
                      </td>
                      <td className="p-3 text-right tabular-nums">{p.orders}</td>
                      <td className="p-3 text-right tabular-nums">{inr(p.sales)}</td>
                      <td className={`p-3 text-right tabular-nums ${metric === "allowed" ? "font-semibold" : ""}`}>{inr(p.allowed)}</td>
                      <td className={`p-3 text-right tabular-nums ${metric === "given" ? "font-semibold" : ""}`}>{inr(p.given)}</td>
                      <td className={`p-3 text-right tabular-nums font-semibold ${p.balance < 0 ? "text-destructive" : "text-success"}`}>
                        {fmt(highlight === p.balance ? p.balance : highlight)}
                      </td>
                    </tr>
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
