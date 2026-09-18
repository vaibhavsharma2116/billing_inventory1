import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/sfa/Shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAppUsers } from "@/lib/admin-users.functions";
import { isManagerRole } from "@/hooks/useAuth";

export function ManagerAssignments() {
  const qc = useQueryClient();
  const list = useServerFn(listAppUsers);

  const [managerId, setManagerId] = useState("");
  const [distributorId, setDistributorId] = useState("");
  const [csaId, setCsaId] = useState("");
  const [memberId, setMemberId] = useState("");

  const { data: users } = useQuery({ queryKey: ["admin-app-users"], queryFn: () => list() });
  const managers = (users ?? []).filter((u) => isManagerRole(u.role));
  const members = (users ?? []).filter((u) => u.role === "salesman" || u.role === "ba" || u.role === "ase" || u.role === "asm");

  const { data: network } = useQuery({
    queryKey: ["admin-network-options"],
    queryFn: async () => {
      const [d, c] = await Promise.all([
        supabase.from("distributors").select("id, name").order("name"),
        supabase.from("csas").select("id, name").order("name"),
      ]);
      return { distributors: d.data ?? [], csas: c.data ?? [] };
    },
  });

  const { data: rows } = useQuery({
    queryKey: ["manager-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manager_assignments")
        .select("id, manager_id, distributor_id, csa_id, member_id")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!managerId) throw new Error("Select a manager");
      if (!distributorId && !csaId && !memberId) throw new Error("Pick a distributor, CSA or team member");
      const { error } = await supabase.from("manager_assignments").insert({
        manager_id: managerId,
        distributor_id: distributorId || null,
        csa_id: csaId || null,
        member_id: memberId || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Assignment added");
      setDistributorId("");
      setCsaId("");
      setMemberId("");
      qc.invalidateQueries({ queryKey: ["manager-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manager_assignments").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Assignment removed");
      qc.invalidateQueries({ queryKey: ["manager-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (id: string | null, kind: "manager" | "member" | "distributor" | "csa") => {
    if (!id) return null;
    if (kind === "distributor") return (network?.distributors ?? []).find((d) => d.id === id)?.name ?? "Distributor";
    if (kind === "csa") return (network?.csas ?? []).find((c) => c.id === id)?.name ?? "CSA";
    const u = (users ?? []).find((x) => x.id === id);
    return u?.fullName || u?.email || "User";
  };

  return (
    <Section title="Manager assignments">
      <p className="mb-3 text-xs text-muted-foreground">
        A manager sees reports of everything mapped here, plus everything mapped to their whole reporting downline (BA \u2192 ASE \u2192 ASM \u2192 Business Manager).
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Picker
          label="Manager"
          value={managerId}
          onChange={setManagerId}
          options={managers.map((m) => ({ id: m.id, name: m.fullName || m.email }))}
        />
        <Picker label="Distributor" value={distributorId} onChange={setDistributorId} options={network?.distributors ?? []} />
        <Picker label="CSA" value={csaId} onChange={setCsaId} options={network?.csas ?? []} />
        <Picker
          label="Team member (salesman / BA)"
          value={memberId}
          onChange={setMemberId}
          options={members.map((m) => ({ id: m.id, name: m.fullName || m.email }))}
        />
      </div>

      <Button className="mt-4" disabled={add.isPending} onClick={() => add.mutate()}>
        {add.isPending ? "Saving…" : "Add assignment"}
      </Button>

      <div className="mt-4 space-y-2">
        {(rows ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{nameOf(r.manager_id, "manager")}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.distributor_id ? <Badge variant="secondary">{nameOf(r.distributor_id, "distributor")}</Badge> : null}
                {r.csa_id ? <Badge variant="secondary">{nameOf(r.csa_id, "csa")}</Badge> : null}
                {r.member_id ? <Badge variant="secondary">{nameOf(r.member_id, "member")}</Badge> : null}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>Remove</Button>
          </div>
        ))}
        {(rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No manager assignments yet.</p>
        ) : null}
      </div>
    </Section>
  );
}

function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
