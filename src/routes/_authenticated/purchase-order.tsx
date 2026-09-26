import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { inr, exactInr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/purchase-order")({
  head: () => ({
    meta: [
      { title: "Order from CSA — POPPiK SFA" },
      { name: "description", content: "Distributor purchase order: pick a CSA, see live super-stockist stock and place the right quantity." },
      { property: "og:title", content: "Order from CSA — POPPiK SFA" },
      { property: "og:description", content: "Place primary purchase orders against live CSA stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PurchaseOrderPage,
});

function PurchaseOrderPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [csaId, setCsaId] = useState("");
  const [distributorId, setDistributorId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});

  const { data: masters } = useQuery({
    queryKey: ["po-masters"],
    queryFn: async () => {
      const [csas, distributors] = await Promise.all([
        supabase.from("csas").select("id, name, city").order("name"),
        supabase.from("distributors").select("id, name, city, csa_id").order("name"),
      ]);
      return { csas: csas.data ?? [], distributors: distributors.data ?? [] };
    },
  });

  const myDistributorId = (me?.profile?.distributor_id as string | null) ?? null;
  const activeDistributor = myDistributorId || distributorId || "";

  // Default the CSA to the one mapped on the logged-in distributor
  const myDistributorCsa = masters?.distributors.find((d) => d.id === activeDistributor)?.csa_id;
  useEffect(() => {
    if (!csaId && myDistributorCsa) setCsaId(myDistributorCsa);
  }, [myDistributorCsa, csaId]);

  const { data: csaStock, isLoading: stockLoading } = useQuery({
    queryKey: ["csa-live-stock", csaId],
    enabled: !!csaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("csa_stock")
        .select("id, product_id, physical_qty, reserved_qty, products(name, sku, pts)")
        .eq("csa_id", csaId);
      return data ?? [];
    },
  });

  const lines = useMemo(
    () =>
      (csaStock ?? []).map((s) => {
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
    [csaStock, qty],
  );

  const selected = lines.filter((l) => l.qty > 0);
  const total = selected.reduce((s, l) => s + l.amount, 0);
  const overStock = selected.filter((l) => l.qty > l.available);

  const place = useMutation({
    mutationFn: async () => {
      if (!csaId) throw new Error("Select a CSA first");
      if (!activeDistributor) throw new Error("Select the distributor");
      if (selected.length === 0) throw new Error("Enter quantity for at least one product");
      if (overStock.length > 0) throw new Error(`Quantity exceeds CSA stock for ${overStock[0]!.name}`);

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          kind: "primary",
          status: "pending",
          csa_id: csaId,
          distributor_id: activeDistributor,
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
      toast.success("Purchase order sent to CSA for approval");
      setQty({});
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
      qc.invalidateQueries({ queryKey: ["csa-panel"] });
      navigate({ to: "/distributor" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell title="Order from CSA" subtitle="Primary purchase order against live CSA stock">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/distributor">
            <ArrowLeft className="mr-1 size-3.5" /> Back to panel
          </Link>
        </Button>
      </div>

      <Section title="Select CSA">
        <div className="grid gap-3 p-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>CSA / Super stockist</Label>
            <Select value={csaId} onValueChange={setCsaId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose CSA" />
              </SelectTrigger>
              <SelectContent>
                {(masters?.csas ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.city ? ` — ${c.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ordering distributor</Label>
            {myDistributorId ? (
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 text-sm font-medium">
                {masters?.distributors.find((d) => d.id === myDistributorId)?.name ?? "Loading…"}
                {masters?.distributors.find((d) => d.id === myDistributorId)?.city
                  ? ` — ${masters.distributors.find((d) => d.id === myDistributorId)!.city}`
                  : ""}
              </div>
            ) : (
              <Select value={activeDistributor} onValueChange={setDistributorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose distributor" />
                </SelectTrigger>
                <SelectContent>
                  {(masters?.distributors ?? []).map((d) => (
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

      <Section title="Live CSA stock">
        {!csaId ? (
          <p className="p-4 text-sm text-muted-foreground">Select a CSA to see its live stock.</p>
        ) : lines.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{stockLoading ? "Loading live stock…" : "No stock at this CSA."}</p>
        ) : (
          <div className="divide-y divide-border/60">
            {lines.map((l) => (
              <div key={l.productId} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {l.sku} • PTS {exactInr(l.rate)} •{" "}
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
          {overStock[0]!.name}: only {overStock[0]!.available} pcs available at this CSA.
        </p>
      ) : null}

      <Button
        className="w-full"
        disabled={place.isPending || selected.length === 0 || overStock.length > 0}
        onClick={() => place.mutate()}
      >
        <Send className="mr-1 size-4" /> Send purchase order • {inr(total)}
      </Button>
    </Shell>
  );
}
