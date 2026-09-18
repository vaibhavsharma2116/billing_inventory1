import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/sfa";
import { useMe } from "@/hooks/useAuth";
import { downloadReportPdf } from "@/lib/report-pdf";
import { useReportFilters } from "@/components/sfa/ReportFilterBar";

export const Route = createFileRoute("/_authenticated/csa-report/$card")({
  head: () => ({
    meta: [
      { title: "CSA Detail Report — POPPiK SFA" },
      { name: "description", content: "Full detail report for pending orders, distributors, stock and outstanding with PDF download." },
      { property: "og:title", content: "CSA Detail Report — POPPiK SFA" },
      { property: "og:description", content: "Drill-down report from the CSA panel with PDF export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CsaReportPage,
});

type Row = {
  key: string;
  label: string;
  sub: string;
  value: string;
  status?: string;
  orderId?: string;
  distributorId?: string;
  city?: string | null;
  area?: string | null;
  pincode?: string | null;
  salesman?: string | null;
};

function CsaReportPage() {
  const { card } = Route.useParams();
  const { data: me } = useMe();
  const myCsaId = (me?.profile?.csa_id as string | null) ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["csa-report-data", myCsaId],
    queryFn: async () => {
      const [orders, stock, distributors, payments] = await Promise.all([
        supabase
          .from("orders")
          .select("*, distributors(name, city), order_items(id, qty)")
          .eq("kind", "primary")
          .order("created_at", { ascending: false }),
        myCsaId
          ? supabase.from("csa_stock").select("*, products(name, sku, pts)").eq("csa_id", myCsaId)
          : supabase.from("csa_stock").select("*, products(name, sku, pts)"),
        supabase.from("distributors").select("*"),
        supabase
          .from("csa_payments")
          .select("*, distributors(name)")
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      return {
        orders: orders.data ?? [],
        stock: stock.data ?? [],
        distributors: (distributors.data ?? []).filter(
          (d) => !myCsaId || (d.csa_id as string | null) === myCsaId,
        ),
        payments: payments.data ?? [],
      };
    },
  });

  const reports: Record<string, { title: string; description: string; columns: [string, string, string]; rows: Row[] }> = {};

  if (data?.orders && data.stock && data.distributors && data.payments) {
    const pending = data.orders.filter((o) => o.status === "pending");
    reports["pending"] = {
      title: "Pending Primary Orders",
      description: "Distributor orders waiting for CSA approval — click a row to open and action it",
      columns: ["Order / Distributor", "Date • Items", "Amount"],
      rows: pending.map((o) => ({
        key: o.id,
        orderId: o.id,
        label: `${o.order_no} • ${(o.distributors as { name: string } | null)?.name ?? "-"}`,
        sub: `${new Date(o.created_at).toLocaleDateString("en-IN")} • ${(o.order_items ?? []).length} SKU`,
        value: inr(o.total_amount),
        status: o.status,
        city: (o.distributors as { city?: string | null } | null)?.city ?? null,
      })),
    };
    reports["distributors"] = {
      title: "Distributor Network",
      description: "All mapped distributors with city, credit limit and outstanding — click a row for the full detail report",
      columns: ["Distributor", "City • GSTIN", "Outstanding"],
      rows: data.distributors.map((d) => ({
        key: d.id,
        distributorId: d.id,
        label: d.name,
        sub: `${d.city ?? "-"}${d.state ? `, ${d.state}` : ""} • ${d.gstin ?? "No GSTIN"}`,
        value: inr(d.outstanding),
        city: d.city,
      })),
    };
    reports["stock"] = {
      title: "CSA Warehouse Stock",
      description: "Product-wise physical, reserved and available stock with PTS value",
      columns: ["Product", "Physical • Reserved", "Available / Value"],
      rows: data.stock.map((s) => {
        const avail = s.physical_qty - s.reserved_qty;
        const pts = Number((s.products as { pts: number } | null)?.pts ?? 0);
        return {
          key: s.id,
          label: (s.products as { name: string } | null)?.name ?? "Item",
          sub: `Physical ${s.physical_qty} • Reserved ${s.reserved_qty}`,
          value: `${avail} pcs (${inr(avail * pts)})`,
        };
      }),
    };
    reports["outstanding"] = {
      title: "Outstanding & Collections",
      description: "Distributor-wise outstanding balance with approved payment history",
      columns: ["Distributor", "Last approved payment", "Outstanding"],
      rows: data.distributors
        .map((d) => {
          const last = data.payments.find(
            (p) => (p.distributors as { name: string } | null)?.name === d.name,
          );
          return {
            key: d.id,
            distributorId: d.id,
            label: d.name,
            sub: last
              ? `${inr(last.amount)} on ${new Date(last.created_at).toLocaleDateString("en-IN")} (${last.mode})`
              : "No payment received yet",
            value: inr(d.outstanding),
            city: d.city,
          };
        })
        .sort((a, b) => parseFloat(b.value.replace(/[^\d.-]/g, "")) - parseFloat(a.value.replace(/[^\d.-]/g, ""))),
    };
  }

  const report = reports[card] ?? null;
  const { filtered: rows, bar } = useReportFilters(report?.rows ?? [], card);

  const exportPdf = () => {
    if (!report) return;
    downloadReportPdf({
      fileName: `poppik-csa-${card}-report.pdf`,
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
    <Shell title={report?.title ?? "Detail Report"} subtitle={report?.description ?? "CSA panel drill-down"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/csa">
            <ArrowLeft className="mr-1 size-3.5" /> Back to CSA panel
          </Link>
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
          <p className="p-4 text-sm text-muted-foreground">No records.</p>
        ) : (
          <div className="divide-y divide-border/60">
            <div className="hidden gap-3 p-3 text-[11px] uppercase tracking-wider text-muted-foreground md:flex">
              <span className="flex-1">{report.columns[0]}</span>
              <span className="flex-1">{report.columns[1]}</span>
              <span className="w-40 text-right">{report.columns[2]}</span>
            </div>
            {rows.map((r) => {
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.label}</p>
                    <p className="text-[11px] text-muted-foreground md:hidden">{r.sub}</p>
                  </div>
                  <p className="hidden flex-1 text-[12px] text-muted-foreground md:block">{r.sub}</p>
                  <span className="w-40 shrink-0 text-right font-semibold tabular-nums">{r.value}</span>
                  {r.status ? <Badge variant="secondary">{r.status}</Badge> : null}
                </>
              );
              return r.orderId ? (
                <Link
                  key={r.key}
                  to="/primary-order/$orderId"
                  params={{ orderId: r.orderId }}
                  className="flex items-center justify-between gap-3 p-3 text-sm transition-colors hover:bg-muted/50"
                >
                  {body}
                </Link>
              ) : r.distributorId ? (
                <Link
                  key={r.key}
                  to="/party-ledger/$type/$id"
                  params={{ type: "distributor", id: r.distributorId }}
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
          </div>
        )}
      </Section>
    </Shell>
  );
}
