import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Section, StatCard } from "@/components/sfa/Shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inr } from "@/lib/sfa";
import { fetchMarginBudget, type PartyMargin } from "@/lib/margin-budget";
import { downloadReportPdf, rs } from "@/lib/report-pdf";

type Props = {
  /** Restrict to these distributors (null = all visible). */
  distributorIds?: string[] | null;
  /** Restrict to these CSAs (null = all visible). */
  csaIds?: string[] | null;
  title?: string;
};

export function MarginBudget({ distributorIds = null, csaIds = null, title = "Margin Budget" }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["margin-budget", distributorIds, csaIds, from, to],
    queryFn: () => fetchMarginBudget({ distributorIds, csaIds, from: from || undefined, to: to || undefined }),
  });

  const t = data?.totals;

  const parties = useMemo(() => {
    const list = data?.parties ?? [];
    const q = partyFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q));
  }, [data, partyFilter]);

  const openReport = (metric: string) => navigate({ to: "/margin-report/$metric", params: { metric } });

  const exportPdf = () => {
    if (!data) return;
    downloadReportPdf({
      fileName: "margin-budget.pdf",
      title: "Margin Budget Report",
      subtitle: `Allowed ${rs(t?.allowed ?? 0)} | Used ${rs(t?.given ?? 0)} | Balance ${rs(t?.balance ?? 0)}`,
      tables: [
        {
          title: "Party-wise margin budget",
          head: ["Party", "Type / Area", "Allowed", "Margin Given", "Balance"],
          rows: data.parties.map((p) => [
            p.name,
            `${p.type === "csa" ? "CSA" : "Distributor"} - ${p.area}`,
            rs(p.allowed),
            rs(p.given),
            rs(p.balance),
          ]),
        },
      ],
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Allowed Margin Budget" value={inr(t?.allowed)} tone="primary" hint="Tap for full report" onClick={() => openReport("allowed")} />
        <StatCard label="Margin Given" value={inr(t?.given)} tone="warning" hint="Tap for full report" onClick={() => openReport("given")} />
        <StatCard
          label="Balance Margin"
          value={inr(t?.balance)}
          tone={(t?.balance ?? 0) >= 0 ? "success" : "danger"}
          hint="Tap for full report"
          onClick={() => openReport("balance")}
        />
        <StatCard label="Extra Margin Given" value={inr(t?.overspent)} tone="danger" hint="Tap for full report" onClick={() => openReport("overspent")} />
      </div>

      <Section
        title={title}
        action={
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={!data}>
            Download PDF
          </Button>
        }
      >
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
            <Input
              placeholder="Search party / area…"
              value={partyFilter}
              onChange={(e) => setPartyFilter(e.target.value)}
              className="h-8"
            />
          </div>
          {from || to || partyFilter ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
                setPartyFilter("");
              }}
            >
              Clear
            </Button>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <Badge variant="secondary">Rate loss {inr(t?.givenBilling)}</Badge>
            <Badge variant="secondary">Free goods {inr(t?.givenFree)}</Badge>
            <Badge variant="secondary">Approved claims {inr(t?.givenClaims)}</Badge>
          </div>
        </div>

        <div className="divide-y divide-border/60">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading margin data…</p>
          ) : parties.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No billing found for this filter.</p>
          ) : (
            parties.map((p) => <PartyRow key={`${p.type}-${p.id}`} p={p} open={open} setOpen={setOpen} />)
          )}
        </div>
      </Section>
    </div>
  );
}

function PartyRow({
  p,
  open,
  setOpen,
}: {
  p: PartyMargin;
  open: string | null;
  setOpen: (v: string | null) => void;
}) {
  const key = `${p.type}-${p.id}`;
  const isOpen = open === key;
  const used = p.allowed > 0 ? Math.min((p.given / p.allowed) * 100, 100) : 100;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(isOpen ? null : key)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-accent/40"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{p.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {p.type === "csa" ? "CSA" : "Distributor"} • {p.area} • {p.orders} bills • Sales {inr(p.sales)}
          </p>
          <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div
              className={p.balance < 0 ? "h-full bg-destructive" : "h-full bg-primary"}
              style={{ width: `${used}%` }}
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={p.balance < 0 ? "font-semibold text-destructive" : "font-semibold text-success"}>
            {p.balance < 0 ? `-${inr(-p.balance)}` : inr(p.balance)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {p.balance < 0 ? "extra margin given" : "budget left"}
          </p>
        </div>
      </button>

      {isOpen ? (
        <div className="grid grid-cols-2 gap-2 bg-muted/40 p-3 text-xs md:grid-cols-3">
          <Cell label="Allowed margin budget" value={inr(p.allowed)} />
          <Cell label="Given via lower billing" value={inr(p.givenBilling)} />
          <Cell label="Given via free goods" value={inr(p.givenFree)} />
          <Cell label="Approved claims" value={inr(p.givenClaims)} />
          <Cell label="Total margin given" value={inr(p.given)} />
          <Cell
            label={p.balance < 0 ? "Extra margin given" : "Balance margin"}
            value={p.balance < 0 ? `-${inr(-p.balance)}` : inr(p.balance)}
          />
        </div>
      ) : null}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
