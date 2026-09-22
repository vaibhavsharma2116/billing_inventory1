import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { fetchCsaDetail } from "@/lib/csa-detail";
import { downloadReportPdf } from "@/lib/report-pdf";
import { inr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/admin-csa/$id")({
  head: () => ({
    meta: [
      { title: "CSA Detail — POPPiK SFA" },
      { name: "description", content: "Full CSA profile: contact, mapped distributors, live stock, orders, deliveries and payments." },
      { property: "og:title", content: "CSA Detail — POPPiK SFA" },
      { property: "og:description", content: "Complete CSA drill-down from the admin control tower." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminCsaDetailPage,
});

const num = (v: unknown) => Number(v ?? 0);
const d = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("en-IN") : "—");

function AdminCsaDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({ queryKey: ["csa-detail", id], queryFn: () => fetchCsaDetail(id) });

  const csa = data?.csa;
  const distributors = data?.distributors ?? [];
  const stock = data?.stock ?? [];
  const orders = data?.orders ?? [];
  const deliveries = data?.deliveries ?? [];
  const payments = data?.payments ?? [];

  const totalBilling = orders.filter((o) => o.status !== "rejected").reduce((s, o) => s + num(o.total_amount), 0);
  const stockValue = stock.reduce((s, x) => s + (num(x.physical_qty) - num(x.reserved_qty)) * num((x.products as { ptr: number } | null)?.ptr), 0);
  const received = payments.filter((p) => p.status === "approved").reduce((s, p) => s + num(p.amount), 0);
  const outstanding = distributors.reduce((s, x) => s + num(x.outstanding), 0);

  const exportPdf = () => {
    if (!csa) return;
    downloadReportPdf({
      fileName: `poppik-csa-${csa.name.replace(/\s+/g, "-").toLowerCase()}.pdf`,
      title: `CSA Detail — ${csa.name}`,
      subtitle: `${csa.address ?? ""} ${csa.city ?? ""} ${csa.state ?? ""} • GSTIN ${csa.gstin ?? "—"} • ${csa.phone ?? ""} ${csa.email ?? ""}`,
      meta: [
        `Mapped distributors: ${distributors.length}`,
        `Total billing: ${inr(totalBilling)}`,
        `Live stock value: ${inr(stockValue)}`,
        `Payments received: ${inr(received)}`,
        `Generated: ${new Date().toLocaleString("en-IN")}`,
      ],
      tables: [
        {
          title: "Mapped Distributors",
          head: ["Distributor", "City / Contact", "Outstanding"],
          rows: distributors.map((x) => [x.name, `${x.city ?? "—"}, ${x.state ?? "—"}${x.phone ? ` • ${x.phone}` : ""}`, inr(x.outstanding)]),
          align: ["left", "left", "right"],
        },
        {
          title: "Live Stock",
          head: ["Product", "SKU / PTR", "Available"],
          rows: stock.map((x) => [
            (x.products as { name: string } | null)?.name ?? "Product",
            `${(x.products as { sku: string } | null)?.sku ?? ""} • PTR ${inr((x.products as { ptr: number } | null)?.ptr)}`,
            String(num(x.physical_qty) - num(x.reserved_qty)),
          ]),
          align: ["left", "left", "right"],
        },
        {
          title: "Orders",
          head: ["Order", "Party / Status / Date", "Amount"],
          rows: orders.map((o) => [
            o.order_no,
            `${o.kind} • ${(o.distributors as { name: string } | null)?.name ?? "—"} • ${o.status} • ${d(o.created_at)}`,
            inr(o.total_amount),
          ]),
          align: ["left", "left", "right"],
        },
        {
          title: "Deliveries",
          head: ["LR No", "Transporter / Distributor / Date", "Status"],
          rows: deliveries.map((x) => [
            x.lr_no ?? "—",
            `${x.transporter_name ?? "—"}${x.transporter_mobile ? ` (${x.transporter_mobile})` : ""} • ${(x.distributors as { name: string } | null)?.name ?? "—"} • ${d(x.dispatch_date)}`,
            x.status,
          ]),
          align: ["left", "left", "right"],
        },
        {
          title: "Payments Received",
          head: ["Distributor", "Mode / Reference / Date", "Amount"],
          rows: payments.map((p) => [
            (p.distributors as { name: string } | null)?.name ?? "Distributor",
            `${p.mode}${p.reference ? ` • ${p.reference}` : ""} • ${p.status} • ${d(p.created_at)}`,
            inr(p.amount),
          ]),
          align: ["left", "left", "right"],
        },
      ],
    }).catch((e: Error) => toast.error(e.message));
  };

  if (isLoading || !csa) {
    return (
      <Shell title="CSA Detail" subtitle="Loading…">
        <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "CSA not found."}</p>
      </Shell>
    );
  }

  return (
    <Shell title={csa.name} subtitle={`${(csa.depots as { name: string } | null)?.name ?? "—"} depot • ${csa.city ?? "—"}, ${csa.state ?? "—"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/admin-report/$card" params={{ card: "csas" }}>
            <ArrowLeft className="mr-1 size-3.5" /> Back to CSA report
          </Link>
        </Button>
        <Button size="sm" onClick={exportPdf}>
          <Download className="mr-1 size-3.5" /> Download PDF
        </Button>
      </div>

      <Section title="Profile">
        <div className="grid gap-2 p-3 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Address:</span> {csa.address ?? "—"}</p>
          <p><span className="text-muted-foreground">City / State:</span> {csa.city ?? "—"}, {csa.state ?? "—"}</p>
          <p><span className="text-muted-foreground">Phone:</span> {csa.phone ?? "—"}</p>
          <p><span className="text-muted-foreground">Email:</span> {csa.email ?? "—"}</p>
          <p><span className="text-muted-foreground">GSTIN:</span> {csa.gstin ?? "—"}</p>
          <p><span className="text-muted-foreground">Depot:</span> {(csa.depots as { name: string; city: string } | null)?.name ?? "—"}</p>
        </div>
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total billing" value={inr(totalBilling)} />
        <StatCard label="Live stock value" value={inr(stockValue)} />
        <StatCard label="Payments received" value={inr(received)} />
        <StatCard label="Distributor outstanding" value={inr(outstanding)} />
      </div>

      <Section title={`Mapped Distributors — ${distributors.length}`}>
        {distributors.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No distributors mapped.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {distributors.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{x.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {x.city ?? "—"}, {x.state ?? "—"}{x.phone ? ` • ${x.phone}` : ""}{x.email ? ` • ${x.email}` : ""}
                  </p>
                </div>
                <span className="w-32 shrink-0 text-right font-semibold tabular-nums">{inr(x.outstanding)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Live Stock — ${stock.length} SKUs`}>
        {stock.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No stock records.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {stock.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{(x.products as { name: string } | null)?.name ?? "Product"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(x.products as { sku: string } | null)?.sku ?? ""} • PTR {inr((x.products as { ptr: number } | null)?.ptr)} • Physical {x.physical_qty} / Reserved {x.reserved_qty}
                  </p>
                </div>
                <span className="w-32 shrink-0 text-right font-semibold tabular-nums">{num(x.physical_qty) - num(x.reserved_qty)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Orders — ${orders.length}`}>
        {orders.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No orders.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{o.order_no}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {o.kind} • {(o.distributors as { name: string } | null)?.name ?? "—"} • {o.status} • {d(o.created_at)}
                  </p>
                </div>
                <span className="w-32 shrink-0 text-right font-semibold tabular-nums">{inr(o.total_amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Deliveries — ${deliveries.length}`}>
        {deliveries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No deliveries.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {deliveries.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">LR {x.lr_no ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {x.transporter_name ?? "—"}{x.transporter_mobile ? ` (${x.transporter_mobile})` : ""} • {(x.distributors as { name: string } | null)?.name ?? "—"} • {d(x.dispatch_date)}
                  </p>
                </div>
                <span className="w-32 shrink-0 text-right font-semibold">{x.status}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Payments Received — ${payments.length}`}>
        {payments.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No payments.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{(p.distributors as { name: string } | null)?.name ?? "Distributor"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.mode}{p.reference ? ` • ${p.reference}` : ""} • {p.status} • {d(p.created_at)}
                  </p>
                </div>
                <span className="w-32 shrink-0 text-right font-semibold tabular-nums">{inr(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Shell>
  );
}
