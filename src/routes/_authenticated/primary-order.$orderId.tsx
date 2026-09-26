import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Save, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gstBreakup, inr, exactInr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/primary-order/$orderId")({
  head: () => ({
    meta: [
      { title: "Primary Order — POPPiK SFA" },
      { name: "description", content: "CSA review of a distributor primary order: adjust quantities against live stock, then approve or reject." },
      { property: "og:title", content: "Primary Order — POPPiK SFA" },
      { property: "og:description", content: "Adjust quantities against live CSA stock and approve or reject the distributor order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrimaryOrderPage,
});

function PrimaryOrderPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["primary-order", orderId],
    queryFn: async () => {
      const { data: order, error } = await supabase
        .from("orders")
        .select("*, distributors(*), csas(*), order_items(id, qty, free_qty, rate, amount, product_id, products(name, sku))")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      const { data: stock } = await supabase.from("csa_stock").select("*").eq("csa_id", order.csa_id!);
      return { order, stock: stock ?? [] };
    },
  });

  const order = data?.order;
  const items = order?.order_items ?? [];

  useEffect(() => {
    if (!order) return;
    const next: Record<string, string> = {};
    for (const it of order.order_items ?? []) next[it.id] = String(it.qty);
    setQty(next);
    setNotes(order.notes ?? "");
  }, [order]);

  const availableFor = (productId: string) => {
    const row = (data?.stock ?? []).find((s) => s.product_id === productId);
    return row ? Math.max(0, row.physical_qty - row.reserved_qty) : 0;
  };

  const newTotal = items.reduce((s, it) => s + Number(it.rate) * (Number(qty[it.id] ?? it.qty) || 0), 0);
  const anyShort = items.some((it) => (Number(qty[it.id] ?? it.qty) || 0) > availableFor(it.product_id));

  const save = useMutation({
    mutationFn: async () => {
      for (const it of items) {
        const q = Number(qty[it.id] ?? it.qty) || 0;
        if (q <= 0) {
          const { error } = await supabase.from("order_items").delete().eq("id", it.id);
          if (error) throw error;
          continue;
        }
        const { error } = await supabase
          .from("order_items")
          .update({ qty: q, amount: q * Number(it.rate) })
          .eq("id", it.id);
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
      qc.invalidateQueries({ queryKey: ["primary-order", orderId] });
      qc.invalidateQueries({ queryKey: ["csa-panel"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const act = useMutation({
    mutationFn: async ({ accept }: { accept: boolean }) => {
      if (!order) throw new Error("Order not found");

      if (!accept) {
        const { error } = await supabase
          .from("orders")
          .update({ status: "rejected", notes: notes.trim() || null })
          .eq("id", orderId);
        if (error) throw error;
        return;
      }

      const effective = items
        .map((it) => ({ ...it, q: Number(qty[it.id] ?? it.qty) || 0 }))
        .filter((it) => it.q > 0);
      if (effective.length === 0) throw new Error("Adjusted order has no quantity");
      for (const it of effective) {
        const available = availableFor(it.product_id);
        if (it.q > available) {
          throw new Error(`Only ${available} pcs available for ${(it.products as { name: string } | null)?.name ?? "item"}`);
        }
      }

      await save.mutateAsync();

      const { taxable, cgst, sgst, net } = gstBreakup(newTotal);
      const { error: invErr } = await supabase
        .from("invoices")
        .insert({ order_id: orderId, taxable_value: taxable, cgst, sgst, net_amount: net });
      if (invErr) throw invErr;

      for (const it of effective) {
        const csaRow = (data?.stock ?? []).find((s) => s.product_id === it.product_id);
        if (csaRow) {
          await supabase
            .from("csa_stock")
            .update({ physical_qty: Math.max(0, csaRow.physical_qty - it.q), updated_at: new Date().toISOString() })
            .eq("id", csaRow.id);
        }
        const { data: distRow } = await supabase
          .from("distributor_stock")
          .select("*")
          .eq("distributor_id", order.distributor_id!)
          .eq("product_id", it.product_id)
          .maybeSingle();
        if (distRow) {
          await supabase
            .from("distributor_stock")
            .update({
              physical_qty: distRow.physical_qty + it.q,
              reserved_qty: distRow.reserved_qty + it.q,
              updated_at: new Date().toISOString(),
            })
            .eq("id", distRow.id);
        } else {
          await supabase.from("distributor_stock").insert({
            distributor_id: order.distributor_id!,
            product_id: it.product_id,
            physical_qty: it.q,
            reserved_qty: it.q,
          });
        }
      }

      const { error } = await supabase.from("orders").update({ status: "dispatched" }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["csa-panel"] });
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
      toast.success(
        vars.accept
          ? "Order approved and invoiced. Stock sent to distributor as reserved — add LR details in Delivery tab."
          : "Order rejected",
      );
      navigate({ to: "/csa" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !order) {
    return (
      <Shell title="Primary Order" subtitle="Loading…">
        <p className="p-6 text-sm text-muted-foreground">Loading order…</p>
      </Shell>
    );
  }

  const distributor = order.distributors as { name?: string; city?: string; gstin?: string } | null;
  const editable = order.status === "pending";

  return (
    <Shell title={`Order ${order.order_no}`} subtitle={`${distributor?.name ?? "Distributor"} • primary purchase`}>
      <div className="mb-3 flex items-center justify-between">
        <Button asChild size="sm" variant="outline">
          <Link to="/csa">
            <ArrowLeft className="mr-1 size-3.5" /> Back to panel
          </Link>
        </Button>
        <Badge variant={order.status === "pending" ? "default" : "secondary"}>{order.status}</Badge>
      </div>

      <Section title="Party details">
        <div className="grid gap-3 p-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Distributor</p>
            <p className="font-medium">{distributor?.name ?? "—"}</p>
            <p className="text-[11px] text-muted-foreground">
              {distributor?.city ?? ""} {distributor?.gstin ? `• GSTIN ${distributor.gstin}` : ""}
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
            const available = availableFor(it.product_id);
            const q = Number(qty[it.id] ?? it.qty) || 0;
            const short = q > available;
            return (
              <div key={it.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{(it.products as { name: string } | null)?.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Asked {it.qty} pcs • Rate {exactInr(it.rate)} •{" "}
                      <span className={short ? "text-warning" : "text-success"}>Stock {available}</span>
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
              <Label htmlFor="po-notes">Remark (optional)</Label>
              <Input
                id="po-notes"
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
                disabled={act.isPending || anyShort || newTotal <= 0}
                onClick={() => act.mutate({ accept: true })}
              >
                <CheckCircle2 className="mr-1 size-3.5" /> Approve • Invoice • Dispatch
              </Button>
              <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ accept: false })}>
                <XCircle className="mr-1 size-3.5" /> Reject
              </Button>
            </div>
            {anyShort ? (
              <p className="text-[11px] font-medium text-warning">
                Reduce the stock-short quantities before approving.
              </p>
            ) : null}
          </div>
        </Section>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">This order is {order.status} and can no longer be edited.</p>
      )}
    </Shell>
  );
}
