import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/sfa/Shell";
import { inr, exactInr } from "@/lib/sfa";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Form = {
  name: string;
  packing_size: string;
  hsn: string;
  gst_rate: string;
  sku: string;
  category: string;
  mrp: string;
  ptr: string;
  pts: string;
  csa_rate: string;
  opening_stock: string;
};

const empty: Form = {
  name: "",
  packing_size: "",
  hsn: "",
  gst_rate: "18",
  sku: "",
  category: "",
  mrp: "",
  ptr: "",
  pts: "",
  csa_rate: "",
  opening_stock: "",
};


type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  hsn: string | null;
  packing_size: string | null;
  mrp: number;
  ptr: number;
  pts: number;
  csa_rate: number;
  gst_rate: number;
};

export function ProductManager() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [search, setSearch] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["product-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, hsn, packing_size, mrp, ptr, pts, csa_rate, gst_rate")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const { data: stock = [] } = useQuery({
    queryKey: ["company-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_stock").select("id, product_id, physical_qty");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stockBy = useMemo(() => {
    const map: Record<string, { id: string; qty: number }> = {};
    stock.forEach((s) => (map[s.product_id] = { id: s.id, qty: s.physical_qty }));
    return map;
  }, [stock]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const startNew = () => {
    setEditId(null);
    setForm(empty);
    setOpen(true);
  };

  const startEdit = (p: ProductRow) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      packing_size: p.packing_size ?? "",
      hsn: p.hsn ?? "",
      gst_rate: String(p.gst_rate ?? ""),
      sku: p.sku,
      category: p.category ?? "",
      mrp: String(p.mrp ?? ""),
      ptr: String(p.ptr ?? ""),
      pts: String(p.pts ?? ""),
      csa_rate: String(p.csa_rate ?? ""),
      opening_stock: String(stockBy[p.id]?.qty ?? ""),
    });
    setOpen(true);
  };


  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Product name is required");
      if (!form.sku.trim()) throw new Error("SKU code is required");
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        category: form.category.trim() || null,
        hsn: form.hsn.trim() || null,
        packing_size: form.packing_size.trim() || null,
        gst_rate: Number(form.gst_rate) || 0,
        mrp: Number(form.mrp) || 0,
        ptr: Number(form.ptr) || 0,
        pts: Number(form.pts) || 0,
        csa_rate: Number(form.csa_rate) || 0,
      };
      let productId = editId;
      if (editId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        productId = data.id;
      }

      const openRaw = form.opening_stock.trim();
      if (openRaw !== "" && productId) {
        const openQty = Number(openRaw);
        if (!Number.isFinite(openQty) || openQty < 0) throw new Error("Enter a valid opening stock quantity");
        const existing = stockBy[productId];
        if (existing) {
          const { error } = await supabase.from("company_stock").update({ physical_qty: openQty }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("company_stock")
            .insert({ product_id: productId, physical_qty: openQty, reserved_qty: 0 });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Product updated across all channels" : "Product added to master");
      setOpen(false);
      setForm(empty);
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["product-master"] });
      qc.invalidateQueries({ queryKey: ["company-stock"] });
      qc.invalidateQueries({ queryKey: ["company-live-stock"] });
      qc.invalidateQueries({ queryKey: ["booking-master"] });
    },


    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.hsn ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  return (
    <Section
      title="Product Master"
      action={
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-40"
            placeholder="Search product / SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button size="sm" onClick={startNew}>
            + Add Product
          </Button>
        </div>
      }
    >
      <div className="divide-y divide-border/60">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading products…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No products yet. Add your first SKU.</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => startEdit(p)}
              className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {p.name}
                  {p.packing_size ? <span className="text-muted-foreground"> • {p.packing_size}</span> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {p.sku} • HSN {p.hsn ?? "—"} • GST {p.gst_rate}% • Company stock {stockBy[p.id]?.qty ?? 0}
                </p>

              </div>
              <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                <p className="text-sm font-semibold tabular-nums text-foreground">MRP {inr(p.mrp)}</p>
                <p className="tabular-nums">
                  Retail {exactInr(p.ptr)} • Dist {exactInr(p.pts)} • CSA {exactInr(p.csa_rate)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Product" : "New Product"}</DialogTitle>
            <DialogDescription>
              Saved products appear in every channel — CSA, distributor, salesman and BA.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-name">Product name *</Label>
              <Input id="p-name" value={form.name} onChange={set("name")} placeholder="Matte Lipstick" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="p-pack">Packing size</Label>
                <Input id="p-pack" value={form.packing_size} onChange={set("packing_size")} placeholder="12 pcs / box" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-sku">SKU code *</Label>
                <Input id="p-sku" value={form.sku} onChange={set("sku")} placeholder="PPK-LIP-001" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="p-hsn">HSN code</Label>
                <Input id="p-hsn" value={form.hsn} onChange={set("hsn")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-gst">GST %</Label>
                <Input id="p-gst" inputMode="decimal" value={form.gst_rate} onChange={set("gst_rate")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-cat">Category</Label>
                <Input id="p-cat" value={form.category} onChange={set("category")} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="p-mrp">MRP</Label>
                <Input id="p-mrp" inputMode="decimal" value={form.mrp} onChange={set("mrp")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-ptr">Retail rate</Label>
                <Input id="p-ptr" inputMode="decimal" value={form.ptr} onChange={set("ptr")} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="p-pts">Distributor rate</Label>
                <Input id="p-pts" inputMode="decimal" value={form.pts} onChange={set("pts")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-csa">CSA rate</Label>
                <Input id="p-csa" inputMode="decimal" value={form.csa_rate} onChange={set("csa_rate")} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-open">Company opening stock (qty)</Label>
              <Input id="p-open" inputMode="numeric" value={form.opening_stock} onChange={set("opening_stock")} placeholder="0" />
              <p className="text-[11px] text-muted-foreground">
                This is head-office stock. Master depots see it live and can punch purchase orders against it.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground">
              CSA and distributor rates are fixed here. Each retailer's own margin and display amount are set on the
              retailer, and the retail bill is calculated automatically from this retail rate.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editId ? "Update product" : "Save product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
