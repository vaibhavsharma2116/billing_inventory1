import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchPartyLedger, type PartyType } from "@/lib/party-ledger";
import { downloadReportPdf } from "@/lib/report-pdf";
import { inr } from "@/lib/sfa";
import { useMe } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/party-ledger/$type/$id")({
  head: () => ({
    meta: [
      { title: "Party Ledger Detail — POPPiK SFA" },
      { name: "description", content: "Bill-wise ledger showing every invoice, the payments adjusted against it and the pending balance." },
      { property: "og:title", content: "Party Ledger Detail — POPPiK SFA" },
      { property: "og:description", content: "Invoice vs payment adjustment with outstanding balance and PDF download." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PartyLedgerDetailPage,
});

function PartyLedgerDetailPage() {
  const { type, id } = Route.useParams();
  const partyType: PartyType = type === "distributor" ? "distributor" : "retailer";
  const { data: me } = useMe();
  const isCsa = me?.role === "csa";
  const isDepot = me?.role === "depot";
  const myCsaId = (me?.profile?.csa_id as string | null) ?? null;
  const myDepotId = (me?.profile?.depot_id as string | null) ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["party-ledger", partyType, id, myCsaId, myDepotId],
    queryFn: () =>
      fetchPartyLedger(partyType, id, isCsa ? myCsaId : null, isDepot ? myDepotId : null),
  });

  const exportPdf = () => {
    if (!data) return;
    downloadReportPdf({
      fileName: `poppik-ledger-${data.party.name.replace(/\s+/g, "-").toLowerCase()}.pdf`,
      title: `Ledger — ${data.party.name}`,
      subtitle: `${partyType === "retailer" ? "Retailer" : "Distributor"} • ${data.party.area}`,
      meta: [
        `Total billed: ${inr(data.totals.billed)}`,
        `Payment received: ${inr(data.totals.received)}`,
        `Pending balance: ${inr(data.totals.balance)}`,
      ],
      tables: [
        {
          title: "Bill-wise outstanding",
          head: ["Invoice", "Order / Date", "Bill amount", "Paid", "Balance"],
          rows: data.bills.map((b) => [b.invoiceNo, `${b.orderNo} • ${b.date}`, inr(b.amount), inr(b.paid), inr(b.balance)]),
          align: ["left", "left", "right", "right", "right"],
        },
        {
          title: "Payments received",
          head: ["Date", "Mode / Ref", "Adjusted against", "Amount"],
          rows: data.payments.map((p) => [p.date, `${p.mode} • ${p.reference}`, p.appliedTo, inr(p.amount)]),
          align: ["left", "left", "left", "right"],
        },
      ],
    }).catch((e: Error) => toast.error(e.message));
  };

  return (
    <Shell
      title={data?.party.name ?? "Party Ledger"}
      subtitle={data ? `${partyType === "retailer" ? "Retailer" : "Distributor"} • ${data.party.area}` : "Loading ledger…"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/party-ledger">
            <ArrowLeft className="mr-1 size-3.5" /> All parties
          </Link>
        </Button>
        <Button size="sm" onClick={exportPdf} disabled={!data}>
          <Download className="mr-1 size-3.5" /> Download PDF
        </Button>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load ledger."}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total billed" value={inr(data?.totals.billed ?? 0)} />
        <StatCard label="Received" value={inr(data?.totals.received ?? 0)} />
        <StatCard label="Pending" value={inr(data?.totals.balance ?? 0)} />
      </div>

      <Section title={`Bill-wise outstanding — ${data?.bills.length ?? 0} invoices`}>
        {!data?.bills.length ? (
          <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No invoices for this party."}</p>
        ) : (
          <div className="divide-y divide-border/60">
            {data.bills.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{b.invoiceNo}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.orderNo} • {b.date} • Bill {inr(b.amount)} • Paid {inr(b.paid)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{inr(b.balance)}</p>
                  <Badge variant={b.balance <= 0.01 ? "secondary" : "outline"} className="mt-1 text-[10px]">
                    {b.balance <= 0.01 ? "Paid" : b.paid > 0 ? "Partly paid" : "Unpaid"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Payments received — ${data?.payments.length ?? 0}`}>
        {!data?.payments.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            {isLoading ? "Loading…" : "No payments recorded against this party."}
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {data.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.mode} • {p.reference}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.date} • Against: {p.appliedTo}
                    {p.unapplied > 0.01 ? ` • On account ${inr(p.unapplied)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-right font-semibold tabular-nums">{inr(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Shell>
  );
}
