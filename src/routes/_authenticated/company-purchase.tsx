import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/company-purchase")({
  head: () => ({
    meta: [
      { title: "Order from Company — POPPiK SFA" },
      { name: "description", content: "Master depot purchase order on head office: see live company stock and punch the right quantity for approval." },
      { property: "og:title", content: "Order from Company — POPPiK SFA" },
      { property: "og:description", content: "Punch a depot purchase order against live company stock, approved in the Control Tower." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompanyPurchasePage,
});

function CompanyPurchasePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const profile = me?.profile as { depot_id?: string | null } | null | undefined;
  const myDepotId = profile?.depot_id ?? null;
  const [depotPick, setDepotPick] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});

  const activeDepot = myDepotId || depotPick || "";

  const { data: depots } = useQuery({
    queryKey: ["company-po-depots"],
    queryFn: async () => {
      const { data } = await supabase.from("depots").select("id, name, city").order("name");
      return data ?? [];
    },
  });

  const { data: stock, isLoading } = useQuery({
    queryKey: ["company-live-stock"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_stock")
        .select("id, product_id, physical_qty, reserved_qty, products(name, sku, pts)");
      return data ?? [];
    },
  });

  const lines = useMemo(
    () =>
      (stock ?? []).map((s) => {
        const p = s.products as { name: string; sku: string; pts: number } | null;
        const available = Math.max(0, s.physical_qty - s.reserved_qty);
        const q = Number(qty[s.product_id] ?? 0) || 0;
        const rate = Number(p?.pts ?? 0);
        return {
          productId: s.product_id,
          name: p?.name ?? "Product",
          sku: p?.sku ?? "—",
          rate,
          available,
          qty: q,
          amount: q * rate,
        };
      }),
    [stock, qty],
  );

  const selected = lines.filter((l) => l.qty > 0);
  const total = selected.reduce((s, l) => s + l.amount, 0);
  const overStock = selected.filter((l) => l.qty > l.available);

  const place = useMutation({
    mutationFn: async () => {
      if (!activeDepot) throw new Error("Select the ordering depot");
      if (selected.length === 0) throw new Error("Enter quantity for at least one product");
      if (overStock.length > 0) throw new Error(`Quantity exceeds company stock for ${overStock[0]!.name}`);

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          kind: "company",
          status: "pending",
          depot_id: activeDepot,
          total_amount: total,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: itemErr } = await supabase.from("order_items").insert(
        selected.map((l) => ({
          order_id: order.id,
          product_id: l.productId,
          qty: l.qty,
          rate: l.rate,
          amount: l.amount,
        })),
      );
      if (itemErr) throw itemErr;
    },
    onSuccess: () => {
      toast.success("Purchase order sent to company for approval");
      setQty({});
      qc.invalidateQueries({ queryKey: ["depot-panel"] });
      qc.invalidateQueries({ queryKey: ["company-orders"] });
      navigate({ to: "/depot" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell title="Order from Company" subtitle="Depot purchase order against live company stock">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/depot">
            <ArrowLeft className="mr-1 size-3.5" /> Back to panel
          </Link>
        </Button>
      </div>

      <Section title="Ordering depot">
        <div className="grid gap-3 p-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Master depot</Label>
            {myDepotId ? (
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 text-sm font-medium">
                {depots?.find((d) => d.id === myDepotId)?.name ?? "Loading…"}
              </div>
            ) : (
              <Select value={activeDepot} onValueChange={setDepotPick}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose depot" />
                </SelectTrigger>
                <SelectContent>
                  {(depots ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.city ? ` — ${d.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="SKUs selected" value={String(selected.length)} />
        <StatCard label="Total qty" value={String(selected.reduce((s, l) => s + l.qty, 0))} />
        <StatCard label="Order value" value={inr(total)} tone="primary" />
      </div>

      <Section title="Live company stock">
        {lines.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {isLoading ? "Loading company stock…" : "No company opening stock yet. Add it in Control Tower → Products."}
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {lines.map((l) => (
              <div key={l.productId} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {l.sku} • PTS {inr(l.rate)} •{" "}
                    <span className={l.available <= 10 ? "font-semibold text-warning" : "font-semibold text-success"}>
                      Available {l.available}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={l.available}
                    inputMode="numeric"
                    className="h-9 w-20"
                    placeholder="0"
                    value={qty[l.productId] ?? ""}
                    onChange={(e) => setQty((prev) => ({ ...prev, [l.productId]: e.target.value }))}
                  />
                  <span className="w-24 text-right font-semibold tabular-nums">{l.qty ? inr(l.amount) : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {overStock.length > 0 ? (
        <p className="text-sm font-medium text-destructive">
          {overStock[0]!.name}: only {overStock[0]!.available} pcs available at company stock.
        </p>
      ) : null}

      <Button
        className="w-full"
        disabled={place.isPending || selected.length === 0 || overStock.length > 0}
        onClick={() => place.mutate()}
      >
        <Send className="mr-1 size-4" /> Send company order • {inr(total)}
      </Button>
    </Shell>
  );
}
