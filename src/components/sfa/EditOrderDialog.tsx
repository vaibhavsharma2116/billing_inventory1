import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inr } from "@/lib/sfa";

export type EditableOrder = {
  id: string;
  order_no: string;
  status: string;
  total_amount: number;
  order_items: {
    id: string;
    qty: number;
    free_qty: number;
    rate: number;
    amount: number;
    product_id: string;
    products: { name: string; sku?: string | null } | null;
  }[];
};

type StockRow = { product_id: string; physical_qty: number; reserved_qty: number };

export function EditOrderDialog({
  order,
  stock,
  onOpenChange,
}: {
  order: EditableOrder | null;
  stock: StockRow[];
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!order) return;
    const next: Record<string, string> = {};
    for (const it of order.order_items ?? []) next[it.id] = String(it.qty);
    setQty(next);
    setNotes("");
  }, [order]);

  const items = order?.order_items ?? [];
  const newTotal = items.reduce((s, it) => s + Number(it.rate) * (Number(qty[it.id] ?? it.qty) || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!order) return;
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
        .eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit order {order?.order_no}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {items.map((it) => {
            const s = stock.find((r) => r.product_id === it.product_id);
            const available = s ? s.physical_qty - s.reserved_qty : 0;
            const q = Number(qty[it.id] ?? it.qty) || 0;
            const short = q > available;
            return (
              <div key={it.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.products?.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Rate {inr(it.rate)} • Available {available}
                      {it.free_qty ? ` • ${it.free_qty} free` : ""}
                    </p>
                  </div>
                  <Input
                    className="w-20 shrink-0 text-right"
                    inputMode="numeric"
                    value={qty[it.id] ?? String(it.qty)}
                    onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))}
                  />
                </div>
                {short ? (
                  <p className="mt-1 text-[11px] font-medium text-warning">
                    Stock short — only {available} available. Reduce qty or set 0 to remove.
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="grid gap-1.5">
            <Label htmlFor="edit-notes">Remark (optional)</Label>
            <Input
              id="edit-notes"
              value={notes}
              placeholder="e.g. qty reduced due to stock shortage"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
            <span>Revised total</span>
            <span className="font-semibold">{inr(newTotal)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
