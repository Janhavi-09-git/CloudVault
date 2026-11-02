import type { Session } from "@supabase/supabase-js";

export async function apiRequest<T>(path: string, session: Session, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "The server returned an unreadable error." })) as { error?: string };
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export async function downloadFile(path: string, session: Session, filename: string) {
  const response = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "The server returned an unreadable error." })) as { error?: string };
    throw new Error(payload.error ?? `Download failed (${response.status}).`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface CloudStatus {
  services: { supabase: boolean; storage: boolean; encryption: boolean; cdn: boolean };
}

export interface CloudFile {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  chunk_size_bytes: number;
  chunk_count: number;
  sha256: string;
  encrypted: boolean;
  created_at: string;
}

export interface CloudChunk {
  chunk_index: number;
  size_bytes: number;
  sha256: string;
  encrypted_size_bytes: number;
  encrypted_sha256: string;
}

export interface Deployment {
  id: string;
  kind: "portfolio" | "documentation";
  name: string;
  status: string;
  published_url: string | null;
  cdn_invalidation_id: string | null;
  created_at: string;
}
