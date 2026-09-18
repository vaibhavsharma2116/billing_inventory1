import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, Download, Receipt, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr, compactInr } from "@/lib/sfa";
import { downloadReportPdf, rs, type PdfTable } from "@/lib/report-pdf";

export const Route = createFileRoute("/_authenticated/my-report")({
  head: () => ({
    meta: [
      { title: "My Reports — POPPiK SFA" },
      { name: "description", content: "Salesman reports: outlet type wise, city wise, distributor wise sales, attendance, expenses and salary slip with PDF download." },
      { property: "og:title", content: "My Reports — POPPiK SFA" },
      { property: "og:description", content: "Complete field performance, attendance, expense and salary reporting for salesmen." },
    ],
  }),
  component: MyReportPage,
});

const TYPE_LABEL: Record<string, string> = { ba: "BA Outlet", rba: "RBA Outlet", no_ba: "Retail Outlet" };

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
  return { from: from.toISOString(), to: to.toISOString(), fromDate: from.toISOString().slice(0, 10), toDate: to.toISOString().slice(0, 10) };
}

const sum = (rows: number[]) => rows.reduce((s, n) => s + n, 0);

function MyReportPage() {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0]!.value);
  const [salesQ, setSalesQ] = useState("");
  const [attQ, setAttQ] = useState("");
  const { data: me } = useMe();
  const userId = me?.profile?.id;
  const range = monthRange(month);

  const { data, isLoading } = useQuery({
    queryKey: ["my-report", month, userId],
    enabled: !!userId,
    queryFn: async () => {
      const [orders, profiles, attendance, expenses, salary, targets, collections] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, order_no, kind, status, total_amount, created_at, salesman_id, retailers(name, city, retailer_type, distributors(name))",
          )
          .gte("created_at", range.from)
          .lt("created_at", range.to),
        supabase.from("profiles").select("id, full_name, employee_code, designation"),
        supabase
          .from("attendance")
          .select("work_date, punch_in, punch_out, location_label")
          .eq("user_id", userId!)
          .gte("work_date", range.fromDate)
          .lt("work_date", range.toDate)
          .order("work_date"),
        supabase
          .from("expenses")
          .select("expense_date, kind, distance_km, ta_amount, da_amount, bill_amount, total_amount, status, route, vendor")
          .eq("user_id", userId!)
          .gte("expense_date", range.fromDate)
          .lt("expense_date", range.toDate)
          .order("expense_date"),
        supabase
          .from("salary_structures")
          .select("*")
          .eq("user_id", userId!)
          .lte("effective_from", range.fromDate)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("targets").select("target_amount, visits_target, period_month").eq("user_id", userId!),
        supabase.from("collections").select("amount, created_at").eq("salesman_id", userId!).gte("created_at", range.from).lt("created_at", range.to),
      ]);
      return {
        orders: orders.data ?? [],
        profiles: profiles.data ?? [],
        attendance: attendance.data ?? [],
        expenses: expenses.data ?? [],
        salary: salary.data ?? null,
        targets: targets.data ?? [],
        collections: collections.data ?? [],
      };
    },
  });

  const allOrders = data?.orders ?? [];
  const myOrders = allOrders.filter((o) => o.salesman_id === userId);
  const mySales = sum(myOrders.map((o) => Number(o.total_amount)));
  const nameOf = new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name]));

  const group = (rows: typeof allOrders, key: (o: (typeof allOrders)[number]) => string) => {
    const map = new Map<string, { value: number; orders: number }>();
    for (const o of rows) {
      const k = key(o) || "Unknown";
      const prev = map.get(k) ?? { value: 0, orders: 0 };
      map.set(k, { value: prev.value + Number(o.total_amount), orders: prev.orders + 1 });
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.value - a.value);
  };

  const byType = group(myOrders, (o) => TYPE_LABEL[o.retailers?.retailer_type ?? "no_ba"] ?? "Retail Outlet");
  const byCity = group(myOrders, (o) => o.retailers?.city ?? "Unknown");
  const byDistributor = group(myOrders, (o) => o.retailers?.distributors?.name ?? "Unmapped");
  const byOutlet = group(myOrders, (o) => o.retailers?.name ?? "Unknown");
  const bySalesman = group(allOrders.filter((o) => o.salesman_id), (o) => nameOf.get(o.salesman_id!) ?? "Unknown");

  const attendance = data?.attendance ?? [];
  const presentDays = attendance.filter((a) => a.punch_in).length;
  const expenses = data?.expenses ?? [];
  const expenseTotal = sum(expenses.map((e) => Number(e.total_amount ?? 0)));
  const expenseApproved = sum(expenses.filter((e) => e.status === "approved").map((e) => Number(e.total_amount ?? 0)));
  const collectionTotal = sum((data?.collections ?? []).map((c) => Number(c.amount)));

  const monthTarget = (data?.targets ?? []).find((t) => String(t.period_month).slice(0, 7) === month);
  const targetAmount = Number(monthTarget?.target_amount ?? 0);
  const achievement = targetAmount > 0 ? (mySales / targetAmount) * 100 : 0;

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
  const netPay = earnings ? gross - earnings.deductions + expenseApproved : 0;

  const fq = salesQ.trim().toLowerCase();
  const flt = (rows: { label: string; orders: number; value: number }[]) =>
    fq ? rows.filter((r) => r.label.toLowerCase().includes(fq)) : rows;
  const fType = flt(byType);
  const fOutlet = flt(byOutlet);
  const fCity = flt(byCity);
  const fDistributor = flt(byDistributor);
  const fSalesman = flt(bySalesman);

  const aq = attQ.trim().toLowerCase();
  const fAttendance = aq
    ? attendance.filter((a) => `${a.work_date} ${a.location_label ?? ""}`.toLowerCase().includes(aq))
    : attendance;
  const fExpenses = aq
    ? expenses.filter((e) => `${e.expense_date} ${e.kind} ${e.status} ${e.route ?? ""} ${e.vendor ?? ""}`.toLowerCase().includes(aq))
    : expenses;

  const monthLabel = months.find((m) => m.value === month)?.label ?? month;

  const tables: Record<string, PdfTable> = {
    type: { title: "Outlet type wise sales", head: ["Outlet type", "Orders", "Value"], rows: fType.map((r) => [r.label, r.orders, rs(r.value)]) },
    outlet: { title: "Outlet wise sales", head: ["Outlet", "Orders", "Value"], rows: fOutlet.map((r) => [r.label, r.orders, rs(r.value)]) },
    city: { title: "City wise sales", head: ["City", "Orders", "Value"], rows: fCity.map((r) => [r.label, r.orders, rs(r.value)]) },
    distributor: { title: "Distributor wise sales", head: ["Distributor", "Orders", "Value"], rows: fDistributor.map((r) => [r.label, r.orders, rs(r.value)]) },
    salesman: { title: "Salesman wise sales (team)", head: ["Salesman", "Orders", "Value"], rows: fSalesman.map((r) => [r.label, r.orders, rs(r.value)]) },
    attendance: {
      title: "Attendance register",
      head: ["Date", "Punch in", "Punch out", "Location"],
      align: ["left", "left", "left", "left"],
      rows: fAttendance.map((a) => [
        a.work_date,
        a.punch_in ? new Date(a.punch_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-",
        a.punch_out ? new Date(a.punch_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-",
        a.location_label ?? "-",
      ]),
    },
    expenses: {
      title: "Expense report",
      head: ["Date", "Type", "Status", "Amount"],
      align: ["left", "left", "left", "right"],
      rows: fExpenses.map((e) => [e.expense_date, e.kind, e.status, rs(Number(e.total_amount ?? 0))]),
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
            ["Approved expense reimbursement", rs(expenseApproved)],
            ["Net payable", rs(netPay)],
          ]
        : [],
    },
  };

  const meta = [
    `Salesman: ${me?.profile?.full_name ?? "-"}${me?.profile?.employee_code ? ` (${me.profile.employee_code})` : ""}`,
    `Period: ${monthLabel}`,
    `My sales: ${rs(mySales)}   |   Collections: ${rs(collectionTotal)}   |   Orders: ${myOrders.length}`,
    `Target: ${rs(targetAmount)}   |   Achievement: ${achievement.toFixed(1)}%`,
    `Present days: ${presentDays}   |   Expenses: ${rs(expenseTotal)} (approved ${rs(expenseApproved)})`,
  ];

  const downloadAll = () =>
    downloadReportPdf({
      fileName: `poppik-report-${month}.pdf`,
      title: "Salesman Report",
      subtitle: monthLabel,
      meta,
      tables: Object.values(tables),
    });

  const downloadOne = (key: keyof typeof tables) =>
    downloadReportPdf({
      fileName: `poppik-${String(key)}-${month}.pdf`,
      title: tables[key]!.title,
      subtitle: monthLabel,
      meta: meta.slice(0, 2),
      tables: [tables[key]!],
    });

  const Rows = ({ rows }: { rows: { label: string; orders: number; value: number }[] }) => (
    <div className="divide-y divide-border/60">
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No sales in this period.</p>
      ) : (
        rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.orders} orders</p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{inr(r.value)}</span>
          </div>
        ))
      )}
    </div>
  );

  const DownloadBtn = ({ k }: { k: keyof typeof tables }) => (
    <Button size="sm" variant="outline" onClick={() => downloadOne(k)}>
      <Download className="size-4" /> PDF
    </Button>
  );

  return (
    <Shell
      title="My Reports"
      subtitle="Sales • Attendance • Expenses • Salary"
      mobile
      nav={[
        { to: "/salesman", label: "Today", icon: CalendarDays },
        { to: "/order-booking", label: "Book Order", icon: ShoppingCart },
        { to: "/expenses", label: "Expenses", icon: Receipt },
        { to: "/my-report", label: "Reports", icon: BarChart3 },
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
        <StatCard label="My Sales" value={compactInr(mySales)} tone="primary" hint={`${myOrders.length} orders`} />
        <StatCard label="Collection" value={compactInr(collectionTotal)} tone="success" />
        <StatCard label="Achievement" value={`${achievement.toFixed(0)}%`} tone={achievement >= 100 ? "success" : "warning"} hint={`Target ${compactInr(targetAmount)}`} />
        <StatCard label="Present Days" value={String(presentDays)} />
        <StatCard label="Expenses" value={compactInr(expenseTotal)} tone="warning" hint={`Approved ${compactInr(expenseApproved)}`} />
        <StatCard label="Net Salary" value={compactInr(netPay)} tone="success" hint={monthLabel} />
      </div>

      {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading report…</p> : null}

      <Tabs defaultValue="type" className="mt-5">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="type">Sales</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
        </TabsList>

        <TabsContent value="type">
          <div className="mb-3 mt-3 flex items-center gap-2">
            <Input value={salesQ} onChange={(e) => setSalesQ(e.target.value)} placeholder="Search outlet / city / distributor…" className="h-9" />
            {salesQ ? (
              <Button size="sm" variant="ghost" onClick={() => setSalesQ("")}>
                Clear
              </Button>
            ) : null}
          </div>
          <Section title="Outlet type wise" action={<DownloadBtn k="type" />}>
            <Rows rows={fType} />
          </Section>
          <Section title="Outlet wise" action={<DownloadBtn k="outlet" />}>
            <Rows rows={fOutlet} />
          </Section>
          <Section title="City wise" action={<DownloadBtn k="city" />}>
            <Rows rows={fCity} />
          </Section>
          <Section title="Distributor wise" action={<DownloadBtn k="distributor" />}>
            <Rows rows={fDistributor} />
          </Section>
          <Section title="Salesman wise (team)" action={<DownloadBtn k="salesman" />}>
            <Rows rows={fSalesman} />
          </Section>
        </TabsContent>

        <TabsContent value="attendance">
          <div className="mb-3 mt-3 flex items-center gap-2">
            <Input value={attQ} onChange={(e) => setAttQ(e.target.value)} placeholder="Search date / location / expense type…" className="h-9" />
            {attQ ? (
              <Button size="sm" variant="ghost" onClick={() => setAttQ("")}>
                Clear
              </Button>
            ) : null}
          </div>
          <Section title={`Attendance — ${presentDays} present days`} action={<DownloadBtn k="attendance" />}>
            <div className="divide-y divide-border/60">
              {fAttendance.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No attendance records this month.</p>
              ) : (
                fAttendance.map((a) => (
                  <div key={a.work_date} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.work_date}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.location_label ?? "Location not captured"}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {a.punch_in ? new Date(a.punch_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-"} →{" "}
                      {a.punch_out ? new Date(a.punch_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Expense report" action={<DownloadBtn k="expenses" />}>
            <div className="divide-y divide-border/60">
              {fExpenses.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No expense claims this month.</p>
              ) : (
                fExpenses.map((e, i) => (
                  <div key={`${e.expense_date}-${i}`} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{e.kind.replace("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">{e.expense_date}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={e.status === "approved" ? "default" : "secondary"}>{e.status}</Badge>
                      <span className="text-sm font-semibold tabular-nums">{inr(Number(e.total_amount ?? 0))}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="salary">
          <Section title={`Salary slip — ${monthLabel}`} action={<DownloadBtn k="salary" />}>
            {!earnings ? (
              <p className="p-4 text-sm text-muted-foreground">
                Salary structure not set for your account yet. Ask admin to configure it.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {[
                  ["Basic", earnings.basic],
                  ["HRA", earnings.hra],
                  ["Conveyance", earnings.conveyance],
                  ["Other allowance", earnings.other],
                  ["Gross earnings", gross],
                  ["Deductions", -earnings.deductions],
                  ["Expense reimbursement (approved)", expenseApproved],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between p-3 text-sm">
                    <span className={label === "Gross earnings" ? "font-semibold" : "text-muted-foreground"}>{label}</span>
                    <span className="font-medium tabular-nums">{inr(Number(value))}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3">
                  <span className="text-sm font-semibold">Net payable</span>
                  <span className="text-base font-bold tabular-nums text-success">{inr(netPay)}</span>
                </div>
              </div>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
