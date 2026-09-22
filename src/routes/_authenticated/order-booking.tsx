import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, CalendarDays, Receipt, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { useMappedDistributors } from "@/hooks/useMappedDistributors";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddRetailerDialog } from "@/components/sfa/AddRetailerDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyQtyScheme, inr, valueScheme, type SchemeRow } from "@/lib/sfa";

type DetailKind = "outstanding" | "order_value";

export const Route = createFileRoute("/_authenticated/order-booking")({
  head: () => ({
    meta: [
      { title: "Book Order — POPPiK SFA" },
      { name: "description", content: "Book retailer orders against live distributor stock with automatic scheme and credit checks." },
      { property: "og:title", content: "Book Order — POPPiK SFA" },
      { property: "og:description", content: "Live stock, auto schemes, credit limit check and instant order to distributor." },
    ],
  }),
  component: OrderBooking,
});

function OrderBooking() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [retailerId, setRetailerId] = useState<string>("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const [filterDistributor, setFilterDistributor] = useState<string | null>(null);
  const [distSearch, setDistSearch] = useState("");
  const [retailerSearch, setRetailerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);

  const { data } = useQuery({
    queryKey: ["booking-master"],
    queryFn: async () => {
      const [retailers, products, schemes] = await Promise.all([
        supabase.from("retailers").select("*").order("name"),
        supabase.from("products").select("*").order("name"),
        supabase.from("schemes").select("*").eq("active", true),
      ]);
      return {
        retailers: retailers.data ?? [],
        products: products.data ?? [],
        schemes: (schemes.data ?? []) as SchemeRow[],
      };
    },
  });

  const PRODUCT_PAGE_SIZE = 10;
  const filteredProducts = useMemo(() => {
    const s = productSearch.trim().toLowerCase();
    return (data?.products ?? []).filter(
      (p) => !s || p.name.toLowerCase().includes(s) || (p.sku ?? "").toLowerCase().includes(s),
    );
  }, [data?.products, productSearch]);

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
  const paginatedProducts = filteredProducts.slice(
    (productPage - 1) * PRODUCT_PAGE_SIZE,
    productPage * PRODUCT_PAGE_SIZE,
  );

  const isBa = me?.role === "ba";
  const myOutletId = (me?.profile as { retailer_id?: string | null } | undefined)?.retailer_id ?? null;
  const { data: mappedDistributors = [] } = useMappedDistributors(!isBa);
  const mappedIds = new Set(mappedDistributors.map((d) => d.id));
  const visibleRetailers = (data?.retailers ?? []).filter((r) => {
    if (isBa) return r.id === myOutletId;
    if (filterDistributor) return r.distributor_id === filterDistributor;
    return !r.distributor_id || mappedIds.size === 0 || mappedIds.has(r.distributor_id);
  });


  useEffect(() => {
    if (isBa && myOutletId && retailerId !== myOutletId) setRetailerId(myOutletId);
  }, [isBa, myOutletId, retailerId]);

  const retailer = data?.retailers.find((r) => r.id === retailerId);
  const distributorId = retailer?.distributor_id ?? null;
  // Field executives / managers can preview live stock of the distributor they
  // picked in the filter, even before choosing a retailer.
  const stockDistributorId = distributorId ?? filterDistributor;
  const stockDistributorName =
    mappedDistributors.find((d) => d.id === stockDistributorId)?.name ?? null;

  const { data: stock } = useQuery({
    queryKey: ["dist-stock", stockDistributorId],
    enabled: !!stockDistributorId,
    queryFn: async () => {
      const { data } = await supabase
        .from("distributor_stock")
        .select("product_id, physical_qty, reserved_qty")
        .eq("distributor_id", stockDistributorId!);
      return data ?? [];
    },
  });

  const { data: ledger } = useQuery({
    queryKey: ["retailer-ledger", retailerId],
    enabled: !!retailerId,
    queryFn: async () => {
      const [invoiceOrders, collections, allOrders] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_no, net_amount, created_at, orders!inner(retailer_id, order_no)")
          .eq("orders.retailer_id", retailerId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("collections")
          .select("id, amount, mode, reference, status, created_at")
          .eq("retailer_id", retailerId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("id, order_no, status, total_amount, created_at")
          .eq("retailer_id", retailerId!)
          .order("created_at", { ascending: false }),
      ]);
      return {
        invoices: invoiceOrders.data ?? [],
        collections: collections.data ?? [],
        orders: allOrders.data ?? [],
      };
    },
  });

  const availableOf = (productId: string) => {
    const s = stock?.find((x) => x.product_id === productId);
    return s ? s.physical_qty - s.reserved_qty : 0;
  };

  const marginPct = Number((retailer as { margin_pct?: number } | undefined)?.margin_pct ?? 0);
  const displayAmount = Number((retailer as { display_amount?: number } | undefined)?.display_amount ?? 0);
  const rateFor = (ptr: number) => ptr * (1 - marginPct / 100);

  const lines = useMemo(() => {
    if (!data) return [];
    return data.products
      .filter((p) => (qty[p.id] ?? 0) > 0)
      .map((p) => {
        const q = qty[p.id] ?? 0;
        const { freeQty, scheme } = applyQtyScheme(data.schemes, p.id, q);
        const rate = rateFor(Number(p.ptr));
        return { product: p, qty: q, freeQty, scheme, rate, amount: q * rate };
      });
  }, [data, qty, marginPct]);

  const gross = lines.reduce((s, l) => s + l.amount, 0);
  const { discount, scheme: valScheme } = valueScheme(data?.schemes ?? [], gross);
  const net = Math.max(gross - discount - displayAmount, 0);

  const submit = useMutation({
    mutationFn: async () => {
      if (!retailer || !distributorId) throw new Error("Please select a retailer");
      if (lines.length === 0) throw new Error("Add at least one product");
      for (const l of lines) {
        if (l.qty + l.freeQty > availableOf(l.product.id))
          throw new Error(`${l.product.name}: quantity exceeds available stock`);
      }
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          kind: "secondary",
          retailer_id: retailer.id,
          distributor_id: distributorId,
          salesman_id: me?.profile?.id ?? null,
          total_amount: net,
          notes: valScheme ? `Scheme applied: ${valScheme.title}` : null,
        })
        .select("id, order_no")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("order_items").insert(
        lines.map((l) => ({
          order_id: order.id,
          product_id: l.product.id,
          qty: l.qty,
          free_qty: l.freeQty,
          rate: l.rate,
          amount: l.amount,
        })),
      );
      if (itemsError) throw itemsError;

      // reserve stock so other salesmen see available-to-sell
      for (const l of lines) {
        const row = stock?.find((s) => s.product_id === l.product.id);
        if (!row) continue;
        await supabase
          .from("distributor_stock")
          .update({ reserved_qty: row.reserved_qty + l.qty + l.freeQty, updated_at: new Date().toISOString() })
          .eq("distributor_id", distributorId)
          .eq("product_id", l.product.id);
      }
      return order;
    },
    onSuccess: (order) => {
      toast.success(`Order ${order.order_no} sent to distributor`);
      navigate({ to: "/salesman" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell
      mobile
      title="Book Order"
      subtitle="Live stock • auto scheme • credit check"
      nav={
        isBa
          ? [
              { to: "/ba", label: "Counter", icon: CalendarDays },
              { to: "/order-booking", label: "Book Order", icon: ShoppingCart },
              { to: "/ba-report", label: "Reports", icon: BarChart3 },
            ]
          : [
              { to: "/salesman", label: "Today", icon: CalendarDays },
              { to: "/order-booking", label: "Book Order", icon: ShoppingCart },
              { to: "/expenses", label: "Expenses", icon: Receipt },
              { to: "/my-report", label: "Reports", icon: BarChart3 },
            ]
      }

    >
      {isBa ? null : (
        <div className="mb-3 space-y-1.5">
          <Label>Distributor</Label>
          <Select
            value={filterDistributor ?? "all"}
            onValueChange={(v) => {
              setFilterDistributor(v === "all" ? null : v);
              setRetailerId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All mapped distributors" />
            </SelectTrigger>
            <SelectContent>
              <div className="p-2">
                <Input
                  autoFocus
                  value={distSearch}
                  onChange={(e) => setDistSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Search distributor…"
                  className="h-9"
                />
              </div>
              <SelectItem value="all">All mapped distributors</SelectItem>
              {mappedDistributors
                .filter((d) => {
                  const q = distSearch.trim().toLowerCase();
                  return !q || d.name.toLowerCase().includes(q) || (d.city ?? "").toLowerCase().includes(q);
                })
                .map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.city ? ` — ${d.city}` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label>Retailer</Label>
          <div className="flex items-center gap-2">
            {isBa ? null : <AddRetailerDialog invalidateKeys={["booking-master"]} />}
          </div>
        </div>

        <Select value={retailerId} onValueChange={setRetailerId} disabled={isBa}>

          <SelectTrigger>
            <SelectValue placeholder="Select retailer / outlet" />
          </SelectTrigger>
          <SelectContent>
            <div className="p-2">
              <Input
                autoFocus
                value={retailerSearch}
                onChange={(e) => setRetailerSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search retailer…"
                className="h-9"
              />
            </div>
            {visibleRetailers
              .filter((r) => {
                const q = retailerSearch.trim().toLowerCase();
                return (
                  !q ||
                  r.name.toLowerCase().includes(q) ||
                  (r.city ?? "").toLowerCase().includes(q) ||
                  (r.phone ?? "").toLowerCase().includes(q)
                );
              })
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name} — {r.city}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>


      {retailer ? (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Outstanding" value={inr(retailer.outstanding)} tone="danger" hint="Tap for detail" onClick={() => setDetail("outstanding")} />
          <StatCard label="Order Value" value={inr(net)} tone="primary" hint="Tap for detail" onClick={() => setDetail("order_value")} />
        </div>
      ) : null}

      <Section
        title={
          stockDistributorName
            ? `Products — Live stock at ${stockDistributorName}`
            : "Products — Available to Sell"
        }
      >
        <div className="p-3 pb-0">
          <Input
            value={productSearch}
            onChange={(e) => {
              setProductSearch(e.target.value);
              setProductPage(1);
            }}
            placeholder="Search product by name or SKU…"
            className="h-9"
          />
          {stockDistributorId && !distributorId ? (
            <p className="pt-2 text-[11px] text-muted-foreground">
              Showing live stock. Select a retailer to enter quantities.
            </p>
          ) : null}
        </div>
        <div className="divide-y divide-border/60">
          {paginatedProducts.map((p) => {
            const available = stockDistributorId ? availableOf(p.id) : 0;
            const q = qty[p.id] ?? 0;
            const { freeQty, scheme } = applyQtyScheme(data?.schemes ?? [], p.id, q);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.sku} • Rate {inr(rateFor(Number(p.ptr)))} • MRP {inr(p.mrp)}
                  </p>
                  <p className="mt-1 text-[11px]">
                    <span className={available === 0 ? "text-destructive" : available <= 10 ? "text-warning" : "text-success"}>
                      {available} pcs available
                    </span>
                    {scheme ? <Badge className="ml-2" variant="secondary">{scheme.title} • +{freeQty} free</Badge> : null}
                  </p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={available}
                  disabled={!distributorId || available === 0}
                  className="w-20"
                  value={q || ""}
                  onChange={(e) => setQty({ ...qty, [p.id]: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            );
          })}
        </div>
        {totalProductPages > 1 ? (
          <div className="flex items-center justify-between gap-2 p-3">
            <Button variant="outline" size="sm" disabled={productPage === 1} onClick={() => setProductPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {productPage} of {totalProductPages} ({filteredProducts.length} products)
            </span>
            <Button variant="outline" size="sm" disabled={productPage === totalProductPages} onClick={() => setProductPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        ) : (
          <div className="p-3 text-xs text-muted-foreground">{filteredProducts.length} products</div>
        )}
      </Section>

      <Section title="Order Summary">
        <div className="space-y-1 p-4 text-sm">
          <Row label="Gross Value" value={inr(gross)} />
          {marginPct > 0 ? <Row label={`Retail margin applied (${marginPct}%)`} value="included in rate" /> : null}
          {valScheme ? <Row label={valScheme.title} value={"- " + inr(discount)} /> : null}
          {displayAmount > 0 ? <Row label="Display amount" value={"- " + inr(displayAmount)} /> : null}
          <Row label="Net Order Value" value={inr(net)} strong />
          <Button
            className="mt-3 w-full"
            disabled={submit.isPending || lines.length === 0}
            onClick={() => submit.mutate()}
          >
            Confirm & Send to Distributor
          </Button>
        </div>
      </Section>
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail === "outstanding" && "Outstanding Detail"}
              {detail === "order_value" && "Order Value Detail"}
            </DialogTitle>
            <DialogDescription>{retailer?.name} — {retailer?.city}</DialogDescription>
          </DialogHeader>

          {detail === "outstanding" ? (
            <div className="space-y-3 text-sm">
              <Row label="Total Outstanding" value={inr(retailer?.outstanding)} strong />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoices</p>
              {(ledger?.invoices ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No invoices found.</p>
              ) : (
                <div className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {(ledger?.invoices ?? []).map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{inv.invoice_no}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(inv.created_at).toLocaleDateString("en-IN")}</p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">{inr(inv.net_amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collections</p>
              {(ledger?.collections ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No collections found.</p>
              ) : (
                <div className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {(ledger?.collections ?? []).map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium capitalize">{c.mode}{c.reference ? ` • ${c.reference}` : ""}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString("en-IN")}</p>
                      </div>
                      <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-success">
                        − {inr(c.amount)}
                        {c.status !== "approved" ? (
                          <span className={`block text-[10px] font-normal ${c.status === "rejected" ? "text-destructive" : "text-amber-600"}`}>
                            {c.status === "rejected" ? "Rejected" : "Pending approval"}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}


          {detail === "order_value" ? (
            <div className="space-y-1.5 text-sm">
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">No products selected yet.</p>
              ) : (
                <div className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {lines.map((l) => (
                    <div key={l.product.id} className="flex items-center justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{l.product.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {l.qty} × {inr(l.rate)}{l.freeQty > 0 ? ` + ${l.freeQty} free` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">{inr(l.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Row label="Gross Value" value={inr(gross)} />
              {valScheme ? <Row label={valScheme.title} value={"- " + inr(discount)} /> : null}
              {displayAmount > 0 ? <Row label="Display amount" value={"- " + inr(displayAmount)} /> : null}
              <Row label="Net Order Value" value={inr(net)} strong />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Row({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}
