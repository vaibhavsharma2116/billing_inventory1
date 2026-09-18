import { supabase } from "@/integrations/supabase/client";

export type PartyType = "retailer" | "distributor";

export type LedgerBill = {
  id: string;
  invoiceNo: string;
  orderNo: string;
  date: string;
  amount: number;
  paid: number;
  balance: number;
};

export type LedgerPayment = {
  id: string;
  date: string;
  amount: number;
  mode: string;
  reference: string;
  appliedTo: string;
  unapplied: number;
};

export type PartyLedger = {
  party: { id: string; type: PartyType; name: string; area: string; creditLimit: number | null };
  bills: LedgerBill[];
  payments: LedgerPayment[];
  totals: { billed: number; received: number; balance: number; unapplied: number };
};

export type PartySummary = {
  id: string;
  type: PartyType;
  name: string;
  area: string;
  billed: number;
  received: number;
  balance: number;
};

const dstr = (v: unknown) => new Date(String(v)).toLocaleDateString("en-IN");

/** All parties (retailers + distributors) with billed / received / balance rollups.
 *  When csaId is provided, only distributors mapped to that CSA are returned.
 *  When depotId is provided, only CSAs of that depot and their distributors/retailers. */
export async function fetchParties(csaId?: string | null, depotId?: string | null): Promise<PartySummary[]> {
  let distributorsQuery = csaId
    ? supabase.from("distributors").select("id, name, city, state, outstanding, csa_id").eq("csa_id", csaId)
    : supabase.from("distributors").select("id, name, city, state, outstanding, csa_id");

  if (!csaId && depotId) {
    const { data: depotCsas } = await supabase.from("csas").select("id").eq("depot_id", depotId);
    const csaIds = (depotCsas ?? []).map((c) => c.id);
    if (csaIds.length === 0) return [];
    distributorsQuery = supabase
      .from("distributors")
      .select("id, name, city, state, outstanding, csa_id")
      .in("csa_id", csaIds);
  }

  const [retailers, distributors, invoices, collections] = await Promise.all([
    supabase.from("retailers").select("id, name, city, outstanding, distributor_id"),
    distributorsQuery,
    supabase.from("invoices").select("net_amount, orders(retailer_id, distributor_id)"),
    supabase.from("collections").select("amount, retailer_id").eq("status", "approved"),
  ]);

  const billed = new Map<string, number>();
  for (const i of invoices.data ?? []) {
    const o = i.orders as { retailer_id: string | null; distributor_id: string | null } | null;
    // Retailer billing counts only against the retailer; distributor billed
    // counts only primary billing (orders with no retailer attached).
    if (o?.retailer_id) {
      billed.set(o.retailer_id, (billed.get(o.retailer_id) ?? 0) + Number(i.net_amount));
    } else if (o?.distributor_id) {
      billed.set(o.distributor_id, (billed.get(o.distributor_id) ?? 0) + Number(i.net_amount));
    }
  }
  const received = new Map<string, number>();
  for (const c of collections.data ?? []) {
    if (!c.retailer_id) continue;
    received.set(c.retailer_id, (received.get(c.retailer_id) ?? 0) + Number(c.amount));
  }

  const rows: PartySummary[] = [];
  const scopedDistributorIds = depotId
    ? new Set((distributors.data ?? []).map((x) => x.id))
    : null;
  for (const r of retailers.data ?? []) {
    if (scopedDistributorIds && (!r.distributor_id || !scopedDistributorIds.has(r.distributor_id))) continue;
    const b = billed.get(r.id) ?? 0;
    const p = received.get(r.id) ?? 0;
    rows.push({
      id: r.id,
      type: "retailer",
      name: r.name,
      area: r.city ?? "—",
      billed: b,
      received: p,
      balance: b - p || Number(r.outstanding ?? 0),
    });
  }
  for (const d of distributors.data ?? []) {
    const b = billed.get(d.id) ?? 0;
    rows.push({
      id: d.id,
      type: "distributor",
      name: d.name,
      area: [d.city, d.state].filter(Boolean).join(", ") || "—",
      billed: b,
      received: 0,
      balance: b || Number(d.outstanding ?? 0),
    });
  }
  return rows.sort((a, b) => b.balance - a.balance);
}

/** Bill-wise ledger with FIFO payment allocation for one party.
 *  When csaId is provided, distributor ledgers are restricted to that CSA mapping. */
export async function fetchPartyLedger(
  type: PartyType,
  id: string,
  csaId?: string | null,
  depotId?: string | null,
): Promise<PartyLedger> {
  const partyRes =
    type === "retailer"
      ? await supabase.from("retailers").select("id, name, city, credit_limit, distributor_id").eq("id", id).maybeSingle()
      : await supabase.from("distributors").select("id, name, city, state, csa_id").eq("id", id).maybeSingle();

  if (type === "distributor" && csaId) {
    const d = partyRes.data as { csa_id?: string | null } | null;
    if (d?.csa_id !== csaId) {
      throw new Error("This distributor is not mapped to your CSA.");
    }
  }

  if (depotId && !csaId) {
    const { data: depotCsas } = await supabase.from("csas").select("id").eq("depot_id", depotId);
    const csaIds = new Set((depotCsas ?? []).map((c) => c.id));
    if (type === "distributor") {
      const d = partyRes.data as { csa_id?: string | null } | null;
      if (!d?.csa_id || !csaIds.has(d.csa_id)) {
        throw new Error("This distributor is not mapped to your depot.");
      }
    } else {
      const r = partyRes.data as { distributor_id?: string | null } | null;
      if (r?.distributor_id) {
        const { data: dist } = await supabase
          .from("distributors")
          .select("csa_id")
          .eq("id", r.distributor_id)
          .maybeSingle();
        if (!dist?.csa_id || !csaIds.has(dist.csa_id)) {
          throw new Error("This retailer is not mapped to your depot.");
        }
      }
    }
  }

  const invCol = type === "retailer" ? "orders.retailer_id" : "orders.distributor_id";
  let invQuery = supabase
    .from("invoices")
    .select("id, invoice_no, net_amount, created_at, orders!inner(order_no, retailer_id, distributor_id)")
    .eq(invCol, id)
    .order("created_at", { ascending: true });
  // Distributor ledger shows only its own primary billing, never retailer sales routed through it.
  if (type === "distributor") invQuery = invQuery.is("orders.retailer_id", null);
  const [invoices, collections] = await Promise.all([
    invQuery,
    type === "retailer"
      ? supabase
          .from("collections")
          .select("id, amount, mode, reference, created_at")
          .eq("retailer_id", id)
          .eq("status", "approved")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; amount: number; mode: string; reference: string | null; created_at: string }[] }),
  ]);

  const p = partyRes.data as
    | { id: string; name: string; city: string | null; state?: string | null; credit_limit?: number }
    | null;

  const bills: LedgerBill[] = (invoices.data ?? []).map((i) => ({
    id: i.id,
    invoiceNo: i.invoice_no,
    orderNo: (i.orders as { order_no: string } | null)?.order_no ?? "—",
    date: dstr(i.created_at),
    amount: Number(i.net_amount),
    paid: 0,
    balance: Number(i.net_amount),
  }));

  const payments: LedgerPayment[] = [];
  let cursor = 0;
  for (const c of collections.data ?? []) {
    let left = Number(c.amount);
    const applied: string[] = [];
    while (left > 0.01 && cursor < bills.length) {
      const bill = bills[cursor]!;
      const use = Math.min(left, bill.balance);
      if (use > 0) {
        bill.paid += use;
        bill.balance -= use;
        applied.push(bill.invoiceNo);
        left -= use;
      }
      if (bill.balance <= 0.01) cursor += 1;
      else break;
    }
    payments.push({
      id: c.id,
      date: dstr(c.created_at),
      amount: Number(c.amount),
      mode: c.mode,
      reference: c.reference ?? "—",
      appliedTo: applied.length ? applied.join(", ") : "On account",
      unapplied: left,
    });
  }

  const billedTotal = bills.reduce((s, b) => s + b.amount, 0);
  const receivedTotal = payments.reduce((s, x) => s + x.amount, 0);
  const unapplied = payments.reduce((s, x) => s + x.unapplied, 0);

  return {
    party: {
      id,
      type,
      name: p?.name ?? "Party",
      area: [p?.city, p?.state].filter(Boolean).join(", ") || "—",
      creditLimit: typeof p?.credit_limit === "number" ? p.credit_limit : null,
    },
    bills,
    payments,
    totals: {
      billed: billedTotal,
      received: receivedTotal,
      balance: bills.reduce((s, b) => s + b.balance, 0),
      unapplied,
    },
  };
}
