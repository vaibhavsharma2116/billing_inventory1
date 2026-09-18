export const inr = (n: number | null | undefined) =>
  "₹" + Math.round(Number(n ?? 0)).toLocaleString("en-IN");

export const compactInr = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(2) + " L";
  if (v >= 1000) return "₹" + (v / 1000).toFixed(1) + "K";
  return inr(v);
};

export const stockTone = (available: number) =>
  available === 0 ? "danger" : available <= 10 ? "warn" : "ok";

export const GST_RATE = 0.18;

export function gstBreakup(taxableValue: number) {
  const tax = taxableValue * GST_RATE;
  return {
    taxable: taxableValue,
    cgst: tax / 2,
    sgst: tax / 2,
    net: taxableValue + tax,
  };
}

export type SchemeRow = {
  id: string;
  title: string;
  product_id: string | null;
  min_qty: number | null;
  free_qty: number | null;
  min_value: number | null;
  discount_pct: number | null;
};

export function applyQtyScheme(schemes: SchemeRow[], productId: string, qty: number) {
  const s = schemes.find((x) => x.product_id === productId && x.min_qty && x.free_qty);
  if (!s || !s.min_qty || !s.free_qty || qty < s.min_qty) return { freeQty: 0, scheme: null as SchemeRow | null };
  return { freeQty: Math.floor(qty / s.min_qty) * s.free_qty, scheme: s };
}

export function valueScheme(schemes: SchemeRow[], orderValue: number) {
  const s = schemes.find((x) => x.min_value && x.discount_pct && orderValue >= x.min_value);
  if (!s) return { discount: 0, scheme: null as SchemeRow | null };
  return { discount: (orderValue * (s.discount_pct ?? 0)) / 100, scheme: s };
}


export type IncentiveSlab = { minPct: number; pct: number; label: string };

export const INCENTIVE_SLABS: IncentiveSlab[] = [
  { minPct: 120, pct: 5, label: "120% and above — 5% of sales" },
  { minPct: 100, pct: 3, label: "100% to 119% — 3% of sales" },
  { minPct: 80, pct: 1.5, label: "80% to 99% — 1.5% of sales" },
  { minPct: 0, pct: 0, label: "Below 80% — no incentive" },
];

export function incentiveFor(sales: number, target: number) {
  const achievement = target > 0 ? (sales / target) * 100 : 0;
  const slab = INCENTIVE_SLABS.find((s) => achievement >= s.minPct) ?? INCENTIVE_SLABS[INCENTIVE_SLABS.length - 1]!;
  return { achievement, slab, amount: (sales * slab.pct) / 100 };
}
