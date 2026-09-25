import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeliveryList } from "@/components/sfa/DeliveryList";
import { BarChart3, BookUser, Download, IndianRupee, PackagePlus, Store } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compactInr, gstBreakup, inr } from "@/lib/sfa";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { downloadReportPdf, rs } from "@/lib/report-pdf";
import { toParty } from "@/lib/invoice-party";
import { useMe } from "@/hooks/useAuth";
import { MarginBudget } from "@/components/sfa/MarginBudget";


export const Route = createFileRoute("/_authenticated/distributor")({
  head: () => ({
    meta: [
      { title: "Distributor Panel — POPPiK SFA" },
      { name: "description", content: "Accept salesman orders, generate GST invoices, track stock and order from CSA." },
      { property: "og:title", content: "Distributor Panel — POPPiK SFA" },
      { property: "og:description", content: "Orders, GST invoicing, live stock and CSA replenishment in one panel." },
    ],
  }),
  component: DistributorPage,
});

function DistributorPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("orders");
  const [selected, setSelected] = useState<string[]>([]);
  const [invFrom, setInvFrom] = useState("");
  const [invTo, setInvTo] = useState("");
  const [invParty, setInvParty] = useState("");
  const { data: me } = useMe();
  const myDistributorId = (me?.profile?.distributor_id as string | null) ?? null;

  const { data: payouts } = useQuery({
    queryKey: ["distributor-payouts", myDistributorId],
    queryFn: async () => {
      let q = supabase
        .from("csa_payments")
        .select("*, csas(name, city)")
        .order("created_at", { ascending: false });
      if (myDistributorId) q = q.eq("distributor_id", myDistributorId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data } = useQuery({
    queryKey: ["distributor-panel", myDistributorId],
    queryFn: async () => {
      let purchaseQ = supabase
        .from("orders")
        .select("*, csas(*), order_items(id, qty, free_qty, rate, amount, product_id, products(name, sku))")
        .eq("kind", "primary")
        .order("created_at", { ascending: false });
      if (myDistributorId) purchaseQ = purchaseQ.eq("distributor_id", myDistributorId);

      let purchaseInvQ = supabase
        .from("invoices")
        .select("*, orders!inner(order_no, discount_amount, kind, csa_id, distributor_id, csas(*), order_items(id, qty, free_qty, rate, amount, products(name)))")
        .eq("orders.kind", "primary")
        .order("created_at", { ascending: false });
      if (myDistributorId) purchaseInvQ = purchaseInvQ.eq("orders.distributor_id", myDistributorId);

      const [orders, stock, invoices, distributors, purchases, purchaseInvoices, collections, products, retailers] =
        await Promise.all([
        supabase
          .from("orders")
          .select("*, retailers(*), order_items(id, qty, free_qty, rate, amount, product_id, products(name, sku))")
          .eq("kind", "secondary")
          .order("created_at", { ascending: false }),
        (myDistributorId
          ? supabase
              .from("distributor_stock")
              .select("*, products(name, sku, ptr)")
              .eq("distributor_id", myDistributorId)
              .order("physical_qty", { ascending: true })
          : supabase
              .from("distributor_stock")
              .select("*, products(name, sku, ptr)")
              .order("physical_qty", { ascending: true })),
        supabase
          .from("invoices")
          .select(
            "*, orders(order_no, discount_amount, distributor_id, retailers(*), order_items(id, qty, free_qty, rate, amount, products(name)))",
          )
          .order("created_at", { ascending: false }),
        supabase.from("distributors").select("*"),
        purchaseQ,
        purchaseInvQ,
        supabase
          .from("collections")
          .select("id, amount, mode, reference, status, created_at, retailers(name, city, outstanding, distributor_id)")
          .order("created_at", { ascending: false }),
        supabase.from("products").select("id, name, sku, ptr").order("name"),
        supabase.from("retailers").select("id, name, city, distributor_id").order("name"),
      ]);
      return {
        orders: orders.data ?? [],
        stock: stock.data ?? [],
        invoices: invoices.data ?? [],
        distributors: distributors.data ?? [],
        purchases: purchases.data ?? [],
        purchaseInvoices: purchaseInvoices.data ?? [],
        collections: collections.data ?? [],
        products: products.data ?? [],
        retailers: retailers.data ?? [],
      };
    },
  });

  const myFirm = myDistributorId
    ? ((data?.distributors ?? []).find((d) => d.id === myDistributorId) as
        | { name: string; city: string | null; state: string | null }
        | undefined)
    : undefined;

  const allCollections = data?.collections ?? [];
  const pendingCollections = allCollections.filter((c) => {
    const r = c.retailers as { distributor_id: string | null } | null;
    const mine = !myDistributorId || r?.distributor_id === myDistributorId;
    return c.status === "pending" && mine;
  });

  const reviewCollection = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("review_collection", { _id: id, _approve: approve });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Payment approved. Retailer outstanding updated." : "Payment rejected.");
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptOne = async (orderId: string) => {
    {
      const order = data?.orders.find((o) => o.id === orderId);
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
        const row = data?.stock.find(
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
    }
  };

  const act = useMutation({
    mutationFn: async ({ orderId, accept }: { orderId: string; accept: boolean }) => {
      if (!accept) {
        const { error } = await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
        if (error) throw error;
        return;
      }
      await acceptOne(orderId);
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
      if (vars.accept) {
        toast.success("Invoiced — moved to Invoices tab");
        setTab("invoices");
      } else {
        toast.success("Order rejected");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orders = data?.orders ?? [];
  const pending = orders.filter((o) => o.status === "pending");
  const todayBilling = (data?.invoices ?? []).reduce((s, i) => s + Number(i.net_amount), 0);
  
  const activeStock = (data?.stock ?? []).filter((s) => s.physical_qty > 0 || s.reserved_qty > 0);
  
  const stockValue = activeStock.reduce(
    (s, r) => s + r.physical_qty * Number((r.products as { ptr: number } | null)?.ptr ?? 0),
    0,
  );
  const outstanding = (data?.distributors ?? []).reduce((s, d) => s + Number(d.outstanding), 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => String(o.created_at).slice(0, 10) === todayStr);
  const openOrders = orders.filter((o) => o.status !== "invoiced" && o.status !== "rejected");
  const lowStock = activeStock.filter((s) => s.physical_qty - s.reserved_qty <= 10);

  const openReport = (card: string) => navigate({ to: "/distributor-report/$card", params: { card } });

  const pendingOpen = openOrders.filter((o) => o.status === "pending");

  const toggleOrder = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  type InvOrder = {
    order_no: string;
    distributor_id: string | null;
    notes?: string | null;
    retailers: Record<string, string | null> | null;
    order_items:
      | { id: string; qty: number; free_qty: number; rate: number; amount: number; products: { name: string } | null }[]
      | null;
  } | null;

  const partyOf = (i: { orders: unknown }) => ((i.orders as InvOrder)?.retailers?.["name"] as string | null) ?? "—";

  const filteredInvoices = (data?.invoices ?? []).filter((i) => {
    const day = String(i.created_at).slice(0, 10);
    if (invFrom && day < invFrom) return false;
    if (invTo && day > invTo) return false;
    const q = invParty.trim().toLowerCase();
    if (q && !partyOf(i).toLowerCase().includes(q) && !i.invoice_no.toLowerCase().includes(q)) return false;
    return true;
  });
  const filteredInvTotal = filteredInvoices.reduce((s, i) => s + Number(i.net_amount), 0);

  const godownOrders = orders.filter((o) => (o.notes ?? "").startsWith("Godown sale"));

  const downloadInvoiceList = () =>
    downloadReportPdf({
      fileName: "invoice-register.pdf",
      title: "Invoice Register",
      subtitle: "Secondary sales invoices",
      meta: [
        `Period: ${invFrom || "start"} to ${invTo || "today"}`,
        invParty.trim() ? `Filter: ${invParty.trim()}` : "Filter: all parties",
        `Invoices: ${filteredInvoices.length} • Net: ${rs(filteredInvTotal)}`,
      ],
      tables: [
        {
          title: "Invoices",
          head: ["Invoice", "Party", "Date", "Taxable", "GST", "Net"],
          rows: filteredInvoices.map((i) => [
            i.invoice_no,
            partyOf(i),
            new Date(i.created_at).toLocaleDateString("en-IN"),
            rs(Number(i.taxable_value)),
            rs(Number(i.cgst) + Number(i.sgst)),
            rs(Number(i.net_amount)),
          ]),
        },
      ],
    }).catch((e: Error) => toast.error(e.message));

  return (
    <Shell
      title={myFirm?.name ?? "Distributor Panel"}
      subtitle={
        myFirm
          ? [me?.profile?.full_name, [myFirm.city, myFirm.state].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(" • ") || "Orders • Billing • Stock • CSA"
          : "Orders • Billing • Stock • CSA"
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Orders" value={String(orders.length)} onClick={() => openReport("orders")} />
        <StatCard label="Pending Orders" value={String(pending.length)} tone="warning" onClick={() => openReport("pending")} />
        <StatCard label="Billing" value={compactInr(todayBilling)} tone="primary" onClick={() => openReport("billing")} />
        <StatCard label="Outstanding" value={compactInr(outstanding)} tone="danger" onClick={() => openReport("outstanding")} />
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Stock Value" value={compactInr(stockValue)} tone="success" onClick={() => openReport("stockValue")} />
        <StatCard label="Invoices" value={String(data?.invoices.length ?? 0)} onClick={() => openReport("invoices")} />
        <StatCard label="Low Stock SKUs" value={String(lowStock.length)} tone="warning" onClick={() => openReport("lowStock")} />
        <StatCard label="Retail Orders Today" value={String(todayOrders.length)} onClick={() => openReport("todayOrders")} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/business-reports" search={{ panel: "distributor" }}>
            <BarChart3 className="mr-1 size-3.5" /> Reports & analytics
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/party-ledger">
            <BookUser className="mr-1 size-3.5" /> Party-wise ledger
          </Link>
        </Button>

        <Button asChild size="sm">
          <Link to="/purchase-order">
            <PackagePlus className="mr-1 size-3.5" /> Order from CSA
          </Link>
        </Button>
      </div>





      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="godown">Godown Sales</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="purchase">Purchase</TabsTrigger>
          <TabsTrigger value="delivery">Delivery Status</TabsTrigger>
          <TabsTrigger value="payments">Payment In</TabsTrigger>
          <TabsTrigger value="payout">Payment Out</TabsTrigger>
          <TabsTrigger value="claims">Claims</TabsTrigger>
          <TabsTrigger value="margin">Margin Budget</TabsTrigger>
        </TabsList>

        <TabsContent value="margin">
          <MarginBudget distributorIds={myDistributorId ? [myDistributorId] : null} csaIds={[]} title="My margin budget" />
        </TabsContent>

        <TabsContent value="delivery">
          <DeliveryList mode="distributor" distributorId={myDistributorId} />
        </TabsContent>

        <TabsContent value="claims">
          <Section
            title="Margin & Display Claims"
            action={
              <Button asChild size="sm">
                <Link to="/claims">Open claims</Link>
              </Button>
            }
          >
            <p className="p-4 text-sm text-muted-foreground">
              Raise retailer-wise extra margin and display claims with an invoice copy. Once the company approves, the
              approved claim amount shows up here on the claims page.
            </p>
          </Section>
        </TabsContent>

        <TabsContent value="payout">
          <Section
            title="Payments to CSA"
            action={
              <Button asChild size="sm">
                <Link to="/payment-out">
                  <IndianRupee className="mr-1 size-3.5" /> Payment Out
                </Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {(payouts ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No payments sent to CSA yet.</p>
              ) : (
                (payouts ?? []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{(p.csas as { name: string } | null)?.name ?? "CSA"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("en-IN")} • {p.mode}
                        {p.reference ? ` • ${p.reference}` : ""}
                      </p>
                      {p.approval_note ? (
                        <p className="text-[11px] text-muted-foreground">CSA note: {p.approval_note}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{inr(p.amount)}</p>
                      <Badge
                        variant={
                          p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"
                        }
                      >
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="payments">
          <Section title="Pending Approvals">
            <div className="divide-y divide-border/60">
              {pendingCollections.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No payment entries waiting for your approval.</p>
              ) : (
                pendingCollections.map((c) => {
                  const r = c.retailers as { name: string; city: string | null } | null;
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r?.name ?? "Retailer"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString("en-IN")} • {c.mode}
                          {c.reference ? ` • ${c.reference}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold tabular-nums">{inr(c.amount)}</p>
                        <Button size="sm" disabled={reviewCollection.isPending} onClick={() => reviewCollection.mutate({ id: c.id, approve: true })}>
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" disabled={reviewCollection.isPending} onClick={() => reviewCollection.mutate({ id: c.id, approve: false })}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Section>
          <Section
            title="Payments Received"
            action={
              <Button asChild size="sm">
                <Link to="/payment-in" search={{ retailer: "" }}>
                  <IndianRupee className="mr-1 size-3.5" /> Payment In
                </Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {(data?.collections ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                data!.collections.map((c) => {
                  const r = c.retailers as { name: string; city: string | null; outstanding: number } | null;
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r?.name ?? "Retailer"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString("en-IN")} • {c.mode}
                          {c.reference ? ` • ${c.reference}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums text-success">{inr(c.amount)}</p>
                        <Badge variant={c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"} className="text-[10px]">
                          {c.status === "pending" ? "Pending approval" : c.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Section>
        </TabsContent>


        <TabsContent value="orders">
          <Section title="Incoming Orders">
            {pendingOpen.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-muted/30 p-3">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <Checkbox
                    checked={selected.length > 0 && selected.length === pendingOpen.length}
                    onCheckedChange={(c) =>
                      setSelected(c ? pendingOpen.map((o) => o.id) : [])
                    }
                  />
                  Select all pending ({pendingOpen.length})
                </label>
                <span className="text-xs text-muted-foreground">{selected.length} selected</span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    disabled={selected.length === 0}
                    onClick={() => navigate({ to: "/bulk-review", search: { ids: selected } })}
                  >
                    Bulk accept &amp; invoice
                  </Button>
                  {selected.length > 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="divide-y divide-border/60">
              {openOrders.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No open orders. Invoiced orders move to the Invoices tab.
                </p>
              ) : (
                openOrders.map((o) => (
                  <div
                    key={o.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer p-3 transition-colors hover:bg-muted/40"
                    onClick={() => navigate({ to: "/order/$orderId", params: { orderId: o.id } })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate({ to: "/order/$orderId", params: { orderId: o.id } });
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-2">
                        {o.status === "pending" ? (
                          <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                            <Checkbox
                              aria-label={`Select ${o.order_no}`}
                              checked={selected.includes(o.id)}
                              onCheckedChange={() => toggleOrder(o.id)}
                            />
                          </span>
                        ) : null}
                        <div>
                        <p className="text-sm font-medium">
                          {o.order_no} • {(o.retailers as { name: string } | null)?.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {(o.order_items ?? []).length} SKU • {inr(o.total_amount)}
                        </p>
                        </div>
                      </div>
                      <Badge variant={o.status === "pending" ? "default" : "secondary"}>{o.status}</Badge>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {(o.order_items ?? []).map((it) => (
                        <p key={it.id} className="text-[11px] text-muted-foreground">
                          {(it.products as { name: string } | null)?.name} — {it.qty} pcs
                          {it.free_qty ? ` (+${it.free_qty} free)` : ""} @ {inr(it.rate)}
                        </p>
                      ))}
                    </div>
                    {o.status === "pending" ? (
                      <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ orderId: o.id, accept: true })}>
                          Accept & Invoice
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate({ to: "/order/$orderId", params: { orderId: o.id } })}
                        >
                          Edit qty
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ orderId: o.id, accept: false })}
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

        <TabsContent value="stock">
          <Section
            title="Warehouse Stock (batch-wise)"
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
            <div className="divide-y divide-border/60">
              {activeStock.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No active stock available.</p>
              ) : (
                activeStock.map((s) => {
                  const available = s.physical_qty - s.reserved_qty;
                  return (
                    <div key={s.id} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <p className="font-medium">{(s.products as { name: string } | null)?.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Batch {s.batch_no} • Exp {s.expiry_date}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      <p>Physical {s.physical_qty} • Reserved {s.reserved_qty}</p>
                      <p className={available <= 10 ? "font-semibold text-warning" : "font-semibold text-success"}>
                        Available {available}
                      </p>
                    </div>
                  </div>
                );
              }))}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="godown">
          <Section
            title="Godown / Counter Sales"
            action={
              <Button asChild size="sm">
                <Link to="/godown-sale">
                  <Store className="mr-1 size-3.5" /> New godown sale
                </Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {godownOrders.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No manual godown sales yet. Use “New godown sale” to bill an order that did not come through the app.
                </p>
              ) : (
                godownOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {o.order_no} • {(o.retailers as { name: string } | null)?.name ?? "Party"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("en-IN")} • {(o.order_items ?? []).length} SKU •{" "}
                        {o.notes}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{inr(o.total_amount)}</span>
                      <Badge variant="outline">{o.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="invoices">
          <Section title="GST Invoices">
            <div className="grid gap-3 border-b border-border/60 bg-muted/30 p-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label className="text-[11px]">From date</Label>
                <Input type="date" value={invFrom} onChange={(e) => setInvFrom(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[11px]">To date</Label>
                <Input type="date" value={invTo} onChange={(e) => setInvTo(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[11px]">Party / invoice no</Label>
                <Input value={invParty} placeholder="Search party" onChange={(e) => setInvParty(e.target.value)} />
              </div>
              <div className="flex items-end gap-2">
                <Button size="sm" variant="outline" onClick={downloadInvoiceList}>
                  <Download className="mr-1 size-3.5" /> List PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setInvFrom("");
                    setInvTo("");
                    setInvParty("");
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
              <span>{filteredInvoices.length} invoice(s)</span>
              <span className="font-medium">Net {inr(filteredInvTotal)}</span>
            </div>
            <div className="divide-y divide-border/60">
              {filteredInvoices.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No invoices match these filters.</p>
              ) : (
                filteredInvoices.map((i) => {
                  const ord = i.orders as InvOrder;
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {i.invoice_no} • {partyOf(i)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(i.created_at).toLocaleDateString("en-IN")} • {ord?.order_no} • CGST {inr(i.cgst)} •
                          SGST {inr(i.sgst)}
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
                                (data?.distributors ?? []).find((d) => d.id === ord?.distributor_id),
                                "Distributor (Secondary Sales)",
                                "Distributor",
                              ),
                              buyer: toParty(ord?.retailers, "Retailer / Outlet", "Retailer"),
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

        <TabsContent value="purchase">
          <Section title="My Purchase Orders (to CSA)">
            <div className="divide-y divide-border/60">
              {(data?.purchases ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No purchase orders yet. Use “Order from CSA”.</p>
              ) : (
                data!.purchases.map((o) => (
                  <div key={o.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {o.order_no} • {(o.csas as { name: string } | null)?.name ?? "CSA"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {(o.order_items ?? []).length} SKU • {inr(o.total_amount)} •{" "}
                          {new Date(o.created_at).toLocaleDateString("en-IN")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {o.status !== "pending" && o.status !== "rejected" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const dist = (data?.distributors ?? []).find((d) => d.id === o.distributor_id);
                              const { taxable, cgst, sgst, net } = gstBreakup(Number(o.total_amount));
                              downloadInvoicePdf({
                                invoiceNo: `PO-${o.order_no}`,
                                date: o.created_at,
                                title: "PURCHASE BILL",
                                seller: toParty(o.csas as Record<string, string | null> | null, "CSA / Super Stockist", "Super Stockist"),
                                buyer: toParty(dist, "Distributor (Purchaser)", "Distributor"),

                                orderNo: o.order_no,
                                lines: (o.order_items ?? []).map((it) => ({
                                  name: (it.products as { name: string } | null)?.name ?? "Item",
                                  qty: it.qty,
                                  freeQty: it.free_qty,
                                  rate: Number(it.rate),
                                  amount: Number(it.amount),
                                })),
                                discountAmount: Number((o as any)?.discount_amount) || undefined,
                                taxable,
                                cgst,
                                sgst,
                                net,
                              }).catch((e: Error) => toast.error(e.message));
                            }}
                          >
                            <Download className="mr-1 size-3.5" /> Bill
                          </Button>
                        ) : null}
                        <Badge variant={o.status === "pending" ? "default" : "secondary"}>{o.status}</Badge>
                      </div>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {(o.order_items ?? []).map((it) => (
                        <p key={it.id} className="text-[11px] text-muted-foreground">
                          {(it.products as { name: string } | null)?.name} — {it.qty} pcs @ {inr(it.rate)}
                        </p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Purchase Invoices (from CSA)">
            <div className="divide-y divide-border/60">
              {(data?.purchaseInvoices ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No purchase invoices yet.</p>
              ) : (
                data!.purchaseInvoices.map((i) => {
                  const ord = i.orders as {
                    order_no: string;
                    distributor_id: string | null;
                    csas: Record<string, string | null> | null;
                    order_items: { id: string; qty: number; free_qty: number; rate: number; amount: number; products: { name: string } | null }[] | null;
                  } | null;
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{i.invoice_no}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {ord?.order_no} • {ord?.csas?.['name'] ?? "CSA"} • CGST {inr(i.cgst)} • SGST {inr(i.sgst)}
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
                              title: "PURCHASE BILL",
                              seller: toParty(ord?.csas, "CSA / Super Stockist", "Super Stockist"),
                              buyer: toParty(
                                (data?.distributors ?? []).find((d) => d.id === ord?.distributor_id),
                                "Distributor (Purchaser)",
                                "Distributor",
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
      </Tabs>
    </Shell>
  );
}
