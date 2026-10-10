import { NotImplementedError } from "../api/missing";
import { EmptyState } from "./ui/EmptyState";

export function endpointLabel(error: unknown): string | null {
  if (error instanceof NotImplementedError) return error.endpoint;
  return null;
}

export function EndpointMissing({ name }: { name: string }) {
  return <EmptyState title={`Backend endpoint not available yet: ${name}`} />;
}
