import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/sfa/Shell";
import { Badge } from "@/components/ui/badge";
import { inr } from "@/lib/sfa";

export function PaymentHistory({ userId }: { userId: string | undefined }) {
  const { data: history = [] } = useQuery({
    queryKey: ["payment-in-history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, amount, mode, status, created_at, retailers(name, city)")
        .eq("salesman_id", userId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  if (!userId || history.length === 0) return null;

  return (
    <Section title="Payment Requests (Recent)">
      <div className="divide-y divide-border/60">
        {history.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">
                {(r.retailers as { name: string } | null)?.name ?? "Unknown Retailer"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {inr(r.amount)} • {r.mode}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {format(new Date(r.created_at), "MMM d, h:mm a")}
              </p>
            </div>
            <Badge 
              variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} 
              className="shrink-0 text-[10px] uppercase"
            >
              {r.status}
            </Badge>
          </div>
        ))}
      </div>
    </Section>
  );
}
