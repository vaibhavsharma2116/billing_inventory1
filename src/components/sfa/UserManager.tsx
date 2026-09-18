import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/sfa/Shell";
import { ManagerAssignments } from "@/components/sfa/ManagerAssignments";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createAppUser,
  deleteAppUser,
  listAppUsers,
  resetAppUserPassword,
  setUserManager,
  setUserRoles,
  setUserMapping,
} from "@/lib/admin-users.functions";
import { isManagerRole, roleLabel, type AppRole } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";

const ROLES = [
  { value: "salesman", label: "Field Salesman" },
  { value: "ba", label: "Beauty Advisor (BA)" },
  { value: "distributor", label: "Distributor" },
  { value: "csa", label: "CSA / Super Stockist" },
  { value: "depot", label: "Master Depot Admin" },
  { value: "ase", label: "ASE (Area Sales Executive)" },
  { value: "asm", label: "ASM (Area Sales Manager)" },
  { value: "business_manager", label: "Business Manager" },
  { value: "manager", label: "Sales Manager (legacy)" },
  { value: "hr", label: "HR / Payroll" },
  { value: "office", label: "Office Employee" },
  { value: "office_manager", label: "Office Manager" },
  { value: "super_admin", label: "Company Admin" },
];

export function UserManager({ createOnly = false }: { createOnly?: boolean } = {}) {
  const qc = useQueryClient();
  const list = useServerFn(listAppUsers);
  const create = useServerFn(createAppUser);
  const remove = useServerFn(deleteAppUser);
  const resetPw = useServerFn(resetAppUserPassword);
  const setManagerFn = useServerFn(setUserManager);
  const setRolesFn = useServerFn(setUserRoles);
  const setMappingFn = useServerFn(setUserMapping);
  const [openRoles, setOpenRoles] = useState<string | null>(null);



  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    phone: "",
    role: "salesman",
    shopName: "",
    orgName: "",
    distributorId: "",
    csaId: "",
    depotId: "",
    reportsTo: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
      };
    },
  });

  const createUser = useMutation({
    mutationFn: async () =>
      create({
        data: {
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          role: form.role as "salesman",
          shopName: form.role === "ba" ? form.shopName.trim() || null : null,
          orgName:
            form.role === "distributor" || form.role === "csa" ? form.orgName.trim() || null : null,
          distributorId: form.distributorId || null,
          csaId: form.csaId || null,
          depotId: form.depotId || null,
          reportsTo: form.reportsTo || null,
        },
      }),
    onSuccess: () => {
      toast.success("User profile created. They can sign in with these credentials.");
      setForm({
        email: "",
        password: "",
        fullName: "",
        phone: "",
        role: "salesman",
        shopName: "",
        orgName: "",
        distributorId: "",
        csaId: "",
        depotId: "",
        reportsTo: "",
      });
      qc.invalidateQueries({ queryKey: ["admin-app-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeUser = useMutation({
    mutationFn: async (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("User removed");
      qc.invalidateQueries({ queryKey: ["admin-app-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignManager = useMutation({
    mutationFn: async (v: { id: string; reportsTo: string }) =>
      setManagerFn({ data: { id: v.id, reportsTo: v.reportsTo || null } }),
    onSuccess: () => {
      toast.success("Reporting line updated");
      qc.invalidateQueries({ queryKey: ["admin-app-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRolesMapping = useMutation({
    mutationFn: async (v: {
      id: string;
      roles: string[];
      distributorId: string | null;
      csaId: string | null;
      depotId: string | null;
    }) => {
      await setRolesFn({ data: { id: v.id, roles: v.roles as ["salesman"] } });
      await setMappingFn({
        data: {
          id: v.id,
          distributorId: v.distributorId,
          csaId: v.csaId,
          depotId: v.depotId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Roles and mapping updated");
      qc.invalidateQueries({ queryKey: ["admin-app-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const changePassword = useMutation({
    mutationFn: async (id: string) => {
      const password = window.prompt("New password (min 6 characters)")?.trim();
      if (!password) throw new Error("Password not changed");
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      return resetPw({ data: { id, password } });
    },
    onSuccess: () => toast.success("Password updated"),
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    form.email.trim() &&
    form.password.length >= 6 &&
    form.fullName.trim() &&
    (form.role !== "ba" || form.shopName.trim()) &&
    (form.role !== "distributor" || form.distributorId || form.orgName.trim()) &&
    (form.role !== "csa" || form.csaId || form.orgName.trim());

  return (
    <div className="space-y-4">
      {createOnly ? null : <ManagerAssignments />}
      <Section
        title="Create user account"
      >
        <p className="mb-3 text-xs text-muted-foreground">
          Self sign-up is disabled. Every salesman, BA, distributor, CSA and depot login is created here.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Full name" value={form.fullName} onChange={(v) => set("fullName", v)} />
          <FormField label="Mobile" value={form.phone} onChange={(v) => set("phone", v)} />
          <FormField label="Login email" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <FormField label="Temporary password" type="text" value={form.password} onChange={(v) => set("password", v)} />

          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.role === "ba" ? (
            <FormField label="Shop / outlet name" value={form.shopName} onChange={(v) => set("shopName", v)} />
          ) : null}

          {form.role === "salesman" || form.role === "distributor" ? (
            <MapField
              label="Map to distributor"
              value={form.distributorId}
              onChange={(v) => set("distributorId", v)}
              options={network?.distributors ?? []}
            />
          ) : null}

          {form.role === "csa" ? (
            <MapField label="Map to CSA" value={form.csaId} onChange={(v) => set("csaId", v)} options={network?.csas ?? []} />
          ) : null}

          {(form.role === "distributor" && !form.distributorId) ||
          (form.role === "csa" && !form.csaId) ? (
            <FormField
              label={form.role === "distributor" ? "Or create new distributor (firm name)" : "Or create new CSA (firm name)"}
              value={form.orgName}
              onChange={(v) => set("orgName", v)}
            />
          ) : null}

          {form.role !== "super_admin" && form.role !== "business_manager" ? (
            <MapField
              label="Reports to"
              value={form.reportsTo}
              onChange={(v) => set("reportsTo", v)}
              options={(users ?? [])
                .filter((u) => isManagerRole(u.role))
                .map((u) => ({ id: u.id, name: `${u.fullName || u.email} — ${roleLabel[u.role as AppRole] ?? u.role}` }))}
            />
          ) : null}

          {form.role === "depot" ? (
            <MapField label="Map to depot" value={form.depotId} onChange={(v) => set("depotId", v)} options={network?.depots ?? []} />
          ) : null}
        </div>

        <Button
          className="mt-4"
          disabled={!canSubmit || createUser.isPending}
          onClick={() => createUser.mutate()}
        >
          {createUser.isPending ? "Creating…" : "Create login"}
        </Button>
      </Section>

      {createOnly ? null : (
      <Section title={`All users (${users?.length ?? 0})`}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading users…</p>
        ) : (
          <div className="space-y-2">
            {(users ?? []).map((u) => (
              <div key={u.id} className="rounded-2xl border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.fullName || u.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Last sign-in: {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("en-IN") : "Never"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(u.roles?.length ? u.roles : [u.role]).map((r) => (
                    <Badge key={r} variant="secondary">{roleLabel[r as AppRole] ?? r}</Badge>
                  ))}
                  <div className="w-48">
                    <Select
                      value={u.reportsTo ?? "none"}
                      onValueChange={(v) => assignManager.mutate({ id: u.id, reportsTo: v === "none" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Reports to" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No reporting manager</SelectItem>
                        {(users ?? [])
                          .filter((m) => isManagerRole(m.role) && m.id !== u.id)
                          .map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.fullName || m.email} — {roleLabel[m.role as AppRole] ?? m.role}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenRoles(openRoles === u.id ? null : u.id)}
                  >
                    Roles & mapping
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => changePassword.mutate(u.id)}>
                    Reset password
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeUser.mutate(u.id)}>
                    Remove
                  </Button>
                </div>
                </div>
                {openRoles === u.id ? (
                  <RolesMappingPanel
                    user={u}
                    network={network}
                    onSave={(roles, mapping) =>
                      saveRolesMapping.mutate({ id: u.id, roles, ...mapping })
                    }
                    saving={saveRolesMapping.isPending}
                  />
                ) : null}
              </div>
            ))}

            {(users ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            ) : null}
          </div>
        )}
      </Section>
      )}
    </div>
  );
}

function FormField({
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

function MapField({
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

type NetworkOptions = {
  distributors: { id: string; name: string }[];
  csas: { id: string; name: string }[];
  depots: { id: string; name: string }[];
};

function RolesMappingPanel({
  user,
  network,
  onSave,
  saving,
}: {
  user: { id: string; roles?: string[]; role: string; distributorId?: string | null; csaId?: string | null; depotId?: string | null };
  network: NetworkOptions | undefined;
  onSave: (
    roles: string[],
    mapping: { distributorId: string | null; csaId: string | null; depotId: string | null },
  ) => void;
  saving: boolean;
}) {
  const [roles, setRoles] = useState<string[]>(user.roles?.length ? user.roles : [user.role]);
  const [distributorId, setDistributorId] = useState(user.distributorId ?? "");
  const [csaId, setCsaId] = useState(user.csaId ?? "");
  const [depotId, setDepotId] = useState(user.depotId ?? "");

  const toggle = (r: string) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
      <div>
        <p className="mb-2 text-xs font-medium">
          Roles (multiple allowed — user can switch dashboards from the header)
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROLES.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-xs">
              <Checkbox checked={roles.includes(r.value)} onCheckedChange={() => toggle(r.value)} />
              {r.label}
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MapField
          label="Distributor"
          value={distributorId}
          onChange={setDistributorId}
          options={network?.distributors ?? []}
        />
        <MapField label="CSA" value={csaId} onChange={setCsaId} options={network?.csas ?? []} />
        <MapField label="Master depot" value={depotId} onChange={setDepotId} options={network?.depots ?? []} />
      </div>
      <Button
        size="sm"
        disabled={saving || roles.length === 0}
        onClick={() =>
          onSave(roles, {
            distributorId: distributorId || null,
            csaId: csaId || null,
            depotId: depotId || null,
          })
        }
      >
        {saving ? "Saving…" : "Save roles & mapping"}
      </Button>
    </div>
  );
}
