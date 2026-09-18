import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { agoLabel, minutesAgo, type SalesmanPosition } from "./live-map-types";

const markerIcon = (fresh: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);background:${
      fresh ? "#16a34a" : "#a1a1aa"
    }"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

function FitBounds({ points }: { points: SalesmanPosition[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, points]);
  return null;
}

export default function LiveMap({ positions }: { positions: SalesmanPosition[] }) {
  const center = useMemo<[number, number]>(
    () => (positions[0] ? [positions[0].lat, positions[0].lng] : [22.9734, 78.6569]),
    [positions],
  );

  return (
    <MapContainer
      center={center}
      zoom={positions.length ? 11 : 5}
      scrollWheelZoom
      style={{ height: "480px", width: "100%" }}
      className="rounded-2xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={positions} />
      {positions.map((p) => (
        <Marker key={p.userId} position={[p.lat, p.lng]} icon={markerIcon(minutesAgo(p.recordedAt) <= 15)}>
          <Popup>
            <strong>{p.name}</strong>
            <br />
            Last update: {agoLabel(p.recordedAt)}
            <br />
            {new Date(p.recordedAt).toLocaleString("en-IN")}
            <br />
            {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
            {p.accuracy ? ` (±${Math.round(p.accuracy)}m)` : ""}
            <br />
            Status: {p.punchedIn ? "Punched in" : "Punched out"}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
