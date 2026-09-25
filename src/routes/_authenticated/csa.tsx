import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import { DeliveryList } from "@/components/sfa/DeliveryList";
import { compactInr, gstBreakup, inr } from "@/lib/sfa";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { toParty } from "@/lib/invoice-party";
import { fetchParties } from "@/lib/party-ledger";
import { MarginBudget } from "@/components/sfa/MarginBudget";
import { useMe } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/csa")({
  head: () => ({
    meta: [
      { title: "CSA Panel — POPPiK SFA" },
      { name: "description", content: "Super stockist panel: distributor orders, approvals, stock and dispatch." },
      { property: "og:title", content: "CSA Panel — POPPiK SFA" },
      { property: "og:description", content: "Approve distributor orders, invoice and move stock down the supply chain." },
    ],
  }),
  component: CsaPage,
});

function CsaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [payNote, setPayNote] = useState<Record<string, string>>({});
  const [stockSearch, setStockSearch] = useState("");
  const { data: me } = useMe();
  const myCsaId = (me?.profile?.csa_id as string | null) ?? null;


  const { data: payments } = useQuery({
    queryKey: ["csa-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("csa_payments")
        .select("*, distributors(name, city, outstanding)")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const reviewPayment = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("review_csa_payment", {
        _id: id,
        _approve: approve,
        _note: payNote[id]?.trim() ?? "",
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Payment approved and outstanding updated" : "Payment rejected");
      qc.invalidateQueries({ queryKey: ["csa-payments"] });
      qc.invalidateQueries({ queryKey: ["csa-panel"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingPayments = (payments ?? []).filter((p) => p.status === "pending");

  const { data } = useQuery({
    queryKey: ["csa-panel", myCsaId],
    queryFn: async () => {
      const [orders, stock, distributors, products, csas, invoices, depotOrders] = await Promise.all([
        supabase
          .from("orders")
          .select("*, distributors(*), order_items(id, qty, free_qty, rate, product_id, products(name))")
          .eq("kind", "primary")
          .order("created_at", { ascending: false }),
        myCsaId
          ? supabase.from("csa_stock").select("*, products(name, sku, pts)").eq("csa_id", myCsaId)
          : supabase.from("csa_stock").select("*, products(name, sku, pts)"),
        supabase.from("distributors").select("*"),
        supabase.from("products").select("*").order("name"),
        supabase.from("csas").select("*"),
        supabase
          .from("invoices")
          .select(
            "*, orders(order_no, discount_amount, kind, csa_id, depot_id, depots(*), distributors(*), order_items(id, qty, free_qty, rate, amount, products(name)))",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("*, depots(name, city), order_items(id)")
          .eq("kind", "depot")
          .order("created_at", { ascending: false }),
      ]);
      const allInvoices = invoices.data ?? [];
      const invoiceOrder = (i: { orders: unknown }) => (i.orders as { kind: string; csa_id: string | null } | null);
      return {
        orders: orders.data ?? [],
        stock: stock.data ?? [],
        distributors: (distributors.data ?? []).filter(
          (d) => !myCsaId || (d.csa_id as string | null) === myCsaId,
        ),
        products: products.data ?? [],
        csas: csas.data ?? [],
        invoices: allInvoices.filter((i) => invoiceOrder(i)?.kind === "primary"),
        purchaseInvoices: allInvoices.filter(
          (i) => invoiceOrder(i)?.kind === "depot" && (!myCsaId || invoiceOrder(i)?.csa_id === myCsaId),
        ),
        depotOrders: (depotOrders.data ?? []).filter(
          (o) => !myCsaId || (o.csa_id as string | null) === myCsaId,
        ),
      };
    },
  });


  const { data: parties } = useQuery({
    queryKey: ["parties", myCsaId],
    queryFn: () => fetchParties(myCsaId),
  });
  const ledgerParties = (parties ?? []).filter((p) => p.type === "distributor");

  const orders = data?.orders ?? [];
  const pending = orders.filter((o) => o.status === "pending");
  const godownOrders = orders.filter((o) => (o.notes ?? "").startsWith("Godown sale"));

  const stockValue = (data?.stock ?? []).reduce(
    (s, r) => s + r.physical_qty * Number((r.products as { pts: number } | null)?.pts ?? 0),
    0,
  );
  const outstanding = (data?.distributors ?? []).reduce((s, d) => s + Number(d.outstanding), 0);

  const filteredStock = (() => {
    const q = stockSearch.trim().toLowerCase();
    const rows = data?.stock ?? [];
    if (!q) return rows;
    return rows.filter((r) => {
      const p = r.products as { name?: string; sku?: string } | null;
      return `${p?.name ?? ""} ${p?.sku ?? ""}`.toLowerCase().includes(q);
    });
  })();

  return (
    <Shell title="CSA / Super Stockist" subtitle="Distributor orders • stock • dispatch">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pending Orders" value={String(pending.length)} tone="warning" onClick={() => navigate({ to: "/csa-report/$card", params: { card: "pending" } })} />
        <StatCard label="Distributors" value={String(data?.distributors.length ?? 0)} onClick={() => navigate({ to: "/csa-report/$card", params: { card: "distributors" } })} />
        <StatCard label="Stock Value" value={compactInr(stockValue)} tone="success" onClick={() => navigate({ to: "/csa-report/$card", params: { card: "stock" } })} />
        <StatCard label="Outstanding" value={compactInr(outstanding)} tone="danger" onClick={() => navigate({ to: "/csa-report/$card", params: { card: "outstanding" } })} />
      </div>

      <Tabs defaultValue="orders" className="mt-6">
        <TabsList>
          <TabsTrigger value="orders">Distributor Orders</TabsTrigger>
          <TabsTrigger value="depot">Depot Purchase</TabsTrigger>
          <TabsTrigger value="godown">Godown Billing</TabsTrigger>

          <TabsTrigger value="stock">CSA Stock</TabsTrigger>
          <TabsTrigger value="invoices">Sales Invoices</TabsTrigger>
          <TabsTrigger value="purchaseinv">Purchase Invoices</TabsTrigger>

          <TabsTrigger value="delivery">Delivery Status</TabsTrigger>
          <TabsTrigger value="paymentin">
            Payment In{pendingPayments.length ? ` (${pendingPayments.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="paymentout">Payment Out</TabsTrigger>
          <TabsTrigger value="ledger">Party Ledger</TabsTrigger>
          <TabsTrigger value="margin">Margin Budget</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Section
            title="Primary Orders"
            action={
              <Button asChild size="sm">
                <Link to="/depot-purchase">Order from Master Depot</Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {orders.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No primary orders yet.</p>
              ) : (
                orders.map((o) => (
                  <Link
                    key={o.id}
                    to="/primary-order/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {o.order_no} • {(o.distributors as { name: string } | null)?.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {(o.order_items ?? []).length} SKU • {new Date(o.created_at).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">{inr(o.total_amount)}</span>
                      <Badge variant={o.status === "pending" ? "default" : "secondary"}>{o.status}</Badge>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="depot">
          <Section
            title="Orders placed on Master Depot"
            action={
              <Button asChild size="sm">
                <Link to="/depot-purchase">New depot order</Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {(data?.depotOrders ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No depot orders yet.</p>
              ) : (
                (data?.depotOrders ?? []).map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {o.order_no} • {(o.depots as { name: string } | null)?.name ?? "Master Depot"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {(o.order_items ?? []).length} SKU • {new Date(o.created_at).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-semibold tabular-nums">{inr(o.total_amount)}</span>
                      <Badge variant={o.status === "pending" ? "default" : "secondary"}>{o.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="godown">
          <Section
            title="Godown Billing"
            action={
              <Button asChild size="sm">
                <Link to="/godown-sale">New godown bill</Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {godownOrders.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No manual godown bills yet.</p>
              ) : (
                godownOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {o.order_no} • {(o.distributors as { name: string } | null)?.name ?? "Party"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {(o.order_items ?? []).length} SKU • {new Date(o.created_at).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-semibold tabular-nums">{inr(o.total_amount)}</span>
                      <Badge variant="secondary">{o.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="stock">

          <Section
            title="Warehouse Stock"
            action={
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/opening-stock">Opening stock</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/stock-adjust">Adjust stock</Link>
                </Button>
              </div>
            }
          >
            <div className="p-3">
              <Input
                placeholder="Search product by name or SKU…"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
              />
            </div>
            <div className="divide-y divide-border/60">
              {filteredStock.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {stockSearch ? "No matching stock found." : "No stock yet — add opening stock first."}
                </p>
              ) : (
                filteredStock.map((s) => {
                  const p = s.products as { name: string; sku?: string } | null;
                  return (
                    <div key={s.id} className="flex items-center justify-between p-3 text-sm">
                      <span>
                        {p?.name}
                        {p?.sku ? <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span> : null}
                      </span>
                      <span className="tabular-nums">{s.physical_qty - s.reserved_qty} pcs</span>
                    </div>
                  );
                })
              )}
            </div>

          </Section>
        </TabsContent>

        <TabsContent value="delivery">
          <DeliveryList
            mode="csa"
            action={
              <Button asChild size="sm">
                <Link to="/delivery-note" search={{ order: undefined }}>Add LR / dispatch</Link>
              </Button>
            }
          />
        </TabsContent>

        <TabsContent value="invoices">
          <Section title="Primary GST Invoices">
            <div className="divide-y divide-border/60">
              {(data?.invoices ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No primary invoices yet.</p>
              ) : (
                data!.invoices.map((i) => {
                  const ord = i.orders as {
                    order_no: string;
                    csa_id: string | null;
                    distributors: Record<string, string | null> | null;
                    order_items: { id: string; qty: number; free_qty: number; rate: number; amount: number; products: { name: string } | null }[] | null;
                  } | null;
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div>
                        <p className="font-medium">{i.invoice_no}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {ord?.order_no} • {ord?.distributors?.['name']} • CGST {inr(i.cgst)} • SGST {inr(i.sgst)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{inr(i.net_amount)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            downloadInvoicePdf({
                              invoiceNo: i.invoice_no,
                              date: i.created_at,
                              seller: toParty(
                                (data?.csas ?? []).find((c) => c.id === ord?.csa_id),
                                "CSA / Super Stockist (Primary Sales)",
                                "Super Stockist",
                              ),
                              buyer: toParty(ord?.distributors, "Distributor", "Distributor"),
                              orderNo: ord?.order_no ?? null,
                              lines: (ord?.order_items ?? []).map((it) => ({
                                name: it.products?.name ?? "Item",
                                qty: it.qty,
                                freeQty: it.free_qty,
                                rate: Number(it.rate),
                                amount: Number(it.amount),
                              })),
                              discountAmount: Number((ord as any)?.discount_amount) || undefined,
                              taxable: Number(i.taxable_value),
                              cgst: Number(i.cgst),
                              sgst: Number(i.sgst),
                              net: Number(i.net_amount),
                            }).catch((e: Error) => toast.error(e.message))
                          }
                        >
                          <Download className="mr-1 size-3.5" /> PDF
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="purchaseinv">
          <Section title="Purchase Invoices from Master Depot">
            <div className="divide-y divide-border/60">
              {(data?.purchaseInvoices ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No depot purchase invoices yet.</p>
              ) : (
                data!.purchaseInvoices.map((i) => {
                  const ord = i.orders as {
                    order_no: string;
                    csa_id: string | null;
                    depots: Record<string, string | null> | null;
                    order_items:
                      | { id: string; qty: number; free_qty: number; rate: number; amount: number; products: { name: string } | null }[]
                      | null;
                  } | null;
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{i.invoice_no}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {ord?.order_no} • {ord?.depots?.['name'] ?? "Master Depot"} • CGST {inr(i.cgst)} • SGST {inr(i.sgst)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold tabular-nums">{inr(i.net_amount)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            downloadInvoicePdf({
                              invoiceNo: i.invoice_no,
                              date: i.created_at,
                              seller: toParty(ord?.depots, "Master Depot", "Master Depot"),
                              buyer: toParty(
                                (data?.csas ?? []).find((c) => c.id === ord?.csa_id),
                                "CSA / Super Stockist",
                                "Super Stockist",
                              ),
                              orderNo: ord?.order_no ?? null,
                              lines: (ord?.order_items ?? []).map((it) => ({
                                name: it.products?.name ?? "Item",
                                qty: it.qty,
                                freeQty: it.free_qty,
                                rate: Number(it.rate),
                                amount: Number(it.amount),
                              })),
                              discountAmount: Number((ord as any)?.discount_amount) || undefined,
                              taxable: Number(i.taxable_value),
                              cgst: Number(i.cgst),
                              sgst: Number(i.sgst),
                              net: Number(i.net_amount),
                            }).catch((e: Error) => toast.error(e.message))
                          }
                        >
                          <Download className="mr-1 size-3.5" /> PDF
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="paymentin">
          <Section
            title="Payments from Distributors"
            action={
              <Button asChild size="sm">
                <Link to="/payment-out">Manual Payment In</Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {(payments ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No distributor payments yet.</p>
              ) : (
                (payments ?? []).map((p) => (
                  <div key={p.id} className="space-y-2 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {(p.distributors as { name: string } | null)?.name ?? "Distributor"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString("en-IN")} • {p.mode}
                          {p.reference ? ` • ${p.reference}` : ""} • entered by {p.created_role}
                        </p>
                        {p.notes ? <p className="text-[11px] text-muted-foreground">Remark: {p.notes}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums text-success">{inr(p.amount)}</p>
                        <Badge
                          variant={
                            p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"
                          }
                        >
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                    {p.status === "pending" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="h-8 max-w-xs"
                          placeholder="Note (optional)"
                          value={payNote[p.id] ?? ""}
                          onChange={(e) => setPayNote((n) => ({ ...n, [p.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          disabled={reviewPayment.isPending}
                          onClick={() => reviewPayment.mutate({ id: p.id, approve: true })}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewPayment.isPending}
                          onClick={() => reviewPayment.mutate({ id: p.id, approve: false })}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="paymentout">
          <Section title="Payment Out — bills payable to Master Depot">
            <div className="divide-y divide-border/60">
              {(data?.purchaseInvoices ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No depot purchase bills yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 bg-muted/40 p-3 text-sm">
                    <span className="font-medium">Total payable</span>
                    <span className="font-semibold tabular-nums">
                      {inr((data?.purchaseInvoices ?? []).reduce((s, i) => s + Number(i.net_amount), 0))}
                    </span>
                  </div>
                  {(data?.purchaseInvoices ?? []).map((i) => {
                    const o = i.orders as { order_no: string; depots: { name: string } | null } | null;
                    return (
                      <div key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{i.invoice_no}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {o?.depots?.name ?? "Master Depot"} • {o?.order_no ?? "—"} •{" "}
                            {new Date(i.created_at).toLocaleDateString("en-IN")}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">{inr(i.net_amount)}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="margin">
          <MarginBudget csaIds={myCsaId ? [myCsaId] : null} distributorIds={[]} title="My margin budget" />
        </TabsContent>

        <TabsContent value="ledger">
          <Section
            title="Party-wise ledger"
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/party-ledger">All parties</Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {ledgerParties.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No distributor ledgers yet.</p>
              ) : (
                ledgerParties.map((p) => (
                  <Link
                    key={p.id}
                    to="/party-ledger/$type/$id"
                    params={{ type: p.type, id: p.id }}
                    className="flex items-center justify-between gap-3 p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.area} • Billed {inr(p.billed)} • Received {inr(p.received)}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{inr(p.balance)}</span>
                  </Link>
                ))
              )}
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
