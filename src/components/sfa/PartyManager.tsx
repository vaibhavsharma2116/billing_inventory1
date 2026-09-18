import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Party = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  csa_id?: string | null;
  depot_id?: string | null;
};

const empty = {
  name: "",
  phone: "",
  email: "",
  gstin: "",
  address: "",
  city: "",
  state: "",
  parentId: "",
};

export function PartyManager() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-party-network"],
    queryFn: async () => {
      const [d, c, dep] = await Promise.all([
        supabase
          .from("distributors")
          .select("id, name, phone, email, gstin, address, city, state, csa_id, outstanding")
          .order("name"),
        supabase
          .from("csas")
          .select("id, name, phone, email, gstin, address, city, state, depot_id")
          .order("name"),
        supabase
          .from("depots")
          .select("id, name, phone, email, gstin, address, city, state")
          .order("name"),
      ]);
      return {
        distributors: (d.data ?? []) as Party[],
        csas: (c.data ?? []) as Party[],
        depots: (dep.data ?? []) as Party[],

      };
    },
  });

  return (
    <div className="space-y-4">
      <PartyBlock
        kind="depot"
        title="Master Depots"
        parentLabel={null}
        parents={[]}
        rows={(data?.depots ?? []) as Party[]}
        parentName={() => "Mapped to Company"}
        isLoading={isLoading}
        onDone={() => qc.invalidateQueries({ queryKey: ["admin-party-network"] })}
      />
      <PartyBlock
        kind="csa"
        title="CSA / Super Stockist"
        parentLabel="Map to Master Depot"
        parents={(data?.depots ?? []).map((d) => ({ id: d.id, name: d.name }))}
        rows={data?.csas ?? []}
        parentName={(row) => (data?.depots ?? []).find((d) => d.id === row.depot_id)?.name ?? null}
        isLoading={isLoading}
        onDone={() => qc.invalidateQueries({ queryKey: ["admin-party-network"] })}
      />
      <PartyBlock
        kind="distributor"
        title="Distributors"
        parentLabel="Map to CSA"
        parents={(data?.csas ?? []).map((c) => ({ id: c.id, name: c.name }))}
        rows={data?.distributors ?? []}
        parentName={(row) => (data?.csas ?? []).find((c) => c.id === row.csa_id)?.name ?? null}
        isLoading={isLoading}
        onDone={() => qc.invalidateQueries({ queryKey: ["admin-party-network"] })}
      />
    </div>
  );
}

function PartyBlock({
  kind,
  title,
  parentLabel,
  parents,
  rows,
  parentName,
  isLoading,
  onDone,
}: {
  kind: "csa" | "distributor" | "depot";
  title: string;
  parentLabel: string | null;
  parents: { id: string; name: string }[];
  rows: Party[];
  parentName: (row: Party) => string | null;
  isLoading: boolean;
  onDone: () => void;
}) {

  const table = kind === "csa" ? "csas" : kind === "depot" ? "depots" : "distributors";
  const parentKey = kind === "csa" ? "depot_id" : "csa_id";

  const [form, setForm] = useState({ ...empty });
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.city, r.state, r.phone, r.gstin].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        gstin: form.gstin.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
      };
      if (parentLabel) payload[parentKey] = form.parentId || null;

      const res = editId
        ? await supabase.from(table).update(payload as never).eq("id", editId)
        : await supabase.from(table).insert(payload as never);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success(editId ? "Details updated" : "Party created");
      setForm({ ...empty });
      setEditId(null);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from(table).delete().eq("id", id);
      if (res.error) {
        const msg = res.error.message || "";
        if (/foreign key|violates/i.test(msg)) {
          throw new Error(
            "This record is linked to existing orders, stock or users. Unlink those first, then remove it.",
          );
        }
        throw new Error(msg);
      }
    },
    onSuccess: (_d, id) => {
      toast.success("Record removed");
      if (editId === id) {
        setEditId(null);
        setForm({ ...empty });
      }
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (r: Party) => {
    setEditId(r.id);
    setForm({
      name: r.name ?? "",
      phone: r.phone ?? "",
      email: r.email ?? "",
      gstin: r.gstin ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      parentId: (kind === "csa" ? r.depot_id : r.csa_id) ?? "",
    });
  };

  return (
    <Section title={`${title} (${rows.length})`}>
      <div className="space-y-4 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name" value={form.name} onChange={(v) => set("name", v)} />
          <Field label="Mobile no" value={form.phone} onChange={(v) => set("phone", v)} />
          <Field label="Email id" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <Field label="GST no" value={form.gstin} onChange={(v) => set("gstin", v)} />
          <Field label="Full address" value={form.address} onChange={(v) => set("address", v)} />
          <Field label="City" value={form.city} onChange={(v) => set("city", v)} />
          <Field label="State" value={form.state} onChange={(v) => set("state", v)} />
          {parentLabel ? (
            <div className="space-y-1.5">
              <Label>{parentLabel}</Label>
              <Select value={form.parentId} onValueChange={(v) => set("parentId", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

        </div>

        <div className="flex gap-2">
          <Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : editId ? "Update details" : `Create ${kind === "csa" ? "CSA" : kind === "depot" ? "master depot" : "distributor"}`}
          </Button>
          {editId ? (
            <Button variant="outline" onClick={() => { setEditId(null); setForm({ ...empty }); }}>
              Cancel
            </Button>
          ) : null}
        </div>

        <Input
          placeholder="Search by name, city, GST or mobile"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="space-y-2">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-border/60 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[r.address, r.city, r.state].filter(Boolean).join(", ") || "Address not added"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.phone || "No mobile"} · {r.email || "No email"} · GST {r.gstin || "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={parentName(r) ? "secondary" : "outline"}>
                  {parentName(r) ?? (kind === "csa" ? "No depot" : "No CSA")}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => startEdit(r)}>Edit</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={remove.isPending}>Remove</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {r.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes this record from the master data. It cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(r.id)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
          {!isLoading && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records yet.</p>
          ) : null}
        </div>
      </div>
    </Section>
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
