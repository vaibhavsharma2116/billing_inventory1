import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useAuth";
import { useReportFilters } from "@/components/sfa/ReportFilterBar";
import { buildDepotReports, fetchDepotPanelReport } from "@/lib/depot-report";
import { downloadReportPdf } from "@/lib/report-pdf";

export const Route = createFileRoute("/_authenticated/depot-report/$card")({
  head: () => ({
    meta: [
      { title: "Master Depot Detail Report — POPPiK SFA" },
      {
        name: "description",
        content: "Full depot drill-down: CSA orders, pending approvals, depot stock value, invoices and low stock with PDF download.",
      },
      { property: "og:title", content: "Master Depot Detail Report — POPPiK SFA" },
      { property: "og:description", content: "Depot panel drill-down report with PDF export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DepotReportPage,
});

function DepotReportPage() {
  const { card } = Route.useParams();
  const { data: me } = useMe();
  const depotId = (me?.profile as { depot_id?: string | null } | null | undefined)?.depot_id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["depot-panel-report", depotId],
    queryFn: () => fetchDepotPanelReport(depotId),
  });

  const report = data ? (buildDepotReports(data)[card] ?? null) : null;
  const { filtered: rows, bar } = useReportFilters(report?.rows ?? [], card);

  const exportPdf = () => {
    if (!report) return;
    downloadReportPdf({
      fileName: `poppik-depot-${card}-report.pdf`,
      title: report.title,
      subtitle: report.description,
      meta: [`Records: ${rows.length}`],
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
    <Shell title={report?.title ?? "Detail Report"} subtitle={report?.description ?? "Master depot drill-down"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/depot">
            <ArrowLeft className="mr-1 size-3.5" /> Back to depot
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/business-reports">Business analytics</Link>
        </Button>
        <Button size="sm" onClick={exportPdf} disabled={!report}>
          <Download className="mr-1 size-3.5" /> Download PDF
        </Button>
      </div>

      {bar}

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
