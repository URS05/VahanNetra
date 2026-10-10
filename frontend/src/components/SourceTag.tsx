import type { SourceTier } from "../api/types";
import { SimulatedTag } from "./SimulatedTag";

export function SourceTag({ source }: { source: SourceTier | string | undefined }) {
  if (source === "simulated") return <SimulatedTag />;
  if (source === "synthetic") return <SimulatedTag label="Synthetic" />;
  return null;
}
