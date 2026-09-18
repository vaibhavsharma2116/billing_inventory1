export type SalesmanPosition = {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  recordedAt: string;
  accuracy: number | null;
  punchedIn: boolean;
};

export function minutesAgo(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function agoLabel(iso: string) {
  const m = minutesAgo(iso);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}
