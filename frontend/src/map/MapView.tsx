import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl, { type Marker } from "maplibre-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Camera } from "../api/types";
import { CONFIG } from "../config";
import type { LonLat } from "../lib/geo";
import { buildLayers, type ArrowDatum, type HeatPoint, type PathDatum } from "./layers";

export type MapHandle = {
  flyTo: (lon: number, lat: number) => void;
  fit: () => void;
};

type Props = {
  cameras: Camera[];
  selectedId: string | null;
  pulsedIds: string[];
  onSelect: (id: string) => void;
  heatReal: HeatPoint[];
  heatSim: HeatPoint[];
  heatSynth: HeatPoint[];
  solid: PathDatum[];
  dashed: PathDatum[];
  arrows: ArrowDatum[];
  labels: { id: string; position: LonLat; text: string }[];
  vehicle: { position: LonLat; label: string } | null;
  onStyleError: (message: string) => void;
};

export const MapView = forwardRef<MapHandle, Props>(function MapView(props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const cameraMarkers = useRef<Marker[]>([]);
  const labelMarkers = useRef<Marker[]>([]);
  const vehicleMarker = useRef<Marker | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useImperativeHandle(ref, () => ({
    flyTo: (lon, lat) => {
      mapRef.current?.flyTo({ center: [lon, lat], zoom: 14, essential: true });
    },
    fit: () => fitCameras(mapRef.current, propsRef.current.cameras),
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CONFIG.mapStyle,
      center: [CONFIG.mapCenter.longitude, CONFIG.mapCenter.latitude],
      zoom: CONFIG.mapCenter.zoom,
      attributionControl: {},
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    map.on("error", (event) => {
      const message = event.error?.message || "Map style failed to load";
      propsRef.current.onStyleError(message);
    });
    map.on("load", () => {
      const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
      map.addControl(overlay);
      overlayRef.current = overlay;
      fitCameras(map, propsRef.current.cameras);
    });
    mapRef.current = map;
    return () => {
      cameraMarkers.current.forEach((marker) => marker.remove());
      labelMarkers.current.forEach((marker) => marker.remove());
      vehicleMarker.current?.remove();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    cameraMarkers.current.forEach((marker) => marker.remove());
    cameraMarkers.current = props.cameras
      .filter((camera) => camera && typeof camera.lon === "number" && typeof camera.lat === "number" && !isNaN(camera.lon) && !isNaN(camera.lat))
      .map((camera) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cam-marker";
        button.textContent = camera.camera_id;
        button.setAttribute("aria-label", `${camera.camera_id} ${camera.name}`);
        button.style.cssText = markerStyle(props.selectedId === camera.camera_id, props.pulsedIds.includes(camera.camera_id));
        button.onclick = () => propsRef.current.onSelect(camera.camera_id);
        return new maplibregl.Marker({ element: button })
          .setLngLat([camera.lon, camera.lat])
          .addTo(map);
      });
  }, [props.cameras, props.selectedId, props.pulsedIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    labelMarkers.current.forEach((marker) => marker.remove());
    labelMarkers.current = props.labels
      .filter(
        (label) =>
          label &&
          Array.isArray(label.position) &&
          label.position.length >= 2 &&
          typeof label.position[0] === "number" &&
          typeof label.position[1] === "number" &&
          !isNaN(label.position[0]) &&
          !isNaN(label.position[1]),
      )
      .map((label) => {
        const el = document.createElement("div");
        el.textContent = label.text;
        el.style.cssText =
          "background:#111;color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:2px 6px;font:11px Inter,sans-serif;";
        return new maplibregl.Marker({ element: el }).setLngLat(label.position).addTo(map);
      });
  }, [props.labels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (
      !props.vehicle ||
      !Array.isArray(props.vehicle.position) ||
      props.vehicle.position.length < 2 ||
      typeof props.vehicle.position[0] !== "number" ||
      typeof props.vehicle.position[1] !== "number" ||
      isNaN(props.vehicle.position[0]) ||
      isNaN(props.vehicle.position[1])
    ) {
      vehicleMarker.current?.remove();
      vehicleMarker.current = null;
      return;
    }
    try {
      const pos: [number, number] = [props.vehicle.position[0], props.vehicle.position[1]];
      if (!vehicleMarker.current) {
        const el = document.createElement("div");
        el.style.cssText =
          "transform:translateY(-18px);background:#fff;color:#111;border-radius:999px;padding:2px 6px;font:11px Inter,sans-serif;font-weight:600;";
        vehicleMarker.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat(pos)
          .addTo(map);
      } else {
        vehicleMarker.current.setLngLat(pos);
      }
      vehicleMarker.current.getElement().textContent = props.vehicle.label;
    } catch {
      // Degrade gracefully without crashing
    }
  }, [props.vehicle]);

  useEffect(() => {
    overlayRef.current?.setProps({
      layers: buildLayers({
        heatReal: props.heatReal,
        heatSim: props.heatSim,
        heatSynth: props.heatSynth,
        solid: props.solid,
        dashed: props.dashed,
        arrows: props.arrows,
        vehicle: props.vehicle?.position ?? null,
      }),
    });
  }, [props.heatReal, props.heatSim, props.heatSynth, props.solid, props.dashed, props.arrows, props.vehicle]);

  return <div ref={containerRef} className="h-full w-full" />;
});

function markerStyle(selected: boolean, pulsed: boolean): string {
  const scale = pulsed ? "scale(1.15)" : "scale(1)";
  return [
    "border:0",
    "cursor:pointer",
    "border-radius:999px",
    "padding:4px 8px",
    "font:12px/1 Inter,sans-serif",
    "font-weight:600",
    selected ? "background:#fff;color:#111" : "background:#1c1c1f;color:#fff",
    "box-shadow:0 4px 14px rgba(0,0,0,.35)",
    `transform:${scale}`,
  ].join(";");
}

function fitCameras(map: maplibregl.Map | null, cameras: Camera[]) {
  if (!map || cameras.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  cameras.forEach((camera) => bounds.extend([camera.lon, camera.lat]));
  map.fitBounds(bounds, { padding: 80, duration: 600, maxZoom: 14 });
}
