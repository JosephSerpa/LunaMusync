import type { Album, AppConfig, Playlist, Session, Song } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: options?.body
      ? { "Content-Type": "application/json", ...options.headers }
      : options?.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la solicitud.");
  return payload as T;
}

export const api = {
  config: () => request<AppConfig>("/api/config"),
  session: () => request<Session | { authenticated: false }>("/api/session"),
  connect: (serverUrl: string, username: string, password: string) => request<Session>("/api/session", {
    method: "POST",
    body: JSON.stringify({ serverUrl, username, password }),
  }),
  disconnect: () => request<{ authenticated: false }>("/api/session", { method: "DELETE" }),
  albums: () => request<{ albums: Album[] }>("/api/library/albums?size=60"),
  album: (id: string) => request<{ album: Album }>(`/api/library/albums/${encodeURIComponent(id)}`),
  songs: async () => {
    const songs: Song[] = [];
    let offset = 0;
    while (true) {
      const result = await request<{ songs: Song[] }>(`/api/library/songs?size=500&offset=${offset}`);
      songs.push(...result.songs);
      if (result.songs.length < 500) return { songs };
      offset += result.songs.length;
    }
  },
  playlists: () => request<{ playlists: Playlist[] }>("/api/library/playlists"),
  playlist: (id: string) => request<{ playlist: Playlist }>(`/api/library/playlists/${encodeURIComponent(id)}`),
  search: (query: string) => request<{ albums: Album[]; songs: Song[] }>(`/api/library/search?q=${encodeURIComponent(query)}`),
  demo: async () => {
    const payload = await request<{ albums: Album[]; songs: Song[]; playlists: Playlist[] }>("/api/demo/library");
    return payload;
  },
};

export function streamUrl(song: Song): string {
  const base = song.id.startsWith("demo-") ? "/api/demo/stream" : "/api/stream";
  return `${base}/${encodeURIComponent(song.id)}`;
}

export function coverUrl(item: Album | Playlist | Song, size = 600): string {
  const id = item.coverArt || ("albumId" in item ? item.albumId : undefined) || item.id;
  const base = id.startsWith("demo-") ? "/api/demo/cover" : "/api/cover";
  return `${base}/${encodeURIComponent(id)}?size=${size}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}
