import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { downloadReportPdf } from "@/lib/report-pdf";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "@/components/sfa/Shell";
import { UserManager } from "@/components/sfa/UserManager";
import { usePager } from "@/components/sfa/Pager";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteAppUser,
  listAppUsers,
  resetAppUserPassword,
  setUserManager,
  setUserMapping,
  setUserRoles,
  updateAppUser,
} from "@/lib/admin-users.functions";
import { isManagerRole, roleLabel, type AppRole } from "@/hooks/useAuth";

const ROLES: { value: string; label: string }[] = [
  "salesman",
  "ba",
  "distributor",
  "csa",
  "depot",
  "ase",
  "asm",
  "business_manager",
  "manager",
  "hr",
  "office",
  "office_manager",
  "super_admin",
].map((value) => ({ value, label: roleLabel[value as AppRole] ?? value }));

type AppUser = Awaited<ReturnType<typeof listAppUsers>>[number];

type Network = {
  distributors: { id: string; name: string }[];
  csas: { id: string; name: string }[];
  depots: { id: string; name: string }[];
};

export function CompanyDirectory() {
  const qc = useQueryClient();
  const list = useServerFn(listAppUsers);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-app-users"],
    queryFn: () => list(),
  });

  const { data: network } = useQuery({
    queryKey: ["admin-network-options"],
    queryFn: async () => {
      const [d, c, dep] = await Promise.all([
        supabase.from("distributors").select("id, name").order("name"),
        supabase.from("csas").select("id, name").order("name"),
        supabase.from("depots").select("id, name").order("name"),
      ]);
      return {
        distributors: d.data ?? [],
        csas: c.data ?? [],
        depots: dep.data ?? [],
      } as Network;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = users ?? [];
    if (!q) return rows;
    return rows.filter((u) =>
      [u.fullName, u.email, u.phone, u.role, ...(u.roles ?? [])]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [users, search]);

  const { paged, bar } = usePager(filtered);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-app-users"] });

  const exportPdf = () => {
    downloadReportPdf({
      fileName: "poppik-company-directory.pdf",
      title: "Company Directory",
      subtitle: "All app users, roles and org mapping",
      meta: [`Total users: ${users?.length ?? 0}`, `Listed in this export: ${filtered.length}`],
      tables: [
        {
          title: "Users",
          head: ["Name", "Email", "Mobile", "Roles", "Mapping"],
          align: ["left", "left", "left", "left", "left"],
          widths: [105, 175, 70, 80, 85],
          rows: filtered.map((u) => [
            u.fullName || "—",
            u.email || "—",
            u.phone || "—",
            (u.roles?.length ? u.roles : [u.role])
              .map((r) => roleLabel[r as AppRole] ?? r)
              .join(", "),
            mappingLabel(u, network),
          ]),
        },
      ],
    }).catch((e: Error) => toast.error(e.message));
  };

  return (
    <div className="space-y-4">
      <UserManager createOnly />
      <Section title={`Company directory — users (${users?.length ?? 0})`}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Input
            placeholder="Search by name, email, mobile or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[220px] flex-1"
          />
          <Button variant="outline" onClick={exportPdf} disabled={filtered.length === 0}>
            <Download className="mr-1 size-3.5" /> Download PDF
          </Button>
        </div>

        <div className="space-y-2 px-3 pb-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {paged.map((u) => (
            <div key={u.id} className="rounded-2xl border border-border/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.fullName || u.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email} · {u.phone || "No mobile"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {mappingLabel(u, network)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(u.roles?.length ? u.roles : [u.role]).map((r) => (
                    <Badge key={r} variant="secondary">{roleLabel[r as AppRole] ?? r}</Badge>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setOpenId(openId === u.id ? null : u.id)}>
                    {openId === u.id ? "Close" : "Edit"}
                  </Button>
                </div>
              </div>
              {openId === u.id ? (
                <UserEditor user={u} users={users ?? []} network={network} onDone={invalidate} />
              ) : null}
            </div>
          ))}
          {!isLoading && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : null}
          {bar}
        </div>
      </Section>

      <AssignmentDirectory users={users ?? []} network={network} />
    </div>
  );
}

function mappingLabel(u: AppUser, network: Network | undefined) {
  const parts = [
    network?.distributors.find((d) => d.id === u.distributorId)?.name,
    network?.csas.find((c) => c.id === u.csaId)?.name,
    network?.depots.find((d) => d.id === u.depotId)?.name,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No org mapping";
}

function UserEditor({
  user,
  users,
  network,
  onDone,
}: {
  user: AppUser;
  users: AppUser[];
  network: Network | undefined;
  onDone: () => void;
}) {
  const updateFn = useServerFn(updateAppUser);
  const rolesFn = useServerFn(setUserRoles);
  const mappingFn = useServerFn(setUserMapping);
  const managerFn = useServerFn(setUserManager);
  const resetFn = useServerFn(resetAppUserPassword);
  const removeFn = useServerFn(deleteAppUser);

  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [roles, setRoles] = useState<string[]>(user.roles?.length ? user.roles : [user.role]);
  const [distributorId, setDistributorId] = useState(user.distributorId ?? "");
  const [csaId, setCsaId] = useState(user.csaId ?? "");
  const [depotId, setDepotId] = useState(user.depotId ?? "");
  const [reportsTo, setReportsTo] = useState(user.reportsTo ?? "none");
  const [password, setPassword] = useState("");

  const toggle = (r: string) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const save = useMutation({
    mutationFn: async () => {
      await updateFn({
        data: { id: user.id, email: email.trim(), fullName: fullName.trim(), phone: phone.trim() || null },
      });
      await rolesFn({ data: { id: user.id, roles: roles as ["salesman"] } });
      await mappingFn({
        data: {
          id: user.id,
          distributorId: distributorId || null,
          csaId: csaId || null,
          depotId: depotId || null,
        },
      });
      await managerFn({ data: { id: user.id, reportsTo: reportsTo === "none" ? null : reportsTo } });
      if (password) await resetFn({ data: { id: user.id, password } });
    },
    onSuccess: () => {
      toast.success("User updated");
      setPassword("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => removeFn({ data: { id: user.id } }),
    onSuccess: () => {
      toast.success("User removed");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Full name" value={fullName} onChange={setFullName} />
        <Field label="Login email" value={email} onChange={setEmail} type="email" />
        <Field label="Mobile" value={phone} onChange={setPhone} />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium">Roles (multiple allowed)</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROLES.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-xs">
              <Checkbox checked={roles.includes(r.value)} onCheckedChange={() => toggle(r.value)} />
              {r.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Picker label="Distributor" value={distributorId} onChange={setDistributorId} options={network?.distributors ?? []} allowClear />
        <Picker label="CSA" value={csaId} onChange={setCsaId} options={network?.csas ?? []} allowClear />
        <Picker label="Master depot" value={depotId} onChange={setDepotId} options={network?.depots ?? []} allowClear />
        <Picker
          label="Reports to"
          value={reportsTo}
          onChange={setReportsTo}
          options={users
            .filter((m) => isManagerRole(m.role) && m.id !== user.id)
            .map((m) => ({ id: m.id, name: `${m.fullName || m.email} — ${roleLabel[m.role as AppRole] ?? m.role}` }))}
          noneLabel="No reporting manager"
        />
      </div>

      <Field label="New password (optional)" value={password} onChange={setPassword} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={save.isPending || roles.length === 0} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>
          Remove user
        </Button>
      </div>
    </div>
  );
}

function AssignmentDirectory({ users, network }: { users: AppUser[]; network: Network | undefined }) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["manager-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manager_assignments")
        .select("id, manager_id, distributor_id, csa_id, member_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["manager-assignments"] });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manager_assignments").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Assignment removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const userName = (id: string | null) => {
    const u = users.find((x) => x.id === id);
    return u ? u.fullName || u.email : null;
  };

  return (
    <Section title={`Manager assignments (${rows?.length ?? 0})`}>
      <div className="space-y-2 p-3">
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add assignment"}
        </Button>
        {adding ? (
          <AssignmentEditor
            row={{ id: "", manager_id: "", distributor_id: null, csa_id: null, member_id: null }}
            users={users}
            network={network}
            onDone={() => {
              setAdding(false);
              invalidate();
            }}
          />
        ) : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {(rows ?? []).map((r) => (
          <div key={r.id} className="rounded-2xl border border-border/60 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{userName(r.manager_id) ?? "Manager"}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.distributor_id ? (
                    <Badge variant="secondary">
                      {network?.distributors.find((d) => d.id === r.distributor_id)?.name ?? "Distributor"}
                    </Badge>
                  ) : null}
                  {r.csa_id ? (
                    <Badge variant="secondary">
                      {network?.csas.find((c) => c.id === r.csa_id)?.name ?? "CSA"}
                    </Badge>
                  ) : null}
                  {r.member_id ? <Badge variant="secondary">{userName(r.member_id) ?? "Member"}</Badge> : null}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditId(editId === r.id ? null : r.id)}>
                  {editId === r.id ? "Close" : "Edit"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>Remove</Button>
              </div>
            </div>
            {editId === r.id ? (
              <AssignmentEditor row={r} users={users} network={network} onDone={invalidate} />
            ) : null}
          </div>
        ))}
        {!isLoading && (rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No manager assignments yet.</p>
        ) : null}
      </div>
    </Section>
  );
}

function AssignmentEditor({
  row,
  users,
  network,
  onDone,
}: {
  row: { id: string; manager_id: string; distributor_id: string | null; csa_id: string | null; member_id: string | null };
  users: AppUser[];
  network: Network | undefined;
  onDone: () => void;
}) {
  const [managerId, setManagerId] = useState(row.manager_id);
  const [distributorId, setDistributorId] = useState(row.distributor_id ?? "");
  const [csaId, setCsaId] = useState(row.csa_id ?? "");
  const [memberId, setMemberId] = useState(row.member_id ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!managerId) throw new Error("Select a manager");
      if (!distributorId && !csaId && !memberId) throw new Error("Pick a distributor, CSA or team member");
      const payload = {
        manager_id: managerId,
        distributor_id: distributorId || null,
        csa_id: csaId || null,
        member_id: memberId || null,
      };
      const { error } = row.id
        ? await supabase.from("manager_assignments").update(payload).eq("id", row.id)
        : await supabase.from("manager_assignments").insert(payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const managers = users.filter((u) => isManagerRole(u.role));
  const members = users.filter((u) => ["salesman", "ba", "ase", "asm"].includes(u.role));

  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 sm:grid-cols-2">
      <Picker
        label="Manager"
        value={managerId}
        onChange={setManagerId}
        options={managers.map((m) => ({ id: m.id, name: m.fullName || m.email }))}
      />
      <Picker label="Distributor" value={distributorId} onChange={setDistributorId} options={network?.distributors ?? []} allowClear />
      <Picker label="CSA" value={csaId} onChange={setCsaId} options={network?.csas ?? []} allowClear />
      <Picker
        label="Team member"
        value={memberId}
        onChange={setMemberId}
        options={members.map((m) => ({ id: m.id, name: m.fullName || m.email }))}
        allowClear
      />
      <div className="sm:col-span-2">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save assignment"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  options,
  allowClear,
  noneLabel = "Not mapped",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  allowClear?: boolean;
  noneLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          {allowClear || noneLabel !== "Not mapped" ? (
            <SelectItem value="none">{noneLabel}</SelectItem>
          ) : null}
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
