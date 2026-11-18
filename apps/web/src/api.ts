import type { Album, AppConfig, Backup, LyricsResult, OnlineCover, OrganizationOptions, OrganizationPlan, Playlist, Session, Song, TagChanges, AdminTrack } from "./types";

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
  setup: (username: string, password: string) => request<Session>("/api/setup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }),
  disconnect: () => request<{ authenticated: false }>("/api/session", { method: "DELETE" }),
  albums: async () => {
    const albums: Album[] = [];
    let offset = 0;
    while (true) {
      const result = await request<{ albums: Album[] }>(`/api/library/albums?size=100&offset=${offset}`);
      albums.push(...result.albums);
      if (result.albums.length < 100) return { albums };
      offset += result.albums.length;
    }
  },
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
  admin: {
    tracks: (refresh = false) => request<{ tracks: AdminTrack[] }>(`/api/admin/tracks${refresh ? "?refresh=1" : ""}`),
    update: (ids: string[], changes: TagChanges) => request<{ operationId: string; changed: number }>("/api/admin/tracks/update", { method: "POST", body: JSON.stringify({ ids, changes }) }),
    localCovers: (trackId: string, scope: "folder" | "library") => request<{ covers: Array<{ id: string; path: string }> }>("/api/admin/covers/local", { method: "POST", body: JSON.stringify({ trackId, scope }) }),
    searchCovers: (artist: string, album: string) => request<{ covers: OnlineCover[] }>("/api/admin/covers/search", { method: "POST", body: JSON.stringify({ artist, album }) }),
    applyCover: (ids: string[], source: "local" | "online", coverId: string) => request<{ operationId: string; changed: number }>("/api/admin/covers/apply", { method: "POST", body: JSON.stringify({ ids, source, coverId }) }),
    uploadCover: (ids: string[], data: string) => request<{ operationId: string; changed: number }>("/api/admin/covers/apply", { method: "POST", body: JSON.stringify({ ids, source: "upload", data }) }),
    searchLyrics: (track: AdminTrack) => request<{ lyrics: LyricsResult[] }>("/api/admin/lyrics/search", { method: "POST", body: JSON.stringify({ title: track.title, artist: track.artist, album: track.album, duration: track.duration }) }),
    applyLyrics: (ids: string[], lyrics: string) => request<{ operationId: string; changed: number }>("/api/admin/lyrics/apply", { method: "POST", body: JSON.stringify({ ids, lyrics }) }),
    organizePreview: (ids: string[], options: OrganizationOptions) => request<OrganizationPlan>("/api/admin/organize/preview", { method: "POST", body: JSON.stringify({ ids, options }) }),
    organizeApply: (ids: string[], options: OrganizationOptions) => request<{ operationId: string; changed: number }>("/api/admin/organize/apply", { method: "POST", body: JSON.stringify({ ids, options }) }),
    backups: () => request<{ backups: Backup[] }>("/api/admin/backups"),
    restore: (id: string) => request<{ restored: number }>(`/api/admin/backups/${encodeURIComponent(id)}/restore`, { method: "POST" }),
    sync: () => request<{ scanning: boolean; count?: number }>("/api/admin/sync"),
    startSync: () => request<{ scanning: boolean }>("/api/admin/sync", { method: "POST" }),
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
