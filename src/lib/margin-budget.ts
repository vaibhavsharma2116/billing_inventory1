import { supabase } from "@/integrations/supabase/client";

/**
 * Margin budget engine.
 *
 * Company allows every channel partner a fixed margin:
 *   Distributor  = PTR (retail rate)      - PTS (distributor rate)
 *   CSA          = PTS (distributor rate) - CSA rate
 *
 * Whatever they actually bill below the standard rate (plus free goods and
 * approved extra-margin/display claims) is margin already given away.
 * Remaining budget = allowed - given.
 */

export type PartyMargin = {
  id: string;
  name: string;
  area: string;
  type: "distributor" | "csa";
  sales: number;
  allowed: number;
  givenBilling: number;
  givenFree: number;
  givenClaims: number;
  given: number;
  balance: number;
  orders: number;
};

export type MarginBudget = {
  parties: PartyMargin[];
  totals: {
    sales: number;
    allowed: number;
    given: number;
    givenBilling: number;
    givenFree: number;
    givenClaims: number;
    balance: number;
    overspent: number;
  };
};

type Scope = {
  distributorIds?: string[] | null;
  csaIds?: string[] | null;
  from?: string | undefined;
  to?: string | undefined;
};

const num = (v: unknown) => Number(v ?? 0);

export async function fetchMarginBudget(scope: Scope): Promise<MarginBudget> {
  const fromIso = scope.from ? new Date(scope.from + "T00:00:00").toISOString() : null;
  const toIso = scope.to ? new Date(scope.to + "T23:59:59").toISOString() : null;

  let ordersQ = supabase
    .from("orders")
    .select(
      "id, kind, status, created_at, distributor_id, csa_id, total_amount, discount_amount, order_items(qty, free_qty, rate, product_id)",
    )
    .in("kind", ["secondary", "primary"])
    .neq("status", "rejected");
  if (fromIso) ordersQ = ordersQ.gte("created_at", fromIso);
  if (toIso) ordersQ = ordersQ.lte("created_at", toIso);

  const [orders, products, claims, distributors, csas] = await Promise.all([
    ordersQ,
    supabase.from("products").select("id, mrp, ptr, pts, csa_rate"),
    supabase.from("claims").select("id, distributor_id, status, approved_amount, claim_amount, created_at"),
    supabase.from("distributors").select("id, name, city, state, csa_id"),
    supabase.from("csas").select("id, name, city, state"),
  ]);

  const priceOf = new Map(
    (products.data ?? []).map((p) => [p.id, { mrp: num(p.mrp), ptr: num(p.ptr), pts: num(p.pts), csa: num(p.csa_rate) }]),
  );

  const rows = new Map<string, PartyMargin>();
  const seed = (type: "distributor" | "csa", id: string, name: string, area: string) => {
    const key = `${type}:${id}`;
    let r = rows.get(key);
    if (!r) {
      r = {
        id,
        name,
        area,
        type,
        sales: 0,
        allowed: 0,
        givenBilling: 0,
        givenFree: 0,
        givenClaims: 0,
        given: 0,
        balance: 0,
        orders: 0,
      };
      rows.set(key, r);
    }
    return r;
  };

  const distIds = scope.distributorIds ?? null;
  const csaIds = scope.csaIds ?? null;

  for (const d of distributors.data ?? []) {
    if (distIds && !distIds.includes(d.id)) continue;
    seed("distributor", d.id, d.name, [d.city, d.state].filter(Boolean).join(", ") || "—");
  }
  for (const c of csas.data ?? []) {
    if (csaIds && !csaIds.includes(c.id)) continue;
    seed("csa", c.id, c.name, [c.city, c.state].filter(Boolean).join(", ") || "—");
  }

  for (const o of orders.data ?? []) {
    const isSecondary = o.kind === "secondary";
    const partyId = isSecondary ? o.distributor_id : o.csa_id;
    if (!partyId) continue;
    const type = isSecondary ? "distributor" : "csa";
    const key = `${type}:${partyId}`;
    const row = rows.get(key);
    if (!row) continue;

    const items = (o.order_items ?? []) as { qty: number; free_qty: number; rate: number; product_id: string }[];
    if (items.length === 0) continue;
    row.orders += 1;

    for (const it of items) {
      const p = priceOf.get(it.product_id);
      if (!p) continue;
      const standard = isSecondary ? p.ptr : p.pts;
      const cost = isSecondary ? p.pts : p.csa;
      const qty = num(it.qty);
      const free = num(it.free_qty);
      const rate = num(it.rate);

      // Reserve 10% of MRP for the distributor's own profit
      const reservedMargin = isSecondary ? (p.mrp * 10) / 100 : 0;

      row.sales += qty * rate;
      row.allowed += Math.max(standard - cost - reservedMargin, 0) * qty;
      row.givenBilling += Math.max(standard - rate, 0) * qty;
      row.givenFree += standard * free;
    }

    row.givenBilling += num((o as any).discount_amount);
  }

  for (const c of claims.data ?? []) {
    if (c.status !== "approved" || !c.distributor_id) continue;
    if (fromIso && c.created_at < fromIso) continue;
    if (toIso && c.created_at > toIso) continue;
    const row = rows.get(`distributor:${c.distributor_id}`);
    if (!row) continue;
    row.givenClaims += num(c.approved_amount ?? c.claim_amount);
  }

  const parties = [...rows.values()]
    .map((r) => {
      r.given = r.givenBilling + r.givenFree + r.givenClaims;
      r.balance = r.allowed - r.given;
      return r;
    })
    .filter((r) => r.allowed > 0 || r.given > 0)
    .sort((a, b) => b.allowed - a.allowed);

  const totals = parties.reduce(
    (t, r) => ({
      sales: t.sales + r.sales,
      allowed: t.allowed + r.allowed,
      given: t.given + r.given,
      givenBilling: t.givenBilling + r.givenBilling,
      givenFree: t.givenFree + r.givenFree,
      givenClaims: t.givenClaims + r.givenClaims,
      balance: t.balance + r.balance,
      overspent: t.overspent + (r.balance < 0 ? -r.balance : 0),
    }),
    { sales: 0, allowed: 0, given: 0, givenBilling: 0, givenFree: 0, givenClaims: 0, balance: 0, overspent: 0 },
  );

  return { parties, totals };
}
