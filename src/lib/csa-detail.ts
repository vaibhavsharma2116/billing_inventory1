import { supabase } from "@/integrations/supabase/client";

export async function fetchCsaDetail(csaId: string) {
  const [csaRes, distributors, stock, orders, deliveries, payments] = await Promise.all([
    supabase.from("csas").select("*, depots(name, city)").eq("id", csaId).maybeSingle(),
    supabase.from("distributors").select("id, name, city, state, phone, email, outstanding").eq("csa_id", csaId).order("name"),
    supabase
      .from("csa_stock")
      .select("id, physical_qty, reserved_qty, products(name, sku, ptr)")
      .eq("csa_id", csaId),
    supabase
      .from("orders")
      .select("id, order_no, kind, status, total_amount, created_at, distributors(name)")
      .eq("csa_id", csaId)
      .order("created_at", { ascending: false }),
    supabase
      .from("deliveries")
      .select("id, transporter_name, lr_no, transporter_mobile, vehicle_no, dispatch_date, status, distributors(name)")
      .eq("csa_id", csaId)
      .order("created_at", { ascending: false }),
    supabase
      .from("csa_payments")
      .select("id, amount, mode, reference, status, created_at, distributors(name)")
      .eq("csa_id", csaId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    csa: csaRes.data,
    distributors: distributors.data ?? [],
    stock: stock.data ?? [],
    orders: orders.data ?? [],
    deliveries: deliveries.data ?? [],
    payments: payments.data ?? [],
  };
}

export type CsaDetail = Awaited<ReturnType<typeof fetchCsaDetail>>;
