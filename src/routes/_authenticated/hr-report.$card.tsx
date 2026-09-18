import { useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useMe, roleHome } from "@/hooks/useAuth";
import { inr } from "@/lib/sfa";
import { downloadReportPdf } from "@/lib/report-pdf";
import { useReportFilters } from "@/components/sfa/ReportFilterBar";

export const Route = createFileRoute("/_authenticated/hr-report/$card")({
  head: () => ({
    meta: [
      { title: "HR Detail Report — POPPiK SFA" },
      {
        name: "description",
        content: "HR drill-down reports for employees, attendance, leave approvals, expense claims and payroll with PDF download.",
      },
      { property: "og:title", content: "HR Detail Report — POPPiK SFA" },
      { property: "og:description", content: "Employee, attendance, leave, expense and payroll detail with PDF export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HrReportRoute,
});

const day = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("en-IN") : "—");
const time = (v: string | null | undefined) => (v ? new Date(v).toLocaleTimeString("en-IN") : "—");
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const todayStr = () => new Date().toISOString().slice(0, 10);

type Row = { key: string; label: string; sub: string; value: string };

function HrReportRoute() {
  const { data: me, isLoading, sessionLoading } = useMe();
  if (isLoading || sessionLoading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading your workspace…
      </div>
    );
  }
  if (me.role !== "hr" && me.role !== "super_admin") {
    return <Navigate to={roleHome[me.role]} replace />;
  }
  return <HrReportPage />;
}

function HrReportPage() {
  const { card } = Route.useParams();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());

  const { data, isLoading } = useQuery({
    queryKey: ["hr-report", from, to],
    queryFn: async () => {
      const [profiles, details, attendance, leaves, expenses, salaries] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone, designation, employee_code").order("full_name"),
        supabase.from("employee_details").select("*"),
        supabase
          .from("attendance")
          .select("id, user_id, work_date, punch_in, punch_out, location_label")
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date", { ascending: false }),
        supabase
          .from("leaves")
          .select("id, user_id, leave_type, from_date, to_date, status, reason, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("expenses")
          .select("id, user_id, expense_date, kind, ta_amount, da_amount, bill_amount, total_amount, route, vendor, status")
          .gte("expense_date", from)
          .lte("expense_date", to)
          .order("expense_date", { ascending: false }),
        supabase.from("salary_structures").select("*").order("effective_from", { ascending: false }),
      ]);
      return {
        profiles: profiles.data ?? [],
        details: details.data ?? [],
        attendance: attendance.data ?? [],
        leaves: leaves.data ?? [],
        expenses: expenses.data ?? [],
        salaries: salaries.data ?? [],
      };
    },
  });

  const profiles = data?.profiles ?? [];
  const nameOf = (id: string | null | undefined) => profiles.find((p) => p.id === id)?.full_name ?? "Employee";
  const net = (r: { basic: number; hra: number; conveyance: number; other_allowance: number; deductions: number }) =>
    Number(r.basic ?? 0) + Number(r.hra ?? 0) + Number(r.conveyance ?? 0) + Number(r.other_allowance ?? 0) - Number(r.deductions ?? 0);

  const reports: Record<
    string,
    { title: string; description: string; columns: [string, string, string]; rows: Row[]; summary: { label: string; value: string }[] }
  > = {};

  if (data) {
    const details = data.details as Array<Record<string, unknown>>;
    const detailOf = (id: string) => details.find((d) => d["user_id"] === id);

    reports["employees"] = {
      title: "Employee Master",
      description: "All employees with department, designation and record completion status.",
      columns: ["Employee", "Department • Designation", "CTC (annual)"],
      summary: [
        { label: "Employees", value: String(profiles.length) },
        { label: "Records done", value: String(details.length) },
        { label: "Pending records", value: String(Math.max(0, profiles.length - details.length)) },
      ],
      rows: profiles.map((p) => {
        const d = detailOf(p.id);
        return {
          key: p.id,
          label: `${p.full_name}${p.employee_code ? ` (${p.employee_code})` : ""}`,
          sub: `${(d?.["department"] as string) ?? "—"} • ${(d?.["designation"] as string) ?? p.designation ?? "—"} • ${d ? "record complete" : "record pending"}`,
          value: inr(Number(d?.["ctc_annual"] ?? 0)),
        };
      }),
    };

    reports["records"] = {
      title: "Completed Employee Records",
      description: "Employees whose payroll master data has been captured.",
      columns: ["Employee", "Joining • Status • Bank", "CTC (annual)"],
      summary: [
        { label: "Completed", value: String(details.length) },
        { label: "Active", value: String(details.filter((d) => d["status"] === "active").length) },
        { label: "Pending", value: String(Math.max(0, profiles.length - details.length)) },
      ],
      rows: details.map((d, i) => ({
        key: String(d["id"] ?? i),
        label: nameOf(d["user_id"] as string),
        sub: `Joined ${day(d["date_of_joining"] as string)} • ${(d["status"] as string) ?? "—"} • ${(d["bank_name"] as string) ?? "No bank"}`,
        value: inr(Number(d["ctc_annual"] ?? 0)),
      })),
    };

    reports["attendance"] = {
      title: "Attendance Register",
      description: `Punch-in / punch-out records between ${day(from)} and ${day(to)}.`,
      columns: ["Employee", "Date • Punch in / out", "Location"],
      summary: [
        { label: "Records", value: String(data.attendance.length) },
        { label: "Punched in", value: String(data.attendance.filter((a) => a.punch_in).length) },
        { label: "Not closed", value: String(data.attendance.filter((a) => a.punch_in && !a.punch_out).length) },
      ],
      rows: data.attendance.map((a) => ({
        key: a.id,
        label: nameOf(a.user_id),
        sub: `${day(a.work_date)} • ${time(a.punch_in)} → ${time(a.punch_out)}`,
        value: a.location_label ?? "—",
      })),
    };

    reports["leaves"] = {
      title: "Leave Requests",
      description: "All leave applications with status; pending ones need HR action on the HR desk.",
      columns: ["Employee", "Type • Dates • Reason", "Status"],
      summary: [
        { label: "Total", value: String(data.leaves.length) },
        { label: "Pending", value: String(data.leaves.filter((l) => l.status === "pending").length) },
        { label: "Approved", value: String(data.leaves.filter((l) => l.status === "approved").length) },
      ],
      rows: data.leaves.map((l) => ({
        key: l.id,
        label: nameOf(l.user_id),
        sub: `${l.leave_type} • ${day(l.from_date)} → ${day(l.to_date)}${l.reason ? ` • ${l.reason}` : ""}`,
        value: l.status,
      })),
    };

    reports["expenses"] = {
      title: "Expense Claims",
      description: `TA / DA and bill claims between ${day(from)} and ${day(to)}.`,
      columns: ["Employee", "Date • Type • TA/DA/Bill", "Total"],
      summary: [
        { label: "Claims", value: String(data.expenses.length) },
        { label: "Pending", value: String(data.expenses.filter((e) => e.status === "pending").length) },
        { label: "Value", value: inr(data.expenses.reduce((s, e) => s + Number(e.total_amount ?? 0), 0)) },
      ],
      rows: data.expenses.map((e) => ({
        key: e.id,
        label: nameOf(e.user_id),
        sub: `${day(e.expense_date)} • ${e.kind} • ${inr(Number(e.ta_amount ?? 0))}/${inr(Number(e.da_amount ?? 0))}/${inr(Number(e.bill_amount ?? 0))} • ${e.status}`,
        value: inr(Number(e.total_amount ?? 0)),
      })),
    };

    reports["payroll"] = {
      title: "Monthly Payroll",
      description: "Salary structures with monthly net payable per employee.",
      columns: ["Employee", "Basic • HRA • Conveyance • Deductions", "Net / month"],
      summary: [
        { label: "Records", value: String(data.salaries.length) },
        { label: "Monthly net", value: inr(data.salaries.reduce((s, r) => s + net(r), 0)) },
        { label: "Annual", value: inr(data.salaries.reduce((s, r) => s + net(r), 0) * 12) },
      ],
      rows: data.salaries.map((r) => ({
        key: r.id,
        label: nameOf(r.user_id),
        sub: `${inr(Number(r.basic))} • ${inr(Number(r.hra))} • ${inr(Number(r.conveyance))} • -${inr(Number(r.deductions))} (w.e.f ${day(r.effective_from)})`,
        value: inr(net(r)),
      })),
    };
  }

  const report = reports[card] ?? null;
  const { filtered: rows, bar } = useReportFilters(report?.rows ?? [], card);

  const exportPdf = () => {
    if (!report) return;
    downloadReportPdf({
      fileName: `poppik-hr-${card}-report.pdf`,
      title: report.title,
      subtitle: report.description,
      meta: [`Records: ${rows.length}`, `Period: ${day(from)} — ${day(to)}`, `Generated: ${new Date().toLocaleString("en-IN")}`],
      tables: [
        {
          title: report.title,
          head: [report.columns[0], report.columns[1], report.columns[2]],
          rows: rows.map((r) => [r.label, r.sub, r.value]),
          align: ["left", "left", "right"],
        },
      ],
    }).catch((e: Error) => toast.error(e.message));
  };

  return (
    <Shell title={report?.title ?? "HR Detail Report"} subtitle={report?.description ?? "HR workspace drill-down"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/hr">
            <ArrowLeft className="mr-1 size-3.5" /> Back to HR desk
          </Link>
        </Button>
        <Button size="sm" onClick={exportPdf} disabled={!report}>
          <Download className="mr-1 size-3.5" /> Download PDF
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-card p-3">
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">Attendance and expense reports use this date range.</p>
      </div>

      {report ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {report.summary.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      ) : null}

      <div className="mt-4">{bar}</div>

      <Section title={report ? `${report.title} — ${rows.length} records` : "Report"}>
        {!report ? (
          <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "Unknown report."}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{isLoading ? "Loading…" : "No records."}</p>
        ) : (
          <div className="divide-y divide-border/60">
            <div className="hidden gap-3 p-3 text-[11px] uppercase tracking-wider text-muted-foreground md:flex">
              <span className="flex-1">{report.columns[0]}</span>
              <span className="flex-1">{report.columns[1]}</span>
              <span className="w-40 text-right">{report.columns[2]}</span>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground md:hidden">{r.sub}</p>
                </div>
                <p className="hidden flex-1 text-[12px] text-muted-foreground md:block">{r.sub}</p>
                <span className="w-40 shrink-0 text-right font-semibold tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Shell>
  );
}
