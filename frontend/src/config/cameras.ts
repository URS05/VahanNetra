import type { Camera } from "../api/types";

/**
 * verify coordinates
 * Used only when GET /api/cameras fails. Values match contracts/cameras.json.
 */
export const FALLBACK_CAMERAS: Camera[] = [
  {
    camera_id: "CAM01",
    name: "Hitech City Junction",
    lat: 17.450638,
    lon: 78.382001,
    heading: 135,
    lanes: 4,
    status: "online",
  },
  {
    camera_id: "CAM02",
    name: "Madhapur",
    lat: 17.44096,
    lon: 78.391643,
    heading: 180,
    lanes: 3,
    status: "online",
  },
  {
    camera_id: "CAM03",
    name: "Kondapur",
    lat: 17.458785,
    lon: 78.373051,
    heading: 270,
    lanes: 3,
    status: "online",
  },
  {
    camera_id: "CAM04",
    name: "Gachibowli Junction",
    lat: 17.443465,
    lon: 78.35224,
    heading: 225,
    lanes: 4,
    status: "online",
  },
  {
    camera_id: "CAM05",
    name: "Financial District",
    lat: 17.421804,
    lon: 78.337995,
    heading: 200,
    lanes: 3,
    status: "online",
  },
];

export function cameraById(cameras: Camera[], id: string): Camera | undefined {
  return cameras.find((camera) => camera.camera_id === id);
}
