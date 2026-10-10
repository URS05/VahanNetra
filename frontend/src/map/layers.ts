import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Layer } from "@deck.gl/core";
import { PathStyleExtension } from "@deck.gl/extensions";
import { IconLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { CONFIG } from "../config";
import type { LonLat } from "../lib/geo";

const dash = new PathStyleExtension({ dash: true });

const ARROW = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path d="M6 32h40M46 32L30 16M46 32L30 48" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`;

export type HeatPoint = { position: LonLat; weight: number };
export type PathDatum = { id: string; path: LonLat[]; color: [number, number, number, number] };
export type ArrowDatum = { position: LonLat; angle: number };

export function buildLayers(input: {
  heatReal: HeatPoint[];
  heatSim: HeatPoint[];
  heatSynth: HeatPoint[];
  solid: PathDatum[];
  dashed: PathDatum[];
  arrows: ArrowDatum[];
  vehicle: LonLat | null;
}): Layer[] {
  const layers: Layer[] = [];
  if (input.heatReal.length) {
    layers.push(
      new HeatmapLayer<HeatPoint>({
        id: "heat-real",
        data: input.heatReal,
        getPosition: (d) => d.position,
        getWeight: (d) => d.weight,
        radiusPixels: CONFIG.heatmapRadiusPx,
        colorRange: [
          [40, 70, 120, 40],
          [70, 140, 210, 120],
          [180, 220, 255, 180],
        ],
      }),
    );
  }
  if (input.heatSim.length) {
    layers.push(
      new HeatmapLayer<HeatPoint>({
        id: "heat-sim",
        data: input.heatSim,
        getPosition: (d) => d.position,
        getWeight: (d) => d.weight,
        radiusPixels: CONFIG.heatmapRadiusPx,
        colorRange: [
          [90, 40, 70, 30],
          [210, 90, 140, 110],
          [255, 180, 210, 170],
        ],
      }),
    );
  }
  if (input.heatSynth.length) {
    layers.push(
      new HeatmapLayer<HeatPoint>({
        id: "heat-synth",
        data: input.heatSynth,
        getPosition: (d) => d.position,
        getWeight: (d) => d.weight,
        radiusPixels: CONFIG.heatmapRadiusPx,
        colorRange: [
          [40, 70, 50, 30],
          [80, 160, 110, 120],
          [180, 230, 190, 170],
        ],
      }),
    );
  }
  if (input.solid.length) {
    layers.push(
      new PathLayer<PathDatum>({
        id: "paths-solid",
        data: input.solid,
        getPath: (d) => d.path,
        getColor: (d) => d.color,
        getWidth: 4,
        widthMinPixels: 3,
        capRounded: true,
        jointRounded: true,
      }),
    );
  }
  if (input.dashed.length) {
    const dashedProps = {
      id: "paths-dashed",
      data: input.dashed,
      getPath: (d: PathDatum) => d.path,
      getColor: (d: PathDatum) => d.color,
      getWidth: 3,
      widthMinPixels: 2,
      getDashArray: [6, 4],
      dashJustified: true,
      extensions: [dash],
    };
    layers.push(new PathLayer<PathDatum>(dashedProps));
  }
  if (input.arrows.length) {
    layers.push(
      new IconLayer<ArrowDatum>({
        id: "arrows",
        data: input.arrows,
        getPosition: (d) => d.position,
        getAngle: (d) => d.angle,
        getIcon: () => "arrow",
        iconAtlas: ARROW,
        iconMapping: {
          arrow: { x: 0, y: 0, width: 64, height: 64, anchorY: 32, mask: true },
        },
        getColor: [255, 255, 255, 230],
        getSize: 22,
        sizeUnits: "pixels",
      }),
    );
  }
  if (input.vehicle) {
    layers.push(
      new ScatterplotLayer<{ position: LonLat }>({
        id: "vehicle",
        data: [{ position: input.vehicle }],
        getPosition: (d) => d.position,
        getFillColor: [255, 255, 255, 240],
        getLineColor: [0, 0, 0, 220],
        getRadius: 10,
        radiusUnits: "pixels",
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: 2,
      }),
    );
  }
  return layers;
}
