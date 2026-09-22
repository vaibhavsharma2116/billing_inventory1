import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { useMappedDistributors } from "@/hooks/useMappedDistributors";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Form = {
  name: string;
  owner_name: string;
  phone: string;
  address: string;
  city: string;
  area: string;
  gstin: string;
  state: string;
  pincode: string;
  email: string;
  margin_pct: string;
  display_amount: string;
};

const empty: Form = { name: "", owner_name: "", phone: "", address: "", city: "", area: "", gstin: "", state: "", pincode: "", email: "", margin_pct: "", display_amount: "" };

const RETAILER_TYPES = [
  { value: "ba", label: "BA (Beauty Advisor)" },
  { value: "rba", label: "RBA (Roaming Beauty Advisor)" },
  { value: "no_ba", label: "Retail Outlet" },
] as const;

export function AddRetailerDialog({ invalidateKeys = [] }: { invalidateKeys?: string[] }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [retailerType, setRetailerType] = useState<string>("no_ba");
  const [distributorId, setDistributorId] = useState<string | null>(null);

  const { data: distributors = [] } = useMappedDistributors(open);


  const effectiveDistributorId = distributorId ?? me?.profile?.distributor_id ?? null;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      const userId = me?.profile?.id;
      if (!userId) throw new Error("Login required");
      if (!form.name.trim()) throw new Error("Shop name is required");
      if (!effectiveDistributorId) throw new Error("Please select a distributor");
      const { error } = await supabase.from("retailers").insert({
        name: form.name.trim(),
        owner_name: form.owner_name.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        area: form.area.trim() || null,
        gstin: form.gstin.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
        email: form.email.trim() || null,
        margin_pct: Number(form.margin_pct) || 0,
        display_amount: Number(form.display_amount) || 0,
        retailer_type: retailerType,
        distributor_id: effectiveDistributorId,
        created_by: userId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Retailer added and mapped to distributor");
      setForm(empty);
      setRetailerType("no_ba");
      setDistributorId(null);
      setOpen(false);
      const keys = invalidateKeys.length ? invalidateKeys : ["salesman-day", "order-booking"];
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          + Add Retailer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Retailer</DialogTitle>
          <DialogDescription>Add a shop that is not in your list yet.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="r-name">Shop name *</Label>
            <Input id="r-name" value={form.name} onChange={set("name")} placeholder="Sharma Cosmetics" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-owner">Owner</Label>
              <Input id="r-owner" value={form.owner_name} onChange={set("owner_name")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-phone">Phone</Label>
              <Input id="r-phone" inputMode="tel" value={form.phone} onChange={set("phone")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-address">Address</Label>
            <Input id="r-address" value={form.address} onChange={set("address")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-city">City</Label>
              <Input id="r-city" value={form.city} onChange={set("city")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-state">State</Label>
              <Input id="r-state" value={form.state} onChange={set("state")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-area">Area</Label>
              <Input id="r-area" value={form.area} onChange={set("area")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-pincode">Pincode</Label>
              <Input id="r-pincode" inputMode="numeric" value={form.pincode} onChange={set("pincode")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-email">Email</Label>
              <Input id="r-email" type="email" value={form.email} onChange={set("email")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-gstin">GSTIN</Label>
            <Input id="r-gstin" value={form.gstin} onChange={set("gstin")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-margin">Retail margin %</Label>
              <Input id="r-margin" inputMode="decimal" value={form.margin_pct} onChange={set("margin_pct")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-display">Display amount</Label>
              <Input id="r-display" inputMode="numeric" value={form.display_amount} onChange={set("display_amount")} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Margin and display amount are applied automatically when this retailer's bill is created.
          </p>
          <div className="grid gap-1.5">
            <Label>Retailer type *</Label>
            <Select value={retailerType} onValueChange={setRetailerType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {RETAILER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Map to distributor *</Label>
            <Select value={effectiveDistributorId ?? ""} onValueChange={(v) => setDistributorId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select distributor" />
              </SelectTrigger>
              <SelectContent>
                {distributors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.city ? ` (${d.city})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              The retailer's orders, stock and credit will be tracked against this distributor.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save retailer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
