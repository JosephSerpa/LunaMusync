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

export type LibraryView = "home" | "albums" | "songs" | "playlists";
