import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { gstBreakup, inr, exactInr } from "@/lib/sfa";
import { useMe } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/godown-sale")({
  head: () => ({
    meta: [
      { title: "Godown Billing — POPPiK SFA" },
      { name: "description", content: "Bill a manual counter / godown sale and generate a GST invoice instantly." },
      { property: "og:title", content: "Godown Billing — POPPiK SFA" },
      { property: "og:description", content: "Manual godown billing with live stock check and instant invoice." },
    ],
  }),
  component: GodownSalePage,
});

type StockRow = { id: string; product_id: string; owner_id: string; physical_qty: number; reserved_qty: number };

function GodownSalePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const { data: me } = useMe();
  const isCsa = me?.role === "csa";
  const isDepot = me?.role === "depot";
  const profile = me?.profile as { distributor_id?: string | null; csa_id?: string | null; depot_id?: string | null } | null | undefined;
  const myDistributorId = profile?.distributor_id ?? null;
  const myCsaId = profile?.csa_id ?? null;
  const myDepotId = profile?.depot_id ?? null;
  const ownerId = isDepot ? myDepotId : isCsa ? myCsaId : myDistributorId;
  const level = isDepot ? "depot" : isCsa ? "csa" : "distributor";

  const [partyId, setPartyId] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState<"amount" | "percentage">("amount");

  const { data } = useQuery({
    queryKey: ["godown-sale-master", level, ownerId],
    queryFn: async () => {
      if (isDepot) {
        const [products, csas, stock] = await Promise.all([
          supabase.from("products").select("id, name, sku, pts").order("name"),
          supabase.from("csas").select("id, name, city, depot_id").order("name"),
          supabase.from("depot_stock").select("id, product_id, depot_id, physical_qty, reserved_qty"),
        ]);
        return {
          products: (products.data ?? []).map((p) => ({ id: p.id, name: p.name, sku: p.sku, rate: Number(p.pts) })),
          parties: (csas.data ?? []).map((r) => ({ id: r.id, name: r.name, city: r.city, owner: r.depot_id })),
          stock: (stock.data ?? []).map((s) => ({
            id: s.id,
            product_id: s.product_id,
            owner_id: s.depot_id,
            physical_qty: s.physical_qty,
            reserved_qty: s.reserved_qty,
          })) as StockRow[],
        };
      }
      if (isCsa) {
        const [products, distributors, stock] = await Promise.all([
          supabase.from("products").select("id, name, sku, pts").order("name"),
          supabase.from("distributors").select("id, name, city, csa_id").order("name"),
          supabase.from("csa_stock").select("id, product_id, csa_id, physical_qty, reserved_qty"),
        ]);
        return {
          products: (products.data ?? []).map((p) => ({ id: p.id, name: p.name, sku: p.sku, rate: Number(p.pts) })),
          parties: (distributors.data ?? []).map((r) => ({ id: r.id, name: r.name, city: r.city, owner: r.csa_id })),
          stock: (stock.data ?? []).map((s) => ({
            id: s.id,
            product_id: s.product_id,
            owner_id: s.csa_id,
            physical_qty: s.physical_qty,
            reserved_qty: s.reserved_qty,
          })) as StockRow[],
        };
      }
      const [products, retailers, stock] = await Promise.all([
        supabase.from("products").select("id, name, sku, ptr").order("name"),
        supabase.from("retailers").select("id, name, city, distributor_id").order("name"),
        supabase.from("distributor_stock").select("id, product_id, distributor_id, physical_qty, reserved_qty"),
      ]);
      return {
        products: (products.data ?? []).map((p) => ({ id: p.id, name: p.name, sku: p.sku, rate: Number(p.ptr) })),
        parties: (retailers.data ?? []).map((r) => ({ id: r.id, name: r.name, city: r.city, owner: r.distributor_id })),
        stock: (stock.data ?? []).map((s) => ({
          id: s.id,
          product_id: s.product_id,
          owner_id: s.distributor_id,
          physical_qty: s.physical_qty,
          reserved_qty: s.reserved_qty,
        })) as StockRow[],
      };
    },
  });

  const stock = data?.stock ?? [];

  const availableOf = (productId: string) => {
    const row = stock.find((s) => s.product_id === productId && (!ownerId || s.owner_id === ownerId));
    return row ? row.physical_qty - row.reserved_qty : 0;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.products ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [data?.products, search]);

  // Only clients mapped to the logged-in seller are billable.
  const partyOptions = (data?.parties ?? []).filter((r) => !!ownerId && r.owner === ownerId);
  const partyLabel = isDepot ? "CSA" : isCsa ? "Distributor" : "Party / retailer";


  const lines = (data?.products ?? [])
    .map((p) => ({ p, q: Number(qty[p.id] ?? 0) || 0 }))
    .filter((l) => l.q > 0)
    .map((l) => ({ productId: l.p.id, name: l.p.name, qty: l.q, rate: l.p.rate, amount: l.q * l.p.rate }));
  const grossTotal = lines.reduce((s, l) => s + l.amount, 0);
  const discountVal = Number(discount) || 0;
  const actualDiscount = discountType === "percentage" ? (grossTotal * discountVal) / 100 : discountVal;
  const total = Math.max(0, grossTotal - actualDiscount);
  const shortages = lines.filter((l) => l.qty > availableOf(l.productId));

  const save = useMutation({
    mutationFn: async () => {
      if (!ownerId)
        throw new Error(
          isDepot ? "No depot mapped to your account" : isCsa ? "No CSA mapped to your account" : "No distributor mapped to your account",
        );
      if (!partyId) throw new Error(`Select a ${partyLabel.toLowerCase()}`);
      if (lines.length === 0) throw new Error("Enter quantity for at least one product");
      if (shortages.length > 0) throw new Error(`Stock short for ${shortages[0]!.name}`);

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          kind: isDepot ? "depot" : isCsa ? "primary" : "secondary",
          status: "invoiced",
          ...(isDepot
            ? { depot_id: ownerId, csa_id: partyId }
            : isCsa
              ? { csa_id: ownerId, distributor_id: partyId }
              : { distributor_id: ownerId, retailer_id: partyId }),
          total_amount: total,
          discount_amount: actualDiscount,
          notes: notes.trim() ? `Godown sale — ${notes.trim()}` : "Godown sale (manual)",
        })
        .select("id, order_no")
        .single();
      if (error) throw error;

      const { error: itemErr } = await supabase.from("order_items").insert(
        lines.map((l) => ({ order_id: order.id, product_id: l.productId, qty: l.qty, rate: l.rate, amount: l.amount })),
      );
      if (itemErr) throw itemErr;

      const { taxable, cgst, sgst, net } = gstBreakup(total);
      const { error: invErr } = await supabase
        .from("invoices")
        .insert({ order_id: order.id, taxable_value: taxable, cgst, sgst, net_amount: net });
      if (invErr) throw invErr;

      for (const l of lines) {
        const row = stock.find((s) => s.product_id === l.productId && s.owner_id === ownerId);
        if (!row) continue;
        await supabase
          .from(isDepot ? "depot_stock" : isCsa ? "csa_stock" : "distributor_stock")
          .update({ physical_qty: Math.max(0, row.physical_qty - l.qty), updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
      return order.order_no;
    },
    onSuccess: (orderNo) => {
      toast.success(`Godown sale billed (${orderNo}) — invoice created`);
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
      qc.invalidateQueries({ queryKey: ["csa-panel"] });
      qc.invalidateQueries({ queryKey: ["depot-panel"] });
      navigate({ to: isDepot ? "/depot" : isCsa ? "/csa" : "/distributor" });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <Shell title="Godown Billing" subtitle="Manual counter billing • instant GST invoice">
      <Section title="Party & Remark">
        <div className="grid gap-3 p-4">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>{partyLabel}</Label>
              <NewPartyDialog
                level={level}
                ownerId={ownerId}
                label={partyLabel}
                onCreated={async (id) => {
                  await qc.invalidateQueries({ queryKey: ["godown-sale-master"] });
                  setPartyId(id);
                }}
              />
            </div>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose party" />
              </SelectTrigger>
              <SelectContent>
                {partyOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.city ? ` — ${r.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Remark (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. counter sale, cash bill" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Cash Discount</Label>
              <div className="flex bg-muted/60 rounded overflow-hidden border border-border/40">
                <button type="button" className={`px-2.5 py-0.5 text-[11px] font-medium transition-colors ${discountType === 'amount' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`} onClick={() => setDiscountType("amount")}>₹</button>
                <button type="button" className={`px-2.5 py-0.5 text-[11px] font-medium transition-colors ${discountType === 'percentage' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`} onClick={() => setDiscountType("percentage")}>%</button>
              </div>
            </div>
            <Input inputMode="decimal" placeholder={discountType === "percentage" ? "e.g. 5" : "e.g. 250"} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
        </div>
      </Section>

      <div className="mt-4">
        <Section title="Products">
          <div className="border-b border-border/60 p-3">
            <Input placeholder="Search product or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="divide-y divide-border/60">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No products found.</p>
            ) : (
              filtered.map((p) => {
                const available = availableOf(p.id);
                const q = Number(qty[p.id] ?? 0) || 0;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.sku} • {exactInr(p.rate)} • Available {available}
                      </p>
                      {q > available ? (
                        <p className="text-[11px] font-medium text-warning">Stock short — only {available} available</p>
                      ) : null}
                    </div>
                    <Input
                      className="w-20 shrink-0 text-right"
                      inputMode="numeric"
                      value={qty[p.id] ?? ""}
                      placeholder="0"
                      onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                  </div>
                );
              })
            )}
          </div>
        </Section>
      </div>

      <div className="sticky bottom-3 mt-4 rounded-xl border border-border/60 bg-card p-3 shadow-lg">
        {actualDiscount > 0 ? (
          <div className="mb-2 flex justify-between text-[11px] text-muted-foreground border-b border-border/40 pb-1.5">
            <span>Gross: {inr(grossTotal)}</span>
            <span>- {inr(actualDiscount)} CD</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between text-sm">
          <span>
            {lines.length} SKU • Net with GST {inr(gstBreakup(total).net)}
          </span>
          <span className="font-semibold">{inr(total)}</span>
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={() => router.history.back()}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Billing…" : "Bill & generate invoice"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function NewPartyDialog({
  level,
  ownerId,
  label,
  onCreated,
}: {
  level: "depot" | "csa" | "distributor";
  ownerId: string | null;
  label: string;
  onCreated: (id: string) => void | Promise<void>;
}) {
  const { userId } = useMe();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    gstin: "",
    email: "",
    address: "",
    city: "",
    state: "",
    margin_pct: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: async () => {
      if (!ownerId) throw new Error("No organisation mapped to your account");
      if (!form.name.trim()) throw new Error("Party name is required");
      const base = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        gstin: form.gstin.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
      };
      if (level === "depot") {
        const newId = crypto.randomUUID();
        const { error } = await supabase
          .from("csas")
          .insert({ id: newId, ...base, depot_id: ownerId });
        if (error) throw error;
        return newId;
      }
      if (level === "csa") {
        const newId = crypto.randomUUID();
        const { error } = await supabase
          .from("distributors")
          .insert({ id: newId, ...base, csa_id: ownerId });
        if (error) throw error;
        return newId;
      }
      const newId = crypto.randomUUID();
      const { error } = await supabase
        .from("retailers")
        .insert({ id: newId, ...base, margin_pct: Number(form.margin_pct) || 0, distributor_id: ownerId, retailer_type: "no_ba", created_by: userId ?? null });
      if (error) throw error;
      return newId;
    },
    onSuccess: async (id) => {
      toast.success("Party created");
      setOpen(false);
      setForm({ name: "", phone: "", gstin: "", email: "", address: "", city: "", state: "", margin_pct: "" });
      await onCreated(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
          <Plus className="h-3.5 w-3.5" /> New party
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create {label.toLowerCase()}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Party name *</Label>
            <Input value={form.name} onChange={set("name")} placeholder="Business / shop name" />
          </div>
          <div className="grid gap-1.5">
            <Label>Mobile no</Label>
            <Input value={form.phone} onChange={set("phone")} inputMode="tel" />
          </div>
          <div className="grid gap-1.5">
            <Label>GST no</Label>
            <Input value={form.gstin} onChange={set("gstin")} />
          </div>
          <div className="grid gap-1.5">
            <Label>Email id</Label>
            <Input type="email" value={form.email} onChange={set("email")} />
          </div>
          <div className="grid gap-1.5">
            <Label>Full address</Label>
            <Input value={form.address} onChange={set("address")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={set("city")} />
            </div>
            <div className="grid gap-1.5">
              <Label>State</Label>
              <Input value={form.state} onChange={set("state")} />
            </div>
          </div>
          {level === "distributor" ? (
            <div className="grid gap-1.5">
              <Label>Retail Margin % (optional)</Label>
              <Input inputMode="decimal" placeholder="e.g. 20" value={form.margin_pct} onChange={set("margin_pct")} />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={create.isPending || !form.name.trim()} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Save party"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
