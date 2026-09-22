import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr } from "@/lib/sfa";
import { downloadReportPdf, rs } from "@/lib/report-pdf";

const pad = (n: number) => String(n).padStart(2, "0");

function monthOptions() {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

function monthDays(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= last; d++) days.push(`${y}-${pad(m!)}-${pad(d)}`);
  return days;
}

const isSunday = (iso: string) => new Date(`${iso}T00:00:00`).getDay() === 0;

const num = (v: unknown) => Number((v as number | null) ?? 0);

export type PayrollLine = {
  userId: string;
  name: string;
  code: string;
  effectiveFrom: string | null;
  partMonth: boolean;
  absentDays: number;
  workingDays: number;
  presentDays: number;
  paidLeaveDays: number;
  lopDays: number;
  gross: number;
  earnedGross: number;
  deductions: number;
  lopAmount: number;
  reimbursement: number;
  net: number;
  hasStructure: boolean;
};

export function AutoPayroll() {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0]!.value);
  const [payLeaves, setPayLeaves] = useState(true);
  const [addReimbursement, setAddReimbursement] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const days = useMemo(() => monthDays(month), [month]);
  const from = days[0]!;
  const to = days[days.length - 1]!;

  const { data, isLoading } = useQuery({
    queryKey: ["auto-payroll", month],
    queryFn: async () => {
      const [profilesRaw, roles, attendance, leaves, expenses, salaries] = await Promise.all([
        supabase.from("profiles").select("id, full_name, employee_code").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("attendance").select("user_id, work_date, punch_in").gte("work_date", from).lte("work_date", to),
        supabase.from("leaves").select("user_id, from_date, to_date, status").eq("status", "approved"),
        supabase
          .from("expenses")
          .select("user_id, total_amount, status, expense_date")
          .eq("status", "approved")
          .gte("expense_date", from)
          .lte("expense_date", to),
        supabase.from("salary_structures").select("*").order("effective_from", { ascending: false }),
      ]);
      const partyIds = new Set(
        (roles.data ?? [])
          .filter((r) => ["distributor", "csa", "depot"].includes(r.role))
          .map((r) => r.user_id),
      );
      return {
        profiles: (profilesRaw.data ?? []).filter((p) => !partyIds.has(p.id)),
        attendance: attendance.data ?? [],
        leaves: leaves.data ?? [],
        expenses: expenses.data ?? [],
        salaries: (salaries.data ?? []) as unknown as Record<string, unknown>[],
      };
    },
  });

  // Salary month is always 30 paid days; every Sunday is a paid weekly off.
  const workingDays = 30;
  const sundayCount = useMemo(() => days.filter(isSunday).length, [days]);

  const lines: PayrollLine[] = useMemo(() => {
    if (!data) return [];
    return data.profiles.map((p) => {
      // Latest salary structure that is already effective within this month.
      const s = data.salaries
        .filter((r) => r["user_id"] === p.id && String(r["effective_from"] ?? "") <= to)
        .sort((a, b) => String(b["effective_from"] ?? "").localeCompare(String(a["effective_from"] ?? "")))[0];
      const effectiveFrom = s ? String(s["effective_from"] ?? "") : null;
      // Mid-month joiners / mid-month salary changes are paid only from the effective date.
      const eligibleDays = days.filter((d) => !effectiveFrom || d >= effectiveFrom);
      const partMonth = !!effectiveFrom && eligibleDays.length < days.length;
      const sundaySet = new Set(eligibleDays.filter(isSunday));
      const paidBase = Math.max(Math.round((workingDays * eligibleDays.length) / days.length), 0);

      // Sundays are always paid weekly offs — a punch on Sunday must NOT double-count
      // as present (it is already included in sundaySet / paidLeaveDays).
      const present = new Set(
        data.attendance
          .filter((a) => a.user_id === p.id && a.punch_in && eligibleDays.includes(a.work_date) && !isSunday(a.work_date))
          .map((a) => a.work_date),
      );
      const leaveDates = new Set<string>();
      for (const l of data.leaves) {
        if (l.user_id !== p.id) continue;
        for (const d of eligibleDays) {
          if (d >= l.from_date && d <= l.to_date && !present.has(d) && !sundaySet.has(d)) leaveDates.add(d);
        }
      }
      const presentDays = present.size;
      // Sundays are paid weekly offs; approved leaves are paid when enabled.
      const paidLeaveDays = sundaySet.size + (payLeaves ? leaveDates.size : 0);
      const paidDays = Math.min(presentDays + paidLeaveDays, paidBase);
      const lopDays = Math.max(paidBase - paidDays, 0);
      const absentDays = eligibleDays.filter(
        (d) => !present.has(d) && !sundaySet.has(d) && !leaveDates.has(d),
      ).length;

      const gross =
        num(s?.["basic"]) +
        num(s?.["hra"]) +
        num(s?.["conveyance"]) +
        num(s?.["medical_allowance"]) +
        num(s?.["special_allowance"]) +
        num(s?.["other_allowance"]);
      const perDay = workingDays > 0 ? gross / workingDays : 0;
      const earnedGross = Math.round(perDay * paidDays);
      const lopAmount = Math.round(perDay * paidBase - earnedGross);
      const deductions = Math.round((num(s?.["deductions"]) * paidBase) / workingDays);
      const reimbursement = addReimbursement
        ? data.expenses.filter((e) => e.user_id === p.id).reduce((t, e) => t + Number(e.total_amount ?? 0), 0)
        : 0;
      const net = Math.max(earnedGross - deductions, 0) + reimbursement;
      return {
        userId: p.id,
        name: p.full_name,
        code: p.employee_code ?? "—",
        effectiveFrom,
        partMonth,
        absentDays,
        workingDays: paidBase,
        presentDays,
        paidLeaveDays,
        lopDays,
        gross,
        earnedGross,
        deductions,
        lopAmount,
        reimbursement,
        net,
        hasStructure: !!s,
      };
    });
  }, [data, days, to, workingDays, payLeaves, addReimbursement]);

  const payable = lines.filter((l) => l.hasStructure);
  const totalNet = payable.reduce((s, l) => s + l.net, 0);
  const totalLop = payable.reduce((s, l) => s + l.lopAmount, 0);
  const monthLabel = months.find((m) => m.value === month)?.label ?? month;
  const absentees = lines.filter((l) => l.absentDays > 0).sort((a, b) => b.absentDays - a.absentDays);

  const q = searchQuery.trim().toLowerCase();
  const filteredLines = q ? lines.filter((l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)) : lines;
  const filteredAbsentees = q ? absentees.filter((l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)) : absentees;

  const exportPdf = () =>
    downloadReportPdf({
      fileName: `auto-payroll-${month}.pdf`,
      title: "Attendance Based Payroll",
      subtitle: monthLabel,
      meta: [
        `Working days: ${workingDays} (all Sundays paid weekly off)`,
        `Employees on payroll: ${payable.length}`,
        `Total LOP: ${rs(totalLop)}   |   Total net payable: ${rs(totalNet)}`,
      ],
      tables: [
        {
          title: `Payroll sheet (${payable.length})`,
          head: ["Employee", "Present", "Paid leave", "LOP", "Gross", "Earned", "Deductions", "Reimb.", "Net payable"],
          align: ["left", "right", "right", "right", "right", "right", "right", "right", "right"],
          rows: payable.map((l) => [
            `${l.name}${l.code !== "—" ? ` (${l.code})` : ""}`,
            l.presentDays,
            l.paidLeaveDays,
            l.lopDays,
            rs(l.gross),
            rs(l.earnedGross),
            rs(l.deductions),
            rs(l.reimbursement),
            rs(l.net),
          ]),
        },
        {
          title: `Absent employees (${absentees.length})`,
          head: ["Employee", "Paid days", "Present", "Paid leave", "Absent", "LOP amount"],
          align: ["left", "right", "right", "right", "right", "right"],
          rows: absentees.map((l) => [
            `${l.name}${l.code !== "—" ? ` (${l.code})` : ""}`,
            l.workingDays,
            l.presentDays,
            l.paidLeaveDays,
            l.absentDays,
            rs(l.lopAmount),
          ]),
        },
      ],
    });

  const exportSlip = (l: PayrollLine) =>
    downloadReportPdf({
      fileName: `salary-slip-${l.name.replace(/\s+/g, "-").toLowerCase()}-${month}.pdf`,
      title: "Salary Slip",
      subtitle: `${l.name} • ${monthLabel}`,
      meta: [
        `Employee code: ${l.code}`,
        `Paid days: ${l.workingDays}   |   Present: ${l.presentDays}   |   Paid leave: ${l.paidLeaveDays}   |   Absent: ${l.absentDays}   |   LOP: ${l.lopDays}`,
        l.partMonth ? `Salary effective from ${l.effectiveFrom} — part month, pro-rated` : "Full month salary",
      ],
      tables: [
        {
          title: "Salary computation",
          head: ["Component", "Amount"],
          align: ["left", "right"],
          rows: [
            ["Gross salary (full month)", rs(l.gross)],
            ["Loss of pay", `-${rs(l.lopAmount)}`],
            ["Earned gross", rs(l.earnedGross)],
            ["Deductions (PF, ESIC, TDS, others)", `-${rs(l.deductions)}`],
            ["Approved expense reimbursement", rs(l.reimbursement)],
            ["Net payable", rs(l.net)],
          ],
        },
      ],
    });

  return (
    <Section
      title="Auto salary from attendance"
      action={
        <Button size="sm" variant="outline" onClick={exportPdf} disabled={payable.length === 0}>
          Download payroll PDF
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-4 border-b border-border/60 p-3">
        <div className="space-y-1.5">
          <Label>Payroll month</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Working days</Label>
          <Input readOnly value={workingDays} className="w-24" />
        </div>
        <div className="space-y-1.5">
          <Label>Search employee</Label>
          <Input
            placeholder="Name or code…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-44"
          />
        </div>
        <p className="text-xs text-muted-foreground">All Sundays are paid weekly off ({sundayCount} this month)</p>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={payLeaves} onCheckedChange={setPayLeaves} />
          Approved leave = paid
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={addReimbursement} onCheckedChange={setAddReimbursement} />
          Add approved expenses
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-border/60 p-3 text-sm md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Employees on payroll</p>
          <p className="font-semibold">{payable.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Working days</p>
          <p className="font-semibold">{workingDays}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total LOP</p>
          <p className="font-semibold text-destructive">{inr(totalLop)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total net payable</p>
          <p className="font-semibold text-success">{inr(totalNet)}</p>
        </div>
      </div>

      <Tabs defaultValue="sheet" className="p-3">
        <TabsList>
          <TabsTrigger value="sheet">Payroll sheet ({filteredLines.length})</TabsTrigger>
          <TabsTrigger value="absent">Absent employees ({filteredAbsentees.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sheet" className="divide-y divide-border/60">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Calculating payroll…</p>
        ) : filteredLines.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{q ? `"${searchQuery}" se koi employee nahi mila` : "No employees found."}</p>
        ) : (
          filteredLines.map((l) => (
            <div key={l.userId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {l.name} <span className="text-xs text-muted-foreground">{l.code}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.hasStructure
                    ? `Present ${l.presentDays}/${l.workingDays} • Paid leave ${l.paidLeaveDays} • Absent ${l.absentDays} • LOP ${l.lopDays} (${inr(l.lopAmount)}) • Earned ${inr(l.earnedGross)} • Deductions ${inr(l.deductions)} • Reimb ${inr(l.reimbursement)}`
                    : "No salary structure — add one in Payroll tab to auto generate"}
                </p>
                {l.partMonth ? (
                  <p className="text-xs text-warning">Joined / effective {l.effectiveFrom} — pro-rated part month</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={l.hasStructure ? "secondary" : "outline"}>Net {inr(l.hasStructure ? l.net : 0)}</Badge>
                <Button size="sm" variant="outline" disabled={!l.hasStructure} onClick={() => exportSlip(l)}>
                  Slip
                </Button>
              </div>
            </div>
          ))
        )}
        </TabsContent>

        <TabsContent value="absent">
        <div className="divide-y divide-border/60">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Calculating…</p>
          ) : filteredAbsentees.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{q ? `"${searchQuery}" se koi employee nahi mila` : "No absents this month."}</p>
          ) : (
            filteredAbsentees.map((l) => (
              <div key={`abs-${l.userId}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {l.name} <span className="text-xs text-muted-foreground">{l.code}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Paid days {l.workingDays} • Present {l.presentDays} • Paid leave {l.paidLeaveDays} • LOP{" "}
                    {inr(l.lopAmount)}
                  </p>
                </div>
                <Badge variant="outline" className="text-destructive">
                  Absent {l.absentDays}
                </Badge>
              </div>
            ))
          )}
        </div>
        </TabsContent>
      </Tabs>
    </Section>
  );
}
