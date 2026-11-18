export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  coverArt?: string;
  duration: number;
  track?: number;
  suffix?: string;
  bitRate?: number;
  sampleRate?: number;
  year?: number;
  genre?: string;
}

export interface Album {
  id: string;
  name: string;
  artist: string;
  coverArt?: string;
  songCount: number;
  duration: number;
  year?: number;
  genre?: string;
  songs?: Song[];
}

export interface Playlist {
  id: string;
  name: string;
  songCount: number;
  duration: number;
  coverArt?: string;
  songs?: Song[];
}

export interface ServerInfo {
  name: string;
  version: string;
  apiVersion: string;
}

export interface Session {
  authenticated: boolean;
  username: string;
  serverUrl: string;
  managed: boolean;
  server: ServerInfo;
  demo?: boolean;
}

export interface AppConfig {
  managed: boolean;
  setupRequired: boolean;
}

export interface TagChanges {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumArtist?: string | null;
  year?: number | null;
  genre?: string | null;
  track?: number | null;
  trackTotal?: number | null;
  disc?: number | null;
  comment?: string | null;
}

export interface AdminTrack {
  id: string;
  path: string;
  folder: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year?: number;
  genre: string;
  track?: number;
  trackTotal?: number;
  disc?: number;
  duration: number;
  suffix: string;
  hasCover: boolean;
  hasLyrics: boolean;
  size: number;
  modifiedAt: string;
}

export interface OnlineCover {
  id: string;
  album: string;
  artist: string;
  date: string;
  source: string;
}

export interface LyricsResult {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface OrganizationOptions {
  folders: boolean;
  metadata: boolean;
  renumber: boolean;
}

export interface OrganizationPlan {
  changes: Array<{ track: AdminTrack; tags: TagChanges; destination: string }>;
  collisions: string[];
}

export interface Backup {
  id: string;
  createdAt: string;
  kind: string;
  files: number;
}

export type LibraryView = "home" | "albums" | "songs" | "playlists" | "editor";
