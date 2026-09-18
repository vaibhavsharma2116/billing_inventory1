import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { useReportFilters } from "@/components/sfa/ReportFilterBar";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildBusinessReports, fetchBusinessData } from "@/lib/business-report";
import { downloadReportPdf } from "@/lib/report-pdf";
import { inr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/business-report/$card")({
  validateSearch: (s: Record<string, unknown>): { from: string; to: string; q: string; panel?: "depot" | "distributor" | undefined } => {
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const panel = s["panel"] === "depot" || s["panel"] === "distributor" ? s["panel"] : undefined;
    return { from: str(s["from"]), to: str(s["to"]), q: str(s["q"]), panel };
  },
  head: () => ({
    meta: [
      { title: "Business Detail Report — POPPiK SFA" },
      {
        name: "description",
        content: "Detailed sales, purchase, GST and outstanding reports for the selected period with party-wise and date-wise filters.",
      },
      { property: "og:title", content: "Business Detail Report — POPPiK SFA" },
      { property: "og:description", content: "Drill-down business report with PDF export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BusinessDetailPage,
});

function BusinessDetailPage() {
  const { card } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const today = new Date();
  const from = search.from || new Date(today.getFullYear(), today.getMonth() - 11, 1).toISOString().slice(0, 10);
  const to = search.to || today.toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ["business-detail", from, to],
    queryFn: () => fetchBusinessData(from, to),
  });

  const report = data ? (buildBusinessReports(data)[card] ?? null) : null;

  const { filtered: filteredRows, bar, active: hasFilter } = useReportFilters(report?.rows ?? [], card);

  const filteredTotal = filteredRows.reduce((sum, r) => {
    const raw = r.value.replace(/[^0-9.-]/g, "");
    const n = Number(raw);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  const updateSearch = (patch: Partial<{ from: string; to: string; q: string }>) => {
    navigate({ search: (prev) => ({ ...prev, ...patch }) });
  };

  const exportPdf = () => {
    if (!report) return;
    const subtitle = hasFilter
      ? `${report.description} • ${from} to ${to} • Filtered • Total ${inr(filteredTotal)}`
      : `${report.description} • ${from} to ${to}`;
    downloadReportPdf({
      fileName: `poppik-${card}-report.pdf`,
      title: report.title,
      subtitle,
      meta: [`Records: ${filteredRows.length}`, `Total: ${inr(filteredTotal)}`],
      tables: [
        {
          title: report.title,
          head: [report.columns[0], report.columns[1], report.columns[2]],
          rows: filteredRows.map((r) => [r.label, r.sub, r.value]),
          align: ["left", "left", "right"],
        },
      ],
    }).catch((e: Error) => toast.error(e.message));
  };

  return (
    <Shell title={report?.title ?? "Detail Report"} subtitle={report?.description ?? "Business report drill-down"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/business-reports" search={{ panel: search.panel }}>
            <ArrowLeft className="mr-1 size-3.5" /> Back to reports
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/party-ledger">Party ledger</Link>
        </Button>
        <Button size="sm" onClick={exportPdf} disabled={!report || filteredRows.length === 0}>
          <Download className="mr-1 size-3.5" /> Download PDF
        </Button>
      </div>

      <Section title="Filters">
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="from" className="text-xs uppercase tracking-wider text-muted-foreground">
              From date
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => updateSearch({ from: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="grid flex-1 gap-2">
            <Label htmlFor="to" className="text-xs uppercase tracking-wider text-muted-foreground">
              To date
            </Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => updateSearch({ to: e.target.value })}
              className="h-9"
            />
          </div>
        </div>
        <div className="px-4 pb-4">{bar}</div>
      </Section>

      <Section
        title={
          report
            ? `${report.title} — ${filteredRows.length} of ${report.rows.length} records${hasFilter ? ` • Total ${inr(filteredTotal)}` : ""}`
            : "Report"
        }
      >
        {!report ? (
          <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "Unknown report."}</p>
        ) : report.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No records in this period."}</p>
        ) : filteredRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No records match your filters.</p>
        ) : (
          <div className="divide-y divide-border/60">
            <div className="hidden gap-3 p-3 text-[11px] uppercase tracking-wider text-muted-foreground md:flex">
              <span className="flex-1">{report.columns[0]}</span>
              <span className="flex-1">{report.columns[1]}</span>
              <span className="w-32 text-right">{report.columns[2]}</span>
            </div>
            {filteredRows.map((r) => {
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.label}</p>
                    <p className="text-[11px] text-muted-foreground md:hidden">{r.sub}</p>
                  </div>
                  <p className="hidden flex-1 text-[12px] text-muted-foreground md:block">{r.sub}</p>
                  <span className="w-32 shrink-0 text-right font-semibold tabular-nums">{r.value}</span>
                </>
              );
              return r.link ? (
                <Link
                  key={r.key}
                  to="/party-ledger/$type/$id"
                  params={{ type: r.link.type, id: r.link.id }}
                  className="flex items-center justify-between gap-3 p-3 text-sm transition-colors hover:bg-muted/50"
                >
                  {body}
                </Link>
              ) : (
                <div key={r.key} className="flex items-center justify-between gap-3 p-3 text-sm">
                  {body}
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-3 p-3 text-sm font-semibold">
              <span className="flex-1">Filtered total</span>
              <span className="hidden flex-1 md:block" />
              <span className="w-32 shrink-0 text-right tabular-nums">{inr(filteredTotal)}</span>
            </div>
          </div>
        )}
      </Section>
    </Shell>
  );
}
