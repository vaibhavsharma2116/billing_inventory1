import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { useReportFilters } from "@/components/sfa/ReportFilterBar";
import { buildAdminReports, fetchAdminPanel } from "@/lib/admin-report";
import { downloadReportPdf } from "@/lib/report-pdf";

export const Route = createFileRoute("/_authenticated/admin-report/$card")({
  head: () => ({
    meta: [
      { title: "Admin Detail Report — POPPiK SFA" },
      { name: "description", content: "Full detail report for sales, collections, network, stock and team with PDF download." },
      { property: "og:title", content: "Admin Detail Report — POPPiK SFA" },
      { property: "og:description", content: "Drill-down report from the company control tower with PDF export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminReportPage,
});

const PAGE_SIZE = 15;

function AdminReportPage() {
  const { card } = Route.useParams();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({ queryKey: ["admin-report-panel"], queryFn: fetchAdminPanel });

  const reports = data ? buildAdminReports(data) : null;
  const report = reports?.[card] ?? null;

  const { filtered: filteredRows, bar } = useReportFilters(report?.rows ?? [], card);

  useEffect(() => {
    setPage(1);
  }, [card, filteredRows.length]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportPdf = () => {
    if (!report) return;
    downloadReportPdf({
      fileName: `poppik-admin-${card}-report.pdf`,
      title: report.title,
      subtitle: report.description,
      meta: [`Records: ${filteredRows.length}`, `Generated: ${new Date().toLocaleString("en-IN")}`],
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
    <Shell title={report?.title ?? "Detail Report"} subtitle={report?.description ?? "Control tower drill-down"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/admin">
            <ArrowLeft className="mr-1 size-3.5" /> Back to dashboard
          </Link>
        </Button>
        <Button size="sm" onClick={exportPdf} disabled={!report}>
          <Download className="mr-1 size-3.5" /> Download PDF
        </Button>
      </div>

      {bar}

      <Section
        title={
          report
            ? `${report.title} — ${filteredRows.length} records · Page ${safePage} of ${totalPages}`
            : "Report"
        }
      >
        {!report ? (
          <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "Unknown report."}</p>
        ) : filteredRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No records.</p>
        ) : (
          <div className="divide-y divide-border/60">
            <div className="hidden gap-3 p-3 text-[11px] uppercase tracking-wider text-muted-foreground md:flex">
              <span className="flex-1">{report.columns[0]}</span>
              <span className="flex-1">{report.columns[1]}</span>
              <span className="w-32 text-right">{report.columns[2]}</span>
            </div>
            {pagedRows.map((r) => {
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
                  to="/admin-csa/$id"
                  params={{ id: r.link.id }}
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
            {totalPages > 1 ? (
              <div className="flex items-center justify-between p-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="mr-1 size-4" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Section>
    </Shell>
  );
}
