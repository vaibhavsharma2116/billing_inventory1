import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export const receiveDeliveryServerFn = createServerFn({ method: "POST" })
  .validator(
    (d: { id: string; accept: boolean; note?: string | undefined; orderId?: string | undefined }) =>
      d,
  )
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !serviceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(url, serviceKey);
    const { id, accept, note, orderId: explicitOrderId } = data;

    type DeliveryRow = {
      id: string;
      order_id: string;
      distributor_id?: string | null;
      csa_id?: string | null;
      status: string;
      receive_note?: string | null;
      received_at?: string | null;
      updated_at?: string | null;
    };

    // 1. Try finding a delivery row
    let deliveryRow: DeliveryRow | null = null;
    let targetOrderId = explicitOrderId;

    if (id) {
      const { data: dRow } = await supabase
        .from("deliveries")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (dRow) {
        deliveryRow = dRow;
        targetOrderId = dRow.order_id;
      } else if (!targetOrderId) {
        // Maybe the id passed was actually an order_id
        targetOrderId = id;
      }
    }

    if (!targetOrderId) {
      throw new Error("Delivery or Order ID not found");
    }

    // 2. Fetch the order and items
    const { data: order, error: ordErr } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", targetOrderId)
      .single();

    if (ordErr || !order) {
      throw new Error("Order not found");
    }

    if (order.status === "delivered") {
      throw new Error("This consignment has already been delivered and received");
    }

    const items: Array<{ product_id: string; qty: number; free_qty?: number | null }> =
      order.order_items ?? [];

    // 3. Process according to order kind
    if (order.kind === "depot") {
      // MASTER DEPOT -> CSA
      const csaId = order.csa_id;
      if (!csaId) throw new Error("Order has no CSA destination");

      for (const it of items) {
        const totalQty = Number(it.qty || 0) + Number(it.free_qty || 0);
        if (totalQty <= 0) continue;

        const { data: csaRow } = await supabase
          .from("csa_stock")
          .select("*")
          .eq("csa_id", csaId)
          .eq("product_id", it.product_id)
          .maybeSingle();

        if (csaRow) {
          if (accept) {
            // Unlock reserved quantity into available stock
            await supabase
              .from("csa_stock")
              .update({
                reserved_qty: Math.max(0, Number(csaRow.reserved_qty || 0) - totalQty),
                updated_at: new Date().toISOString(),
              })
              .eq("id", csaRow.id);
          } else {
            // Revert stock from CSA (both physical and reserved)
            await supabase
              .from("csa_stock")
              .update({
                physical_qty: Math.max(0, Number(csaRow.physical_qty || 0) - totalQty),
                reserved_qty: Math.max(0, Number(csaRow.reserved_qty || 0) - totalQty),
                updated_at: new Date().toISOString(),
              })
              .eq("id", csaRow.id);

            // Return stock to depot
            if (order.depot_id) {
              const { data: depRow } = await supabase
                .from("depot_stock")
                .select("*")
                .eq("depot_id", order.depot_id)
                .eq("product_id", it.product_id)
                .maybeSingle();

              if (depRow) {
                await supabase
                  .from("depot_stock")
                  .update({
                    physical_qty: Number(depRow.physical_qty || 0) + totalQty,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", depRow.id);
              }
            }
          }
        }
      }
    } else {
      // CSA -> DISTRIBUTOR (primary)
      const distId = order.distributor_id;
      if (!distId) throw new Error("Order has no Distributor destination");

      for (const it of items) {
        const totalQty = Number(it.qty || 0) + Number(it.free_qty || 0);
        if (totalQty <= 0) continue;

        const { data: distRow } = await supabase
          .from("distributor_stock")
          .select("*")
          .eq("distributor_id", distId)
          .eq("product_id", it.product_id)
          .maybeSingle();

        if (distRow) {
          if (accept) {
            // Unlock reserved quantity into available stock
            await supabase
              .from("distributor_stock")
              .update({
                reserved_qty: Math.max(0, Number(distRow.reserved_qty || 0) - totalQty),
                updated_at: new Date().toISOString(),
              })
              .eq("id", distRow.id);
          } else {
            // Revert stock from distributor
            await supabase
              .from("distributor_stock")
              .update({
                physical_qty: Math.max(0, Number(distRow.physical_qty || 0) - totalQty),
                reserved_qty: Math.max(0, Number(distRow.reserved_qty || 0) - totalQty),
                updated_at: new Date().toISOString(),
              })
              .eq("id", distRow.id);
          }
        }
      }
    }

    // 4. Update order status
    await supabase
      .from("orders")
      .update({
        status: accept ? "delivered" : "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetOrderId);

    // 5. Update delivery row if exists
    if (deliveryRow) {
      await supabase
        .from("deliveries")
        .update({
          status: accept ? "received" : "rejected",
          receive_note: note?.trim() || null,
          received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryRow.id);
    }

    return {
      success: true,
      status: accept ? "delivered" : "rejected",
    };
  });
