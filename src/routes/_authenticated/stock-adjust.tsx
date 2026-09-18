import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/stock-adjust")({
  head: () => ({
    meta: [
      { title: "Stock Adjustment Request — POPPiK SFA" },
      { name: "description", content: "Raise a stock adjustment with a mandatory remark and send it for admin approval." },
      { property: "og:title", content: "Stock Adjustment Request — POPPiK SFA" },
      { property: "og:description", content: "Correct physical stock with remark-backed requests approved by the admin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockAdjustPage,
});

type Row = {
  id: string;
  product_id: string;
  qty: number;
  batch_no: string | null;
  label: string;
  sub: string;
};

function StockAdjustPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const role = me?.role;
  const scope: "distributor" | "csa" | "ba" = role === "csa" ? "csa" : role === "ba" ? "ba" : "distributor";

  const [search, setSearch] = useState("");
  const [stockId, setStockId] = useState("");
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("");

  const { data: rows } = useQuery({
    queryKey: ["adjust-stock-rows", scope, me?.profile?.id, me?.profile?.csa_id, me?.profile?.distributor_id],
    enabled: !!me,
    queryFn: async (): Promise<Row[]> => {
      if (scope === "csa") {
        const myCsaId = (me?.profile?.csa_id as string | null) ?? null;
        const csaQuery = supabase.from("csa_stock").select("*, products(name, sku)");
        const { data } = myCsaId ? await csaQuery.eq("csa_id", myCsaId) : await csaQuery;
        return (data ?? []).map((s) => ({
          id: s.id,
          product_id: s.product_id,
          qty: s.physical_qty,
          batch_no: null,
          label: (s.products as { name: string } | null)?.name ?? "Product",
          sub: `Physical ${s.physical_qty} • Reserved ${s.reserved_qty}`,
        }));
      }
      if (scope === "ba") {
        const { data } = await supabase.from("ba_stock").select("*, products(name, sku)");
        return (data ?? []).map((s) => ({
          id: s.id,
          product_id: s.product_id,
          qty: s.qty,
          batch_no: null,
          label: (s.products as { name: string } | null)?.name ?? "Product",
          sub: `Counter stock ${s.qty}`,
        }));
      }
      const myDistributorId = (me?.profile?.distributor_id as string | null) ?? null;
      const distQuery = supabase.from("distributor_stock").select("*, products(name, sku)");
      const { data } = myDistributorId ? await distQuery.eq("distributor_id", myDistributorId) : await distQuery;
      return (data ?? []).map((s) => ({
        id: s.id,
        product_id: s.product_id,
        qty: s.physical_qty,
        batch_no: s.batch_no,
        label: (s.products as { name: string } | null)?.name ?? "Product",
        sub: `Batch ${s.batch_no ?? "-"} • Physical ${s.physical_qty} • Reserved ${s.reserved_qty}`,
      }));
    },
  });

  const { data: myRequests } = useQuery({
    queryKey: ["my-stock-adjustments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_adjustments")
        .select("*, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows ?? [];
    return q ? list.filter((r) => r.label.toLowerCase().includes(q)) : list;
  }, [rows, search]);

  const selected = (rows ?? []).find((r) => r.id === stockId) ?? null;
  const delta = selected && newQty !== "" ? Number(newQty) - selected.qty : 0;

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Please select a stock line");
      if (newQty === "" || Number.isNaN(Number(newQty)) || Number(newQty) < 0)
        throw new Error("Please enter a valid new quantity");
      if (Number(newQty) === selected.qty) throw new Error("New quantity is same as current quantity");
      if (reason.trim().length < 5) throw new Error("Remark is mandatory (minimum 5 characters)");

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Please sign in again");

      const { error } = await supabase.from("stock_adjustments").insert({
        scope,
        stock_id: selected.id,
        product_id: selected.product_id,
        distributor_id: scope === "distributor" ? (me?.profile?.distributor_id ?? null) : null,
        csa_id: scope === "csa" ? (me?.profile?.csa_id ?? null) : null,
        ba_id: scope === "ba" ? uid : null,
        batch_no: selected.batch_no,
        current_qty: selected.qty,
        new_qty: Number(newQty),
        delta: Number(newQty) - selected.qty,
        reason: reason.trim(),
        requested_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Adjustment request sent for admin approval");
      setStockId("");
      setNewQty("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["my-stock-adjustments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell title="Stock Adjustment" subtitle="Stock change needs a remark and admin approval before it is applied.">
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="1. Select stock line">
          <div className="p-3">
            <Input placeholder="Search product…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-80 divide-y divide-border/60 overflow-auto">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No stock lines found.</p>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setStockId(r.id);
                    setNewQty(String(r.qty));
                  }}
                  className={`flex w-full items-center justify-between p-3 text-left text-sm ${
                    stockId === r.id ? "bg-accent" : "hover:bg-muted/50"
                  }`}
                >
                  <div>
                    <p className="font-medium">{r.label}</p>
                    <p className="text-[11px] text-muted-foreground">{r.sub}</p>
                  </div>
                  <span className="tabular-nums font-semibold">{r.qty}</span>
                </button>
              ))
            )}
          </div>
        </Section>

        <Section title="2. Adjustment details">
          <div className="space-y-4 p-4">
            <div>
              <Label>Current quantity</Label>
              <Input value={selected ? String(selected.qty) : ""} readOnly placeholder="Select a stock line" />
            </div>
            <div>
              <Label htmlFor="newqty">New physical quantity</Label>
              <Input
                id="newqty"
                type="number"
                min={0}
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                disabled={!selected}
              />
            </div>
            {selected && newQty !== "" ? (
              <p className={`text-sm font-medium ${delta < 0 ? "text-destructive" : "text-success"}`}>
                Difference: {delta > 0 ? "+" : ""}
                {delta}
              </p>
            ) : null}
            <div>
              <Label htmlFor="reason">Remark (mandatory)</Label>
              <Textarea
                id="reason"
                rows={3}
                placeholder="e.g. Damage in transit / physical count mismatch / expiry write-off"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending ? "Sending…" : "Send for approval"}
              </Button>
              <Button variant="outline" onClick={() => navigate({ to: "/home" })}>
                Cancel
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Stock will change only after the admin approves this request.
            </p>
          </div>
        </Section>
      </div>

      <Section title="My adjustment requests">
        <div className="divide-y divide-border/60">
          {(myRequests ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            (myRequests ?? []).map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-medium">{(r.products as { name: string } | null)?.name ?? "Product"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.current_qty} → {r.new_qty} ({r.delta > 0 ? "+" : ""}
                    {r.delta}) • {new Date(r.created_at).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Remark: {r.reason}</p>
                  {r.review_note ? (
                    <p className="text-[11px] text-muted-foreground">Admin note: {r.review_note}</p>
                  ) : null}
                </div>
                <Badge
                  variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}
                >
                  {r.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      </Section>
    </Shell>
  );
}
