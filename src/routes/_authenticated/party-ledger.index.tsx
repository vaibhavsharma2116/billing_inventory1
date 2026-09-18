import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchParties } from "@/lib/party-ledger";
import { inr } from "@/lib/sfa";
import { useMe, roleHome } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/party-ledger/")({
  head: () => ({
    meta: [
      { title: "Party Ledger — POPPiK SFA" },
      { name: "description", content: "Party-wise ledger for retailers and distributors: bills raised, payments received and pending balance." },
      { property: "og:title", content: "Party Ledger — POPPiK SFA" },
      { property: "og:description", content: "Open any party to see bill-wise payment adjustment and pending amount." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PartyLedgerListPage,
});

function PartyLedgerListPage() {
  const [q, setQ] = useState("");
  const { data: me } = useMe();
  const isCsa = me?.role === "csa";
  const isDepot = me?.role === "depot";
  const myCsaId = (me?.profile?.csa_id as string | null) ?? null;
  const myDepotId = (me?.profile?.depot_id as string | null) ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["parties", myCsaId, myDepotId],
    queryFn: () => fetchParties(isCsa ? myCsaId : null, isDepot ? myDepotId : null),
  });

  const parties = (data ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const billed = parties.reduce((s, p) => s + p.billed, 0);
  const received = parties.reduce((s, p) => s + p.received, 0);
  const balance = parties.reduce((s, p) => s + p.balance, 0);

  return (
    <Shell title="Party Ledger" subtitle="Click any party for bill-wise payment detail">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={me?.role ? roleHome[me.role] : "/"}>
            <ArrowLeft className="mr-1 size-3.5" /> Back to panel
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total billed" value={inr(billed)} />
        <StatCard label="Received" value={inr(received)} />
        <StatCard label="Pending" value={inr(balance)} />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search party…" className="pl-9" />
      </div>

      <Section title={`Parties — ${parties.length}`}>
        {parties.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No parties found."}</p>
        ) : (
          <div className="divide-y divide-border/60">
            {parties.map((p) => (
              <Link
                key={`${p.type}-${p.id}`}
                to="/party-ledger/$type/$id"
                params={{ type: p.type, id: p.id }}
                className="flex items-center justify-between gap-3 p-3 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.type === "retailer" ? "Retailer" : "Distributor"} • {p.area} • Billed {inr(p.billed)} • Paid {inr(p.received)}
                  </p>
                </div>
                <span className="shrink-0 text-right font-semibold tabular-nums">{inr(p.balance)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </Section>
    </Shell>
  );
}
