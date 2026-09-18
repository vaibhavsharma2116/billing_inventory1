import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, Download, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr, compactInr, incentiveFor, INCENTIVE_SLABS } from "@/lib/sfa";
import { downloadReportPdf, rs, type PdfTable } from "@/lib/report-pdf";

export const Route = createFileRoute("/_authenticated/ba-report")({
  head: () => ({
    meta: [
      { title: "BA Reports — POPPiK SFA" },
      { name: "description", content: "Beauty advisor reports: product wise sales, day wise sales, target vs achievement, incentive, attendance and salary slip PDF." },
      { property: "og:title", content: "BA Reports — POPPiK SFA" },
      { property: "og:description", content: "Counter performance, incentive calculation, attendance register and salary slip download." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BaReportPage,
});

function monthOptions() {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y!, m! - 1, 1));
  const to = new Date(Date.UTC(y!, m!, 1));
  return { fromDate: from.toISOString().slice(0, 10), toDate: to.toISOString().slice(0, 10) };
}

const sum = (rows: number[]) => rows.reduce((s, n) => s + n, 0);

function BaReportPage() {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0]!.value);
  const { data: me } = useMe();
  const userId = me?.profile?.id;
  const outletId = (me?.profile as { retailer_id?: string | null } | undefined)?.retailer_id ?? null;
  const range = monthRange(month);

  const { data, isLoading } = useQuery({
    queryKey: ["ba-report", month, userId, outletId],
    enabled: !!userId,
    queryFn: async () => {
      const [sales, attendance, salary, targets, outlet] = await Promise.all([
        supabase
          .from("ba_sales")
          .select("sale_date, qty, rate, amount, products(name, sku)")
          .eq("ba_id", userId!)
          .gte("sale_date", range.fromDate)
          .lt("sale_date", range.toDate)
          .order("sale_date"),
        supabase
          .from("attendance")
          .select("work_date, punch_in, punch_out, location_label")
          .eq("user_id", userId!)
          .gte("work_date", range.fromDate)
          .lt("work_date", range.toDate)
          .order("work_date"),
        supabase
          .from("salary_structures")
          .select("*")
          .eq("user_id", userId!)
          .lte("effective_from", range.fromDate)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("targets").select("target_amount, period_month").eq("user_id", userId!),
        outletId
          ? supabase.from("retailers").select("name, city").eq("id", outletId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        sales: sales.data ?? [],
        attendance: attendance.data ?? [],
        salary: salary.data,
        targets: targets.data ?? [],
        outlet: outlet.data as { name: string; city: string | null } | null,
      };
    },
  });

  const sales = data?.sales ?? [];
  const totalSale = sum(sales.map((r) => Number(r.amount)));
  const totalUnits = sum(sales.map((r) => Number(r.qty)));

  const byProductMap = new Map<string, { qty: number; value: number }>();
  for (const r of sales) {
    const key = (r.products as { name?: string } | null)?.name ?? "Unknown";
    const prev = byProductMap.get(key) ?? { qty: 0, value: 0 };
    byProductMap.set(key, { qty: prev.qty + Number(r.qty), value: prev.value + Number(r.amount) });
  }
  const byProduct = Array.from(byProductMap.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.value - a.value);

  const byDayMap = new Map<string, { qty: number; value: number }>();
  for (const r of sales) {
    const key = r.sale_date;
    const prev = byDayMap.get(key) ?? { qty: 0, value: 0 };
    byDayMap.set(key, { qty: prev.qty + Number(r.qty), value: prev.value + Number(r.amount) });
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => (a.label < b.label ? 1 : -1));

  const attendance = data?.attendance ?? [];
  const presentDays = attendance.filter((a) => a.punch_in).length;

  const monthTarget = (data?.targets ?? []).find((t) => String(t.period_month).slice(0, 7) === month);
  const targetAmount = Number(monthTarget?.target_amount ?? 0);
  const { achievement, slab, amount: incentive } = incentiveFor(totalSale, targetAmount);

  const s = data?.salary;
  const earnings = s
    ? {
        basic: Number(s.basic),
        hra: Number(s.hra),
        conveyance: Number(s.conveyance),
        other: Number(s.other_allowance),
        deductions: Number(s.deductions),
      }
    : null;
  const gross = earnings ? earnings.basic + earnings.hra + earnings.conveyance + earnings.other : 0;
  const netPay = earnings ? gross - earnings.deductions + incentive : 0;

  const monthLabel = months.find((m) => m.value === month)?.label ?? month;
  const outlet = data?.outlet ?? null;

  const tables: Record<string, PdfTable> = {
    product: {
      title: "Product wise sales",
      head: ["Product", "Qty", "Value"],
      rows: byProduct.map((r) => [r.label, r.qty, rs(r.value)]),
    },
    day: {
      title: "Day wise sales",
      head: ["Date", "Qty", "Value"],
      rows: byDay.map((r) => [r.label, r.qty, rs(r.value)]),
    },
    target: {
      title: "Target vs achievement & incentive",
      head: ["Particular", "Value"],
      rows: [
        ["Target", rs(targetAmount)],
        ["Achieved sale", rs(totalSale)],
        ["Achievement", `${achievement.toFixed(1)}%`],
        ["Incentive slab", slab.label],
        ["Incentive earned", rs(incentive)],
      ],
    },
    attendance: {
      title: "Attendance register",
      head: ["Date", "Check in", "Check out", "Location"],
      align: ["left", "left", "left", "left"],
      rows: attendance.map((a) => [
        a.work_date,
        a.punch_in ? new Date(a.punch_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-",
        a.punch_out ? new Date(a.punch_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-",
        a.location_label ?? "-",
      ]),
    },
    salary: {
      title: `Salary slip — ${monthLabel}`,
      head: ["Component", "Amount"],
      rows: earnings
        ? [
            ["Basic", rs(earnings.basic)],
            ["HRA", rs(earnings.hra)],
            ["Conveyance", rs(earnings.conveyance)],
            ["Other allowance", rs(earnings.other)],
            ["Gross earnings", rs(gross)],
            ["Deductions", "-" + rs(earnings.deductions)],
            ["Incentive", rs(incentive)],
            ["Net payable", rs(netPay)],
          ]
        : [],
    },
  };

  const meta = [
    `Beauty Advisor: ${me?.profile?.full_name ?? "-"}`,
    `Outlet: ${outlet ? `${outlet.name}${outlet.city ? `, ${outlet.city}` : ""}` : "Not assigned"}`,
    `Period: ${monthLabel}`,
    `Counter sale: ${rs(totalSale)}   |   Units: ${totalUnits}`,
    `Target: ${rs(targetAmount)}   |   Achievement: ${achievement.toFixed(1)}%   |   Incentive: ${rs(incentive)}`,
    `Present days: ${presentDays}`,
  ];

  const downloadAll = () =>
    downloadReportPdf({
      fileName: `poppik-ba-report-${month}.pdf`,
      title: "Beauty Advisor Report",
      subtitle: monthLabel,
      meta,
      tables: Object.values(tables),
    });

  const downloadOne = (key: keyof typeof tables) =>
    downloadReportPdf({
      fileName: `poppik-ba-${String(key)}-${month}.pdf`,
      title: tables[key]!.title,
      subtitle: monthLabel,
      meta: meta.slice(0, 3),
      tables: [tables[key]!],
    });

  const DownloadBtn = ({ k }: { k: keyof typeof tables }) => (
    <Button size="sm" variant="outline" onClick={() => downloadOne(k)}>
      <Download className="size-4" /> PDF
    </Button>
  );

  const Rows = ({ rows, unit }: { rows: { label: string; qty: number; value: number }[]; unit: string }) => (
    <div className="divide-y divide-border/60">
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No sales in this period.</p>
      ) : (
        rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">
                {r.qty} {unit}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{inr(r.value)}</span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <Shell
      mobile
      title="My Reports"
      subtitle={outlet ? `${outlet.name} • counter performance` : "Counter performance"}
      nav={[
        { to: "/ba", label: "Counter", icon: CalendarDays },
        { to: "/order-booking", label: "Book Order", icon: ShoppingBag },
        { to: "/ba-report", label: "Reports", icon: BarChart3 },
      ]}
    >
      <div className="flex items-center gap-2">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={downloadAll}>
          <Download className="size-4" /> Full PDF
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatCard label="Counter Sale" value={compactInr(totalSale)} tone="primary" hint={`${totalUnits} pcs`} />
        <StatCard label="Target" value={compactInr(targetAmount)} hint={monthLabel} />
        <StatCard
          label="Achievement"
          value={`${achievement.toFixed(0)}%`}
          tone={achievement >= 100 ? "success" : "warning"}
        />
        <StatCard label="Incentive" value={compactInr(incentive)} tone={incentive > 0 ? "success" : "warning"} hint={`${slab.pct}% slab`} />
        <StatCard label="Present Days" value={String(presentDays)} />
        <StatCard label="Net Salary" value={compactInr(netPay)} tone="success" hint={monthLabel} />
      </div>

      {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading report…</p> : null}

      <Tabs defaultValue="sales" className="mt-5">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="target">Target</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <Section title="Product wise sales" action={<DownloadBtn k="product" />}>
            <Rows rows={byProduct} unit="pcs" />
          </Section>
          <Section title="Day wise sales" action={<DownloadBtn k="day" />}>
            <Rows rows={byDay} unit="pcs" />
          </Section>
        </TabsContent>

        <TabsContent value="target">
          <Section title="Target vs achievement" action={<DownloadBtn k="target" />}>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Target</span>
                <span className="font-semibold">{inr(targetAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Achieved</span>
                <span className="font-semibold">{inr(totalSale)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[image:var(--gradient-brand)]"
                  style={{ width: `${Math.min(achievement, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <Badge variant={achievement >= 100 ? "default" : "secondary"}>{achievement.toFixed(1)}% achieved</Badge>
                <span className="text-sm font-semibold">Incentive {inr(incentive)}</span>
              </div>
            </div>
          </Section>

          <Section title="Incentive plan">
            <div className="divide-y divide-border/60">
              {INCENTIVE_SLABS.map((sl) => (
                <div key={sl.label} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className={sl.minPct === slab.minPct ? "font-semibold text-primary" : "text-muted-foreground"}>
                    {sl.label}
                  </span>
                  {sl.minPct === slab.minPct ? <Badge>Your slab</Badge> : null}
                </div>
              ))}
            </div>
            <p className="p-3 pt-0 text-xs text-muted-foreground">
              Incentive is calculated automatically on achieved counter sale and added to the salary slip.
            </p>
          </Section>
        </TabsContent>

        <TabsContent value="attendance">
          <Section title="Attendance register" action={<DownloadBtn k="attendance" />}>
            <div className="divide-y divide-border/60">
              {attendance.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No attendance recorded this month.</p>
              ) : (
                attendance.map((a) => (
                  <div key={a.work_date} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{a.work_date}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.location_label ?? "Store"}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p>In: {a.punch_in ? new Date(a.punch_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-"}</p>
                      <p>Out: {a.punch_out ? new Date(a.punch_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-"}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="salary">
          <Section title={`Salary slip — ${monthLabel}`} action={<DownloadBtn k="salary" />}>
            {earnings ? (
              <div className="divide-y divide-border/60 text-sm">
                {[
                  ["Basic", earnings.basic],
                  ["HRA", earnings.hra],
                  ["Conveyance", earnings.conveyance],
                  ["Other allowance", earnings.other],
                  ["Gross earnings", gross],
                  ["Deductions", -earnings.deductions],
                  ["Incentive", incentive],
                  ["Net payable", netPay],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between p-3">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold tabular-nums">{inr(Number(value))}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                Salary structure not set yet. Please ask admin to add it.
              </p>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
