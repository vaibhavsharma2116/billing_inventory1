import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { inr, exactInr } from "@/lib/sfa";

type Item = { id: string; product_id: string; qty: number; rate: number; amount: number; products: { name: string; sku: string } | null };
type Order = {
  id: string;
  order_no: string;
  status: string;
  depot_id: string | null;
  total_amount: number;
  created_at: string;
  depots: { name: string; city: string | null } | null;
  order_items: Item[];
};

export function CompanyOrders() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Record<string, string>>({});

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["company-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_no, status, depot_id, total_amount, created_at, depots(name, city), order_items(id, product_id, qty, rate, amount, products(name, sku))")
        .eq("kind", "company")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Order[];
    },
  });

  const review = useMutation({
    mutationFn: async ({ order, approve }: { order: Order; approve: boolean }) => {
      if (!approve) {
        const { error } = await supabase.from("orders").update({ status: "rejected" }).eq("id", order.id);
        if (error) throw error;
        return;
      }
      if (!order.depot_id) throw new Error("This order has no depot mapped");

      const lines = order.order_items.map((it) => {
        const raw = edit[it.id];
        const qty = raw === undefined || raw === "" ? it.qty : Number(raw);
        if (!Number.isFinite(qty) || qty < 0) throw new Error("Enter a valid quantity");
        return { ...it, qty, amount: qty * Number(it.rate) };
      });

      const [{ data: comp }, { data: dep }] = await Promise.all([
        supabase.from("company_stock").select("id, product_id, physical_qty"),
        supabase.from("depot_stock").select("id, product_id, physical_qty").eq("depot_id", order.depot_id),
      ]);

      for (const l of lines) {
        if (l.qty === 0) continue;
        const c = (comp ?? []).find((r) => r.product_id === l.product_id);
        if (!c || c.physical_qty < l.qty) throw new Error(`Not enough company stock for ${l.products?.name ?? "product"}`);
      }

      for (const l of lines) {
        const { error: itemErr } = await supabase
          .from("order_items")
          .update({ qty: l.qty, amount: l.amount })
          .eq("id", l.id);
        if (itemErr) throw itemErr;
        if (l.qty === 0) continue;

        const c = (comp ?? []).find((r) => r.product_id === l.product_id)!;
        const { error: cErr } = await supabase
          .from("company_stock")
          .update({ physical_qty: c.physical_qty - l.qty })
          .eq("id", c.id);
        if (cErr) throw cErr;

        const d = (dep ?? []).find((r) => r.product_id === l.product_id);
        if (d) {
          const { error: dErr } = await supabase
            .from("depot_stock")
            .update({ physical_qty: d.physical_qty + l.qty })
            .eq("id", d.id);
          if (dErr) throw dErr;
        } else {
          const { error: dErr } = await supabase.from("depot_stock").insert({
            depot_id: order.depot_id,
            product_id: l.product_id,
            physical_qty: l.qty,
            reserved_qty: 0,
          });
          if (dErr) throw dErr;
        }
      }

      const total = lines.reduce((s, l) => s + l.amount, 0);
      const { error } = await supabase.from("orders").update({ status: "delivered", total_amount: total }).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Order approved — stock moved to the depot" : "Order rejected");
      setEdit({});
      qc.invalidateQueries({ queryKey: ["company-orders"] });
      qc.invalidateQueries({ queryKey: ["company-stock"] });
      qc.invalidateQueries({ queryKey: ["depot-panel"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = orders.filter((o) => o.status === "pending");
  const history = orders.filter((o) => o.status !== "pending");

  return (
    <div className="space-y-4">
      <Section title={`Depot purchase orders${pending.length ? ` (${pending.length} pending)` : ""}`}>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading orders…</p>
        ) : pending.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No pending depot orders.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {pending.map((o) => (
              <div key={o.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {o.depots?.name ?? "Depot"}
                      {o.depots?.city ? ` — ${o.depots.city}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {o.order_no} • {new Date(o.created_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(o.total_amount)}</p>
                </div>
                <div className="mt-2 space-y-1.5">
                  {o.order_items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {it.products?.name ?? "Product"}{" "}
                        <span className="text-[11px] text-muted-foreground">@ {exactInr(it.rate)}</span>
                      </span>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-20"
                        value={edit[it.id] ?? String(it.qty)}
                        onChange={(e) => setEdit((p) => ({ ...p, [it.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ order: o, approve: true })}>
                    <Check className="mr-1 size-4" /> Approve &amp; dispatch
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ order: o, approve: false })}
                  >
                    <X className="mr-1 size-4" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Order history">
        {history.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No processed depot orders yet.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {history.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.depots?.name ?? "Depot"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {o.order_no} • {new Date(o.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={o.status === "delivered" ? "secondary" : "outline"}>{o.status}</Badge>
                  <span className="font-semibold tabular-nums">{inr(o.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
