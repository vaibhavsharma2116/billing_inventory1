import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TrackPoint = { lat: number; lng: number; accuracy: number | null; at: string };

const PING_INTERVAL_MS = 2 * 60 * 1000; // save a position at most every 2 minutes

function readPosition(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GPS is not supported on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => reject(new Error(err.message || "Unable to read GPS")),
      opts,
    );
  });
}

/** High-accuracy first, then a fast coarse fallback so indoor/desktop users are not blocked. */
export function getPosition(timeout = 10000): Promise<GeolocationPosition> {
  return readPosition({ enableHighAccuracy: true, timeout, maximumAge: 0 }).catch(() =>
    readPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }),
  );
}

/** Never throws — returns null when GPS is unavailable or denied. */
export async function tryGetPosition(): Promise<GeolocationPosition | null> {
  try {
    return await getPosition();
  } catch {
    return null;
  }
}

/**
 * Keeps a live GPS watch running while the salesman is punched in and
 * stores a location ping every few minutes until punch out.
 */
export function useLocationTracking(active: boolean, userId?: string) {
  const [last, setLast] = useState<TrackPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(0);

  useEffect(() => {
    if (!active || !userId) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("GPS is not supported on this device");
      return;
    }

    const save = async (pos: GeolocationPosition) => {
      const point: TrackPoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        at: new Date().toISOString(),
      };
      setLast(point);
      setError(null);
      const now = Date.now();
      if (now - lastSaved.current < PING_INTERVAL_MS) return;
      lastSaved.current = now;
      await supabase.from("location_pings").insert({
        user_id: userId,
        work_date: new Date().toISOString().slice(0, 10),
        lat: point.lat,
        lng: point.lng,
        accuracy: point.accuracy,
        recorded_at: point.at,
      });
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => void save(pos),
      (err) => setError(err.message || "GPS unavailable — please keep location on"),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, userId]);

  useEffect(() => {
    if (!active) {
      setLast(null);
      setError(null);
      lastSaved.current = 0;
    }
  }, [active]);

  return { last, error };
}
