import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { downloadReportPdf, rs } from "@/lib/report-pdf";
import { inr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/distributor-network/$id")({
  head: () => ({
    meta: [
      { title: "Distributor Stock & Outstanding — POPPiK SFA" },
      {
        name: "description",
        content: "Product-wise distributor stock statement and retailer-wise outstanding with PDF download.",
      },
      { property: "og:title", content: "Distributor Stock & Outstanding — POPPiK SFA" },
      { property: "og:description", content: "Full stock statement and party outstanding for a distributor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DistributorNetworkDetailPage,
});

function DistributorNetworkDetailPage() {
  const { id } = Route.useParams();
  const [stockSearch, setStockSearch] = useState("");
  const [retSearch, setRetSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dist-network-detail", id],
    queryFn: async () => {
      const [dist, stock, retailers] = await Promise.all([
        supabase.from("distributors").select("id, name, city, state, phone, gstin").eq("id", id).maybeSingle(),
        supabase
          .from("distributor_stock")
          .select("id, physical_qty, reserved_qty, batch_no, products(name, sku, ptr)")
          .eq("distributor_id", id),
        supabase.from("retailers").select("id, name, city, area, pincode, outstanding").eq("distributor_id", id),
      ]);
      return { dist: dist.data, stock: stock.data ?? [], retailers: retailers.data ?? [] };
    },
  });

  const distributor = data?.dist;
  const distName = distributor?.name ?? "Distributor";

  const allStock = useMemo(
    () =>
      (data?.stock ?? []).map((s) => {
        const p = s.products as { name: string; sku: string; ptr: number } | null;
        const qty = Number(s.physical_qty ?? 0);
        return {
          id: s.id,
          name: p?.name ?? "Product",
          sku: p?.sku ?? "—",
          batch: s.batch_no ?? "",
          qty,
          available: qty - Number(s.reserved_qty ?? 0),
          value: qty * Number(p?.ptr ?? 0),
        };
      }),
    [data?.stock],
  );

  const allRetailers = useMemo(
    () =>
      (data?.retailers ?? [])
        .map((r) => ({
          id: r.id,
          name: r.name,
          sub: [r.city, (r as { area?: string | null }).area, (r as { pincode?: string | null }).pincode]
            .filter(Boolean)
            .join(" • "),
          outstanding: Number(r.outstanding ?? 0),
        }))
        .sort((a, b) => b.outstanding - a.outstanding),
    [data?.retailers],
  );

  const stockRows = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    return allStock.filter((r) => !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q));
  }, [allStock, stockSearch]);

  const retailerRows = useMemo(() => {
    const q = retSearch.trim().toLowerCase();
    return allRetailers.filter((r) => !q || r.name.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q));
  }, [allRetailers, retSearch]);

  const stockValue = allStock.reduce((s, r) => s + r.value, 0);
  const outstandingTotal = allRetailers.reduce((s, r) => s + r.outstanding, 0);
  const slug = distName.replace(/\s+/g, "-").toLowerCase();
  const subtitle = [distributor?.city, distributor?.state, distributor?.phone, distributor?.gstin]
    .filter(Boolean)
    .join(" • ");

  const exportStock = () =>
    downloadReportPdf({
      fileName: `poppik-stock-statement-${slug}.pdf`,
      title: `Stock Statement — ${distName}`,
      subtitle,
      meta: [`Line items: ${stockRows.length}`, `Total stock value: ${inr(stockRows.reduce((s, r) => s + r.value, 0))}`],
      tables: [
        {
          title: "Product-wise Stock",
          head: ["Product", "SKU", "Batch", "Qty", "Available", "Value"],
          align: ["left", "left", "left", "right", "right", "right"],
          rows: stockRows.map((r) => [r.name, r.sku, r.batch || "—", r.qty, r.available, rs(r.value)]),
        },
      ],
    });

  const exportOutstanding = () =>
    downloadReportPdf({
      fileName: `poppik-party-outstanding-${slug}.pdf`,
      title: `Party Outstanding — ${distName}`,
      subtitle,
      meta: [
        `Retailers: ${retailerRows.length}`,
        `Total outstanding: ${inr(retailerRows.reduce((s, r) => s + r.outstanding, 0))}`,
      ],
      tables: [
        {
          title: "Retailer-wise Outstanding",
          head: ["Retailer", "City / Area / Pincode", "Outstanding"],
          align: ["left", "left", "right"],
          rows: retailerRows.map((r) => [r.name, r.sub || "—", rs(r.outstanding)]),
        },
      ],
    });

  return (
    <Shell title={distName} subtitle="Stock statement & party outstanding">
      <div className="space-y-4 p-3">
        <Link to="/admin">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to panel
          </Button>
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard label="Stock value" value={inr(stockValue)} />
          <StatCard label="Retailer outstanding" value={inr(outstandingTotal)} />
        </div>

        <Tabs defaultValue="stock">
          <TabsList>
            <TabsTrigger value="stock">Stock Statement</TabsTrigger>
            <TabsTrigger value="outstanding">Party Outstanding</TabsTrigger>
          </TabsList>

          <TabsContent value="stock">
            <Section title={`Stock Statement — ${stockRows.length} items`}>
              <div className="space-y-3 p-3">
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-48 flex-1"
                    placeholder="Search product or SKU"
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                  />
                  <Button variant="outline" className="gap-2" onClick={exportStock}>
                    <Download className="h-4 w-4" /> Download PDF
                  </Button>
                </div>
                <div className="divide-y divide-border/60 rounded-md border">
                  {isLoading ? (
                    <p className="p-3 text-sm text-muted-foreground">Loading…</p>
                  ) : stockRows.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No stock found.</p>
                  ) : (
                    stockRows.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {r.sku}
                            {r.batch ? ` • Batch ${r.batch}` : ""} • Qty {r.qty} • Available {r.available}
                          </p>
                        </div>
                        <span className="shrink-0 tabular-nums">{inr(r.value)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="outstanding">
            <Section title={`Party Outstanding — ${retailerRows.length} retailers`}>
              <div className="space-y-3 p-3">
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-48 flex-1"
                    placeholder="Search retailer, city, area"
                    value={retSearch}
                    onChange={(e) => setRetSearch(e.target.value)}
                  />
                  <Button variant="outline" className="gap-2" onClick={exportOutstanding}>
                    <Download className="h-4 w-4" /> Download PDF
                  </Button>
                </div>
                <div className="divide-y divide-border/60 rounded-md border">
                  {isLoading ? (
                    <p className="p-3 text-sm text-muted-foreground">Loading…</p>
                  ) : retailerRows.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No mapped retailers found.</p>
                  ) : (
                    retailerRows.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{r.sub || "—"}</p>
                        </div>
                        <span className="shrink-0 tabular-nums text-destructive">{inr(r.outstanding)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}
