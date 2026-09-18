import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/sfa";

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

export function TargetAssign() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthKey());
  const [userId, setUserId] = useState("");
  const [monthly, setMonthly] = useState("");
  const [daily, setDaily] = useState("");
  const [visits, setVisits] = useState("");

  const periodMonth = `${month}-01`;

  const { data: team } = useQuery({
    queryKey: ["target-team"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, designation")
        .order("full_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: rows } = useQuery({
    queryKey: ["targets", periodMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("targets")
        .select("id, user_id, target_amount, daily_target_amount, visits_target")
        .eq("period_month", periodMonth);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const nameOf = useMemo(
    () => (id: string) => (team ?? []).find((t) => t.id === id)?.full_name || "Team member",
    [team],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Select a team member");
      const { error } = await supabase.from("targets").upsert(
        {
          user_id: userId,
          period_month: periodMonth,
          target_amount: Number(monthly || 0),
          daily_target_amount: Number(daily || 0),
          visits_target: Number(visits || 0),
        },
        { onConflict: "user_id,period_month" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Target assigned");
      setMonthly("");
      setDaily("");
      setVisits("");
      qc.invalidateQueries({ queryKey: ["targets", periodMonth] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pick = (id: string) => {
    setUserId(id);
    const existing = (rows ?? []).find((r) => r.user_id === id);
    setMonthly(existing ? String(existing.target_amount ?? "") : "");
    setDaily(existing ? String(existing.daily_target_amount ?? "") : "");
    setVisits(existing ? String(existing.visits_target ?? "") : "");
  };

  return (
    <Section title="Assign targets">
      <p className="mb-3 text-xs text-muted-foreground">
        Monthly target salesman ke dashboard par dikhta hai, daily target BA counter par. Sirf aapki reporting team dikhegi.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Team member</Label>
          <Select value={userId} onValueChange={pick}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {(team ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name}{t.designation ? ` • ${t.designation}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Monthly target (₹) — salesman</Label>
          <Input inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label>Daily target (₹) — BA</Label>
          <Input inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label>Monthly visits target</Label>
          <Input inputMode="numeric" value={visits} onChange={(e) => setVisits(e.target.value)} placeholder="0" />
        </div>
      </div>

      <Button className="mt-4" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save target"}
      </Button>

      <div className="mt-4 space-y-2">
        {(rows ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 p-3 text-sm">
            <p className="font-medium">{nameOf(r.user_id)}</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary">Monthly {inr(r.target_amount)}</Badge>
              <Badge variant="secondary">Daily {inr(r.daily_target_amount ?? 0)}</Badge>
              <Badge variant="secondary">{r.visits_target} visits</Badge>
              <Button size="sm" variant="ghost" onClick={() => pick(r.user_id)}>Edit</Button>
            </div>
          </div>
        ))}
        {(rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Is month ke liye koi target assign nahi hua.</p>
        ) : null}
      </div>
    </Section>
  );
}
