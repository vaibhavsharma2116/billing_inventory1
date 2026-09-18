import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { gstBreakup, inr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/bulk-review")({
  validateSearch: (s: Record<string, unknown>) => ({
    ids: Array.isArray(s["ids"]) ? (s["ids"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
  }),
  head: () => ({
    meta: [
      { title: "Bulk Invoice Review — POPPiK SFA" },
      { name: "description", content: "Review stock availability before bulk accepting and invoicing orders." },
      { property: "og:title", content: "Bulk Invoice Review — POPPiK SFA" },
      { property: "og:description", content: "Check stock-short issues before final approval of multiple orders." },
    ],
  }),
  component: BulkReviewPage,
});

type Item = { id: string; qty: number; free_qty: number; product_id: string; products: { name: string } | null };
type Order = {
  id: string;
  order_no: string;
  total_amount: number;
  distributor_id: string | null;
  retailers: { name: string } | null;
  order_items: Item[] | null;
};

function BulkReviewPage() {
  const { ids } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["bulk-review", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [orders, stock] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_no, total_amount, distributor_id, status, retailers(name), order_items(id, qty, free_qty, product_id, products(name))")
          .in("id", ids),
        supabase.from("distributor_stock").select("id, product_id, distributor_id, physical_qty, reserved_qty"),
      ]);
      return {
        orders: ((orders.data ?? []) as Order[]).filter((o) => (o as { status?: string }).status === "pending"),
        stock: stock.data ?? [],
      };
    },
  });

  const acceptOne = async (orderId: string) => {
    const order = (data?.orders ?? []).find((o) => o.id === orderId);
    if (!order) throw new Error("Order not found");

    const { taxable, cgst, sgst, net } = gstBreakup(Number(order.total_amount));
    const { error: invError } = await supabase.from("invoices").insert({
      order_id: orderId,
      taxable_value: taxable,
      cgst,
      sgst,
      net_amount: net,
    });
    if (invError) throw invError;

    for (const item of order.order_items ?? []) {
      const row = (data?.stock ?? []).find(
        (s) => s.product_id === item.product_id && s.distributor_id === order.distributor_id,
      );
      if (!row) continue;
      const shipped = item.qty + item.free_qty;
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
  };

  const bulk = useMutation({
    mutationFn: async (orderIds: string[]) => {
      let ok = 0;
      for (const id of orderIds) {
        await acceptOne(id);
        ok += 1;
      }
      return ok;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
      toast.success(`${count} order(s) invoiced`);
      navigate({ to: "/distributor" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shortagesFor = (order: Order) =>
    (order.order_items ?? [])
      .map((it) => {
        const row = (data?.stock ?? []).find(
          (s) => s.product_id === it.product_id && s.distributor_id === order.distributor_id,
        );
        const available = row ? row.physical_qty - row.reserved_qty : 0;
        const need = it.qty + it.free_qty;
        return { id: it.id, name: it.products?.name ?? "Item", need, available, short: need - available };
      })
      .filter((r) => r.short > 0);

  const review = (data?.orders ?? []).map((o) => ({
    id: o.id,
    order_no: o.order_no,
    party: o.retailers?.name ?? "—",
    amount: Number(o.total_amount),
    shortages: shortagesFor(o),
  }));
  const shortCount = review.filter((r) => r.shortages.length > 0).length;
  const reviewTotal = review.reduce((s, r) => s + r.amount, 0);

  return (
    <Shell title="Bulk Invoice Review" subtitle="Check stock before final approval">
      <Section title={`${review.length} order(s) selected`}>
        <div className="border-b border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
          Total {inr(reviewTotal)}
          {shortCount > 0 ? ` • ${shortCount} order(s) have stock-short items` : " • no stock issues"}
        </div>
        {ids.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No orders selected. Go back to the Distributor Panel and select pending orders first.
          </p>
        ) : isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading orders…</p>
        ) : (
          <div className="space-y-3 p-3">
            {review.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {r.order_no} • {r.party}
                  </p>
                  <span className="text-xs text-muted-foreground">{inr(r.amount)}</span>
                </div>
                {r.shortages.length === 0 ? (
                  <p className="mt-1 text-[11px] text-success">Stock available for all items.</p>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {r.shortages.map((s) => (
                      <p key={s.id} className="flex items-center gap-1 text-[11px] text-destructive">
                        <AlertTriangle className="size-3" />
                        {s.name} — need {s.need}, available {s.available} (short {s.short})
                      </p>
                    ))}
                    <Button asChild size="sm" variant="outline" className="mt-1">
                      <Link to="/order/$orderId" params={{ orderId: r.id }}>
                        Edit qty
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {review.length > 0 ? (
        <div className="sticky bottom-3 mt-4 flex flex-wrap gap-2 rounded-xl border border-border/60 bg-card p-3 shadow-lg">
          <Button variant="outline" onClick={() => router.history.back()}>
            Back
          </Button>
          {shortCount > 0 ? (
            <Button
              variant="outline"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate(review.filter((r) => r.shortages.length === 0).map((r) => r.id))}
            >
              Invoice only in-stock ({review.length - shortCount})
            </Button>
          ) : null}
          <Button className="flex-1" disabled={bulk.isPending} onClick={() => bulk.mutate(review.map((r) => r.id))}>
            {bulk.isPending ? "Processing…" : `Accept & invoice all (${review.length})`}
          </Button>
        </div>
      ) : null}
    </Shell>
  );
}
