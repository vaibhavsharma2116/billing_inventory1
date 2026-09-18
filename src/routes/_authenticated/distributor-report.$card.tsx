import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { useReportFilters } from "@/components/sfa/ReportFilterBar";
import { buildDistributorReports, fetchDistributorPanel } from "@/lib/distributor-report";
import { downloadReportPdf } from "@/lib/report-pdf";

export const Route = createFileRoute("/_authenticated/distributor-report/$card")({
  head: () => ({
    meta: [
      { title: "Distributor Detail Report — POPPiK SFA" },
      { name: "description", content: "Full detail report for orders, billing, outstanding, stock and invoices with PDF download." },
      { property: "og:title", content: "Distributor Detail Report — POPPiK SFA" },
      { property: "og:description", content: "Drill-down report from the distributor panel with PDF export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DistributorReportPage,
});

function DistributorReportPage() {
  const { card } = Route.useParams();

  const { data, isLoading } = useQuery({ queryKey: ["distributor-panel"], queryFn: fetchDistributorPanel });

  const reports = data ? buildDistributorReports(data) : null;
  const report = reports?.[card] ?? null;
  const { filtered: rows, bar } = useReportFilters(report?.rows ?? [], card);

  const exportPdf = () => {
    if (!report) return;
    downloadReportPdf({
      fileName: `poppik-${card}-report.pdf`,
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
    <Shell title={report?.title ?? "Detail Report"} subtitle={report?.description ?? "Distributor panel drill-down"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/distributor">
            <ArrowLeft className="mr-1 size-3.5" /> Back to panel
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/party-ledger">Party ledger</Link>
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
            {rows.map((r) => {
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
                <div key={r.key} className="flex items-center justify-between gap-3 p-3 text-sm md:gap-3">
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </Shell>
  );
}
