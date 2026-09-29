import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { useMappedCsas } from "@/hooks/useMappedCsas";
import { useMappedDistributors } from "@/hooks/useMappedDistributors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DistributorVisitDialog({
  invalidateKeys = ["salesman-day"],
  trigger,
}: {
  invalidateKeys?: string[] | undefined;
  trigger?: React.ReactNode | undefined;
}) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  
  const [visitType, setVisitType] = useState<"distributor" | "csa">("distributor");
  const { data: distributors = [] } = useMappedDistributors(open && visitType === "distributor");
  const { data: csas = [] } = useMappedCsas(open && visitType === "csa");

  const [partyId, setPartyId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setVisitType("distributor");
    setPartyId("");
    setName("");
    setPhone("");
    setAddress("");
    setNotes("");
  };

  const save = useMutation({
    mutationFn: async () => {
      const userId = me?.profile?.id;
      if (!userId) throw new Error("Not signed in");
      
      const isDistributor = visitType === "distributor";
      const picked = isDistributor 
        ? distributors.find((d) => d.id === partyId)
        : csas.find((c) => c.id === partyId);

      const finalName = (picked?.name ?? name).trim();
      if (!finalName) throw new Error(`Please select a ${isDistributor ? "distributor" : "CSA"} or type the name`);

      const { error } = await supabase.from("distributor_visits").insert({
        salesman_id: userId,
        distributor_id: isDistributor && picked ? picked.id : null,
        distributor_name: finalName + (!isDistributor && picked ? " (CSA)" : ""),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Visit saved successfully");
      setOpen(false);
      reset();
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Building2 className="size-4" /> Add Visit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Party Visit</DialogTitle>
          <DialogDescription>
            Record today&apos;s visit. It is counted in your daily visits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
            <button
              onClick={() => { setVisitType("distributor"); setPartyId(""); }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${visitType === "distributor" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Distributor
            </button>
            <button
              onClick={() => { setVisitType("csa"); setPartyId(""); }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${visitType === "csa" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              CSA
            </button>
          </div>

          <div className="space-y-1.5">
            <Label>{visitType === "distributor" ? "Distributor" : "CSA"}</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger>
                <SelectValue placeholder={visitType === "distributor" ? "Select mapped distributor" : "Select mapped CSA"} />
              </SelectTrigger>
              <SelectContent>
                {(visitType === "distributor" ? distributors : csas).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}{d.city ? ` — ${d.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!partyId ? (
            <div className="space-y-1.5">
              <Label>{visitType === "distributor" ? "Distributor firm name" : "CSA firm name"}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Firm / party name" />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Mobile number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" inputMode="tel" />
          </div>

          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shop / godown address" />
          </div>

          <div className="space-y-1.5">
            <Label>Remark</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Discussion, stock position, payment, next action…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>Save visit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
