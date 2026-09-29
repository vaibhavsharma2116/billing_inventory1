import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMappedDistributors } from "@/hooks/useMappedDistributors";
import { useMappedCsas } from "@/hooks/useMappedCsas";
import { Section } from "@/components/sfa/Shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useState } from "react";
import { downloadReportPdf } from "@/lib/report-pdf";

export function SalesmanStockReport() {
  const { data: mappedDistributors = [] } = useMappedDistributors();
  const { data: mappedCsas = [] } = useMappedCsas();
  const [q, setQ] = useState("");

  const distIds = mappedDistributors.map((d) => d.id);
  const csaIds = mappedCsas.map((c) => c.id);

  const { data: stock = [], isLoading } = useQuery({
    queryKey: ["salesman-stock", distIds, csaIds],
    enabled: true, // Only fetch if there's no error in mapping. It handles empty lists on backend anyway.
    queryFn: async () => {
      const [dStock, cStock] = await Promise.all([
        distIds.length
          ? supabase
              .from("distributor_stock")
              .select("physical_qty, products(name, sku), distributors(name)")
              .in("distributor_id", distIds)
          : Promise.resolve({ data: [] }),
        csaIds.length
          ? supabase
              .from("csa_stock")
              .select("physical_qty, products(name, sku), csa(name)")
              .in("csa_id", csaIds)
          : Promise.resolve({ data: [] }),
      ]);

      const rows: { product: string; sku: string; location: string; qty: number }[] = [];

      for (const row of dStock.data ?? []) {
        rows.push({
          product: (row.products as { name?: string } | null)?.name ?? "Unknown",
          sku: (row.products as { sku?: string } | null)?.sku ?? "",
          location: `${(row.distributors as { name?: string } | null)?.name ?? "Unknown"} (Distributor)`,
          qty: row.physical_qty,
        });
      }

      for (const row of cStock.data ?? []) {
        rows.push({
          product: (row.products as { name?: string } | null)?.name ?? "Unknown",
          sku: (row.products as { sku?: string } | null)?.sku ?? "",
          location: `${(row.csa as { name?: string } | null)?.name ?? "Unknown"} (CSA)`,
          qty: row.physical_qty,
        });
      }

      return rows.sort((a, b) => a.product.localeCompare(b.product));
    },
  });

  const query = q.trim().toLowerCase();
  const filtered = query
    ? stock.filter(
        (r) =>
          r.product.toLowerCase().includes(query) ||
          r.sku.toLowerCase().includes(query) ||
          r.location.toLowerCase().includes(query)
      )
    : stock;

  const downloadPdf = () => {
    downloadReportPdf({
      fileName: `stock-statement.pdf`,
      title: "Mapped Stock Statement",
      subtitle: new Date().toLocaleDateString("en-IN"),
      meta: [`Total items: ${filtered.length}`, `Distributors mapped: ${distIds.length}`, `CSAs mapped: ${csaIds.length}`],
      tables: [
        {
          title: "Current Physical Stock",
          head: ["Product / SKU", "Location", "Qty"],
          align: ["left", "left", "right"],
          rows: filtered.map((r) => [`${r.product}\n${r.sku}`, r.location, String(r.qty)]),
        },
      ],
    });
  };

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search product / location…"
          className="h-9"
        />
        {q ? (
          <Button size="sm" variant="ghost" onClick={() => setQ("")}>
            Clear
          </Button>
        ) : null}
      </div>
      <Section
        title="Current Stock Statement"
        action={
          <Button size="sm" variant="outline" onClick={downloadPdf} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> PDF
          </Button>
        }
      >
        <div className="divide-y divide-border/60">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading stock…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No stock available or found.</p>
          ) : (
            filtered.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.product}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.sku} • {r.location}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-semibold">{r.qty}</span>
                  <span className="ml-1 text-[11px] text-muted-foreground">pcs</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  );
}
