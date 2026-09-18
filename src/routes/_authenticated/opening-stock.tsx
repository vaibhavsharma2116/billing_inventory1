import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, PackagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useMe } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/opening-stock")({
  head: () => ({
    meta: [
      { title: "Opening Stock Entry — POPPiK SFA" },
      { name: "description", content: "Set product-wise opening stock balances for CSA, distributor, retail counter and beauty advisor inventory." },
      { property: "og:title", content: "Opening Stock Entry — POPPiK SFA" },
      { property: "og:description", content: "One screen to record opening stock balances for every inventory location." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OpeningStockPage,
});

type Scope = "depot" | "csa" | "distributor" | "ba";

function OpeningStockPage() {
  const qc = useQueryClient();
  const { data: me, userId } = useMe();
  const role = me?.role;
  const profile = me?.profile as { csa_id?: string | null; distributor_id?: string | null; retailer_id?: string | null; depot_id?: string | null } | null | undefined;

  const scope: Scope =
    role === "depot" ? "depot" : role === "csa" ? "csa" : role === "distributor" ? "distributor" : "ba";
  const scopeLabel =
    scope === "depot"
      ? "Master depot warehouse"
      : scope === "csa"
        ? "CSA warehouse"
        : scope === "distributor"
          ? "Distributor godown"
          : profile?.retailer_id
            ? "Retail counter"
            : "BA counter";

  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<Record<string, string>>({});

  const { data: products } = useQuery({
    queryKey: ["opening-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, sku, pts").order("name");
      return data ?? [];
    },
  });

  const { data: current } = useQuery({
    queryKey: ["opening-current", scope, userId, profile?.csa_id, profile?.distributor_id, profile?.depot_id],
    enabled: !!me,
    queryFn: async (): Promise<Record<string, { id: string; qty: number; batch: string | null }>> => {
      const map: Record<string, { id: string; qty: number; batch: string | null }> = {};
      if (scope === "depot") {
        const q = supabase.from("depot_stock").select("id, product_id, physical_qty");
        const { data } = profile?.depot_id ? await q.eq("depot_id", profile.depot_id) : await q;
        (data ?? []).forEach((r) => (map[r.product_id] = { id: r.id, qty: r.physical_qty, batch: null }));
      } else if (scope === "csa") {
        const q = supabase.from("csa_stock").select("id, product_id, physical_qty");
        const { data } = profile?.csa_id ? await q.eq("csa_id", profile.csa_id) : await q;
        (data ?? []).forEach((r) => (map[r.product_id] = { id: r.id, qty: r.physical_qty, batch: null }));
      } else if (scope === "distributor") {
        const q = supabase.from("distributor_stock").select("id, product_id, physical_qty, batch_no");
        const { data } = profile?.distributor_id ? await q.eq("distributor_id", profile.distributor_id) : await q;
        (data ?? []).forEach((r) => (map[r.product_id] = { id: r.id, qty: r.physical_qty, batch: r.batch_no }));
      } else {
        const { data } = await supabase.from("ba_stock").select("id, product_id, qty").eq("ba_id", userId!);
        (data ?? []).forEach((r) => (map[r.product_id] = { id: r.id, qty: r.qty, batch: null }));
      }
      return map;
    },
  });

  const applyOpening = async (productId: string, value: number, batchInput?: string | null) => {
    {
      if (!Number.isFinite(value) || value < 0) throw new Error("Enter a valid opening quantity");
      const existing = current?.[productId];

      if (scope === "depot") {
        if (!profile?.depot_id) throw new Error("Your login is not mapped to a master depot");
        if (existing) {
          const { error } = await supabase.from("depot_stock").update({ physical_qty: value }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("depot_stock")
            .insert({ depot_id: profile.depot_id, product_id: productId, physical_qty: value, reserved_qty: 0 });
          if (error) throw error;
        }
      } else if (scope === "csa") {
        if (!profile?.csa_id) throw new Error("Your login is not mapped to a CSA");
        if (existing) {
          const { error } = await supabase.from("csa_stock").update({ physical_qty: value }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("csa_stock")
            .insert({ csa_id: profile.csa_id, product_id: productId, physical_qty: value, reserved_qty: 0 });
          if (error) throw error;
        }
      } else if (scope === "distributor") {
        if (!profile?.distributor_id) throw new Error("Your login is not mapped to a distributor");
        const batchNo = (batchInput ?? batch[productId])?.trim() || null;
        if (existing) {
          const { error } = await supabase
            .from("distributor_stock")
            .update({ physical_qty: value, batch_no: batchNo })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("distributor_stock").insert({
            distributor_id: profile.distributor_id,
            product_id: productId,
            physical_qty: value,
            reserved_qty: 0,
            batch_no: batchNo,
          });
          if (error) throw error;
        }
      } else {
        if (existing) {
          const { error } = await supabase.from("ba_stock").update({ qty: value }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("ba_stock")
            .insert({ ba_id: userId!, retailer_id: profile?.retailer_id ?? null, product_id: productId, qty: value });
          if (error) throw error;
        }
        const delta = value - (existing?.qty ?? 0);
        await supabase.from("ba_stock_moves").insert({
          ba_id: userId!,
          retailer_id: profile?.retailer_id ?? null,
          product_id: productId,
          kind: "opening",
          qty: delta,
          notes: "Opening stock entry",
        });
      }
    }
  };

  const refreshPanels = () => {
    qc.invalidateQueries({ queryKey: ["opening-current"] });
    qc.invalidateQueries({ queryKey: ["ba-panel"] });
    qc.invalidateQueries({ queryKey: ["csa-panel"] });
    qc.invalidateQueries({ queryKey: ["distributor-panel"] });
    qc.invalidateQueries({ queryKey: ["depot-panel"] });
  };

  const save = useMutation({
    mutationFn: async ({ productId }: { productId: string }) => {
      await applyOpening(productId, Number(qty[productId]));
    },
    onSuccess: () => {
      toast.success("Opening stock saved");
      refreshPanels();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  const bulkUpload = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) throw new Error("CSV file is empty");

      const split = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const header = split(lines[0] ?? "").map((h) => h.toLowerCase());
      const hasHeader = header.some((h) => ["sku", "product_sku", "code"].includes(h));
      const idx = {
        sku: hasHeader ? header.findIndex((h) => ["sku", "product_sku", "code"].includes(h)) : 0,
        qty: hasHeader ? header.findIndex((h) => ["qty", "quantity", "opening_qty", "opening"].includes(h)) : 1,
        batch: hasHeader ? header.findIndex((h) => ["batch", "batch_no"].includes(h)) : 2,
      };
      if (hasHeader && idx.qty < 0) throw new Error("CSV must have a 'qty' column");

      const bySku = new Map((products ?? []).map((p) => [p.sku.trim().toLowerCase(), p]));
      const byName = new Map((products ?? []).map((p) => [p.name.trim().toLowerCase(), p]));

      const rows = hasHeader ? lines.slice(1) : lines;
      const errors: string[] = [];
      let ok = 0;

      for (let i = 0; i < rows.length; i++) {
        const cells = split(rows[i] ?? "");
        const rowNo = i + (hasHeader ? 2 : 1);
        const key = (cells[idx.sku] ?? "").toLowerCase();
        const product = bySku.get(key) ?? byName.get(key);
        if (!product) {
          errors.push(`Row ${rowNo}: product "${cells[idx.sku] ?? ""}" not found`);
          continue;
        }
        const value = Number(cells[idx.qty]);
        if (!Number.isFinite(value) || value < 0) {
          errors.push(`Row ${rowNo}: invalid quantity "${cells[idx.qty] ?? ""}"`);
          continue;
        }
        try {
          await applyOpening(product.id, value, idx.batch >= 0 ? cells[idx.batch] ?? null : null);
          ok++;
        } catch (err) {
          errors.push(`Row ${rowNo}: ${(err as Error).message}`);
        }
      }
      return { ok, errors };
    },
    onSuccess: ({ ok, errors }) => {
      setCsvErrors(errors);
      if (ok > 0) toast.success(`${ok} opening stock rows uploaded`);
      if (errors.length) toast.error(`${errors.length} rows skipped`);
      refreshPanels();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadTemplate = () => {
    const sample = (products ?? []).slice(0, 5);
    const rows = [
      "sku,qty,batch",
      ...sample.map((p) => `${p.sku},0,`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([rows], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "opening-stock-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? []).filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
  }, [products, search]);

  return (
    <Shell title="Opening Stock" subtitle={`Set starting balances — ${scopeLabel}`} mobile={scope === "ba"}>
      <Section title="Bulk upload (CSV)">
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            Upload a CSV with columns <code>sku, qty, batch</code> to set opening stock for many products at once.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={downloadTemplate}>
              <Download className="size-4" /> Download template
            </Button>
            <Input
              type="file"
              accept=".csv,text/csv"
              className="max-w-64"
              disabled={bulkUpload.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) {
                  setCsvErrors([]);
                  bulkUpload.mutate(file);
                }
              }}
            />
            {bulkUpload.isPending ? <span className="text-sm text-muted-foreground">Uploading…</span> : null}
          </div>
          {csvErrors.length > 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {csvErrors.slice(0, 10).map((err) => (
                <p key={err}>{err}</p>
              ))}
              {csvErrors.length > 10 ? <p>+{csvErrors.length - 10} more…</p> : null}
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Products">
        <div className="p-4">
          <Label htmlFor="search">Search product</Label>
          <Input id="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or SKU" className="mt-1" />
        </div>
        <div className="divide-y divide-border/60">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No products found.</p>
          ) : (
            filtered.map((p) => {
              const existing = current?.[p.id];
              return (
                <div key={p.id} className="flex flex-wrap items-end gap-3 p-4">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.sku} • <Badge variant="secondary">Current {existing?.qty ?? 0}</Badge>
                    </p>
                  </div>
                  {scope === "distributor" ? (
                    <div className="w-32">
                      <Label className="text-xs">Batch</Label>
                      <Input
                        value={batch[p.id] ?? existing?.batch ?? ""}
                        onChange={(e) => setBatch((b) => ({ ...b, [p.id]: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                  ) : null}
                  <div className="w-28">
                    <Label className="text-xs">Opening qty</Label>
                    <Input
                      type="number"
                      min={0}
                      value={qty[p.id] ?? ""}
                      onChange={(e) => setQty((q) => ({ ...q, [p.id]: e.target.value }))}
                      placeholder={String(existing?.qty ?? 0)}
                    />
                  </div>
                  <Button size="sm" onClick={() => save.mutate({ productId: p.id })} disabled={save.isPending}>
                    <PackagePlus className="size-4" /> Save
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Section>
      <p className="mt-4 text-xs text-muted-foreground">
        Opening stock overwrites the current balance for the selected product. Use Stock Adjustment (with approval) for later corrections.
      </p>
    </Shell>
  );
}
