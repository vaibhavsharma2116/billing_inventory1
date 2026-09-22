import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LEAVE_TYPES = [
  { value: "casual", label: "Casual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "earned", label: "Earned Leave" },
  { value: "unpaid", label: "Leave Without Pay" },
  { value: "half_day", label: "Half Day" },
];

const day = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("en-IN") : "—");

/** Leave application card for field roles (salesman / BA). Approval sits with HR. */
export function LeaveApply({ userId }: { userId?: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    leaveType: "casual",
    fromDate: todayStr,
    toDate: todayStr,
    reason: "",
  });

  const { data: leaves } = useQuery({
    queryKey: ["my-leaves", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leaves")
        .select("id, leave_type, from_date, to_date, status, reason, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Session not ready");
      if (form.toDate < form.fromDate) throw new Error("To date cannot be before from date");
      const { error } = await supabase.from("leaves").insert({
        user_id: userId,
        leave_type: form.leaveType,
        from_date: form.fromDate,
        to_date: form.toDate,
        reason: form.reason.trim() || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave request sent to HR for approval");
      setForm({ leaveType: "casual", fromDate: todayStr, toDate: todayStr, reason: "" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["my-leaves"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      title="Leave"
      action={
        <Button size="sm" variant={open ? "ghost" : "default"} onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "Apply Leave"}
        </Button>
      }
    >
      {open ? (
        <div className="space-y-3 border-b border-border/60 p-3">
          <div className="space-y-1.5">
            <Label>Leave type</Label>
            <Select
              value={form.leaveType}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  leaveType: v,
                  // Half day: auto-sync toDate = fromDate
                  toDate: v === "half_day" ? f.fromDate : f.toDate,
                }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input
                type="date"
                value={form.fromDate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    fromDate: e.target.value,
                    // Keep toDate in sync for half_day
                    toDate: f.leaveType === "half_day" ? e.target.value : f.toDate,
                  }))
                }
              />
            </div>
            {form.leaveType !== "half_day" && (
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input
                  type="date"
                  value={form.toDate}
                  onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
                />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              rows={2}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Reason for leave"
            />
          </div>
          <Button className="w-full" disabled={apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending ? "Sending…" : "Submit to HR"}
          </Button>
        </div>
      ) : null}

      <div className="divide-y divide-border/60">
        {(leaves ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No leave requests yet.</p>
        ) : (
          (leaves ?? []).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium capitalize">{l.leave_type.replace("_", " ")}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {day(l.from_date)} → {day(l.to_date)}
                  {l.reason ? ` • ${l.reason}` : ""}
                </p>
              </div>
              <Badge
                variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}
              >
                {l.status}
              </Badge>
            </div>
          ))
        )}
      </div>
    </Section>
  );
}
