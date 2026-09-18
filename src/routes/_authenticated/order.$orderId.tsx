import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gstBreakup, inr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/order/$orderId")({
  head: () => ({
    meta: [
      { title: "Order Detail — POPPiK SFA" },
      { name: "description", content: "View and edit order quantities, check stock availability, accept and invoice." },
      { property: "og:title", content: "Order Detail — POPPiK SFA" },
      { property: "og:description", content: "View and edit order quantities, check stock availability, accept and invoice." },
    ],
  }),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: async () => {
      const [{ data: order, error }, { data: stock }] = await Promise.all([
        supabase
          .from("orders")
          .select("*, retailers(*), csas(*), distributors(*), order_items(id, qty, free_qty, rate, amount, product_id, products(name, sku))")
          .eq("id", orderId)
          .single(),
        supabase.from("distributor_stock").select("*"),
      ]);
      if (error) throw error;
      return { order, stock: stock ?? [] };
    },
  });

  const order = data?.order;
  const items = order?.order_items ?? [];
  const partyName =
    (order?.retailers as { name?: string } | null)?.name ??
    (order?.csas as { name?: string } | null)?.name ??
    "—";

  useEffect(() => {
    if (!order) return;
    const next: Record<string, string> = {};
    for (const it of order.order_items ?? []) next[it.id] = String(it.qty);
    setQty(next);
    setNotes(order.notes ?? "");
  }, [order]);

  const newTotal = items.reduce((s, it) => s + Number(it.rate) * (Number(qty[it.id] ?? it.qty) || 0), 0);
  const anyShort = items.some((it) => {
    const s = (data?.stock ?? []).find(
      (r) => r.product_id === it.product_id && r.distributor_id === order?.distributor_id,
    );
    const available = s ? s.physical_qty - s.reserved_qty : 0;
    return (Number(qty[it.id] ?? it.qty) || 0) > available;
  });

  const save = useMutation({
    mutationFn: async () => {
      for (const it of items) {
        const q = Number(qty[it.id] ?? it.qty) || 0;
        const amount = q * Number(it.rate);
        if (q <= 0) {
          const { error } = await supabase.from("order_items").delete().eq("id", it.id);
          if (error) throw error;
          continue;
        }
        const { error } = await supabase.from("order_items").update({ qty: q, amount }).eq("id", it.id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("orders")
        .update({ total_amount: newTotal, notes: notes.trim() || null })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const act = useMutation({
    mutationFn: async ({ accept }: { accept: boolean }) => {
      if (!order) throw new Error("Order not found");
      await save.mutateAsync();

      if (!accept) {
        const { error } = await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
        if (error) throw error;
        return;
      }

      const { taxable, cgst, sgst, net } = gstBreakup(newTotal);
      const { error: invError } = await supabase
        .from("invoices")
        .insert({ order_id: orderId, taxable_value: taxable, cgst, sgst, net_amount: net });
      if (invError) throw invError;

      for (const it of items) {
        const q = Number(qty[it.id] ?? it.qty) || 0;
        if (q <= 0) continue;
        const row = (data?.stock ?? []).find(
          (s) => s.product_id === it.product_id && s.distributor_id === order.distributor_id,
        );
        if (!row) continue;
        const shipped = q + it.free_qty;
        await supabase
          .from("distributor_stock")
          .update({
            physical_qty: Math.max(0, row.physical_qty - shipped),
            reserved_qty: Math.max(0, row.reserved_qty - shipped),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }

      const { error } = await supabase.from("orders").update({ status: "invoiced" }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      if (vars.accept) {
        toast.success("Invoiced — moved to Invoices tab");
        navigate({ to: "/distributor" });
      } else {
        toast.success("Order rejected");
        navigate({ to: "/distributor" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !order) {
    return (
      <Shell title="Order Detail" subtitle="Loading…">
        <p className="p-6 text-sm text-muted-foreground">Loading order…</p>
      </Shell>
    );
  }

  const editable = order.status === "pending";

  return (
    <Shell title={`Order ${order.order_no}`} subtitle={`${partyName} • ${order.kind ?? "secondary"} sales`}>
      <div className="mb-3 flex items-center justify-between">
        <Button asChild size="sm" variant="outline">
          <Link to="/distributor">
            <ArrowLeft className="mr-1 size-3.5" /> Back to panel
          </Link>
        </Button>
        <Badge variant={order.status === "pending" ? "default" : "secondary"}>{order.status}</Badge>
      </div>

      <Section title="Party details">
        <div className="grid gap-3 p-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Party</p>
            <p className="font-medium">{partyName}</p>
            <p className="text-[11px] text-muted-foreground">
              {((order.retailers ?? order.csas) as { city?: string } | null)?.city ?? ""}{" "}
              {((order.retailers ?? order.csas) as { gstin?: string } | null)?.gstin
                ? `• GSTIN ${((order.retailers ?? order.csas) as { gstin?: string } | null)?.gstin}`
                : ""}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Order date</p>
            <p className="font-medium">{new Date(order.created_at).toLocaleString("en-IN")}</p>
          </div>
        </div>
      </Section>

      <Section title={`Items (${items.length})`}>
        <div className="divide-y divide-border/60">
          {items.map((it) => {
            const s = (data?.stock ?? []).find(
              (r) => r.product_id === it.product_id && r.distributor_id === order.distributor_id,
            );
            const available = s ? s.physical_qty - s.reserved_qty : 0;
            const q = Number(qty[it.id] ?? it.qty) || 0;
            const short = q > available;
            return (
              <div key={it.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{(it.products as { name: string } | null)?.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Rate {inr(it.rate)} • Available {available}
                      {it.free_qty ? ` • ${it.free_qty} free` : ""}
                    </p>
                  </div>
                  {editable ? (
                    <Input
                      className="w-24 shrink-0 text-right"
                      inputMode="numeric"
                      value={qty[it.id] ?? String(it.qty)}
                      onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))}
                    />
                  ) : (
                    <span className="text-sm font-semibold">{it.qty} pcs</span>
                  )}
                </div>
                {short && editable ? (
                  <p className="mt-1 text-[11px] font-medium text-warning">
                    Stock short — only {available} available. Reduce qty or set 0 to remove.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      {editable ? (
        <Section title="Actions">
          <div className="space-y-3 p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="notes">Remark (optional)</Label>
              <Input
                id="notes"
                value={notes}
                placeholder="e.g. qty reduced due to stock shortage"
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
              <span>Revised total</span>
              <span className="font-semibold">{inr(newTotal)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={save.isPending || act.isPending} variant="outline" onClick={() => save.mutate()}>
                <Save className="mr-1 size-3.5" /> Save changes
              </Button>
              <Button
                disabled={act.isPending || items.length === 0 || newTotal <= 0}
                onClick={() => {
                  if (anyShort && !window.confirm("Some items are stock-short. Invoice anyway?")) return;
                  act.mutate({ accept: true });
                }}
              >
                <CheckCircle2 className="mr-1 size-3.5" /> Accept & Invoice
              </Button>
              <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ accept: false })}>
                <XCircle className="mr-1 size-3.5" /> Reject
              </Button>
            </div>
          </div>
        </Section>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          This order is {order.status} and can no longer be edited.
        </p>
      )}
    </Shell>
  );
}
