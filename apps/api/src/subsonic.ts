import { createHash, randomBytes } from "node:crypto";

const API_VERSION = "1.16.1";
const CLIENT_NAME = "LunaWeb";

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

interface ServerConfig {
  serverUrl: string;
  username: string;
  token: string;
  salt: string;
}

interface SubsonicClientOptions {
  timeoutMs?: number;
}

export class SubsonicError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "SubsonicError";
  }
}

export function normalizeServerUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SubsonicError("La dirección del servidor debe usar HTTP o HTTPS.", 400);
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export class SubsonicClient {
  private constructor(
    private readonly config: ServerConfig,
    private readonly timeoutMs: number,
  ) {}

  static async connect(
    serverUrl: string,
    username: string,
    password: string,
    options: SubsonicClientOptions = {},
  ): Promise<{ client: SubsonicClient; info: ServerInfo }> {
    const normalizedUrl = normalizeServerUrl(serverUrl);
    const salt = randomBytes(12).toString("hex");
    const token = createHash("md5").update(`${password}${salt}`).digest("hex");
    const client = new SubsonicClient(
      { serverUrl: normalizedUrl, username, token, salt },
      options.timeoutMs ?? 15_000,
    );
    return { client, info: await client.ping() };
  }

  private url(method: string, params: Record<string, string> = {}): URL {
    const url = new URL(`${this.config.serverUrl}/rest/${method}`);
    const query: Record<string, string> = {
      u: this.config.username,
      t: this.config.token,
      s: this.config.salt,
      v: API_VERSION,
      c: CLIENT_NAME,
      f: "json",
      ...params,
    };
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    return url;
  }

  private async request(method: string, params: Record<string, string> = {}): Promise<any> {
    let response: Response;
    try {
      response = await fetch(this.url(method, params), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new SubsonicError("No se pudo conectar con el servidor de música.");
    }
    if (!response.ok) {
      throw new SubsonicError(`El servidor respondió con HTTP ${response.status}.`);
    }
    const payload = await response.json();
    const root = payload?.["subsonic-response"];
    if (!root || root.status !== "ok") {
      const code = root?.error?.code;
      const message = code === 40
        ? "Usuario o contraseña incorrectos."
        : root?.error?.message ?? "La respuesta no es compatible con OpenSubsonic.";
      throw new SubsonicError(message, code === 40 ? 401 : 502);
    }
    return root;
  }

  async ping(): Promise<ServerInfo> {
    const root = await this.request("ping");
    return {
      name: String(root.type || "OpenSubsonic"),
      version: String(root.serverVersion || ""),
      apiVersion: String(root.version || API_VERSION),
    };
  }

  async albums(size = 40, offset = 0): Promise<Album[]> {
    const root = await this.request("getAlbumList2", {
      type: "newest",
      size: String(size),
      offset: String(offset),
    });
    return (root.albumList2?.album ?? []).map(mapAlbum);
  }

  async album(id: string): Promise<Album> {
    const root = await this.request("getAlbum", { id });
    if (!root.album) throw new SubsonicError("El álbum no existe.", 404);
    const album = mapAlbum(root.album);
    album.songs = (root.album.song ?? []).map(mapSong);
    return album;
  }

  async songs(size = 100, offset = 0): Promise<Song[]> {
    const root = await this.request("search3", {
      query: "",
      artistCount: "0",
      albumCount: "0",
      songCount: String(size),
      songOffset: String(offset),
    });
    return (root.searchResult3?.song ?? []).map(mapSong);
  }

  async search(query: string): Promise<{ albums: Album[]; songs: Song[] }> {
    const root = await this.request("search3", {
      query,
      artistCount: "0",
      albumCount: "20",
      songCount: "60",
    });
    return {
      albums: (root.searchResult3?.album ?? []).map(mapAlbum),
      songs: (root.searchResult3?.song ?? []).map(mapSong),
    };
  }

  async playlists(): Promise<Playlist[]> {
    const root = await this.request("getPlaylists");
    return (root.playlists?.playlist ?? []).map(mapPlaylist);
  }

  async playlist(id: string): Promise<Playlist> {
    const root = await this.request("getPlaylist", { id });
    if (!root.playlist) throw new SubsonicError("La lista no existe.", 404);
    const playlist = mapPlaylist(root.playlist);
    playlist.songs = (root.playlist.entry ?? []).map(mapSong);
    return playlist;
  }

  async stream(id: string, range?: string): Promise<Response> {
    return this.media(this.url("stream", { id }), range);
  }

  async cover(id: string, size = 600): Promise<Response> {
    return this.media(this.url("getCoverArt", { id, size: String(size) }));
  }

  private async media(url: URL, range?: string): Promise<Response> {
    try {
      return await fetch(url, {
        headers: range ? { Range: range } : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new SubsonicError("Se perdió la conexión con el contenido del servidor.");
    }
  }
}

function mapSong(value: any): Song {
  return {
    id: String(value.id),
    title: String(value.title || "Sin título"),
    artist: String(value.artist || "Artista desconocido"),
    album: String(value.album || "Álbum desconocido"),
    albumId: value.albumId ? String(value.albumId) : undefined,
    coverArt: value.coverArt ? String(value.coverArt) : value.albumId ? String(value.albumId) : undefined,
    duration: Number(value.duration || 0),
    track: value.track ? Number(value.track) : undefined,
    suffix: value.suffix ? String(value.suffix) : undefined,
    bitRate: value.bitRate ? Number(value.bitRate) : undefined,
    sampleRate: value.samplingRate ? Number(value.samplingRate) : undefined,
    year: value.year ? Number(value.year) : undefined,
    genre: value.genre ? String(value.genre) : undefined,
  };
}

function mapAlbum(value: any): Album {
  return {
    id: String(value.id),
    name: String(value.name || value.album || "Álbum desconocido"),
    artist: String(value.artist || "Artista desconocido"),
    coverArt: value.coverArt ? String(value.coverArt) : undefined,
    songCount: Number(value.songCount || value.song?.length || 0),
    duration: Number(value.duration || 0),
    year: value.year ? Number(value.year) : undefined,
    genre: value.genre ? String(value.genre) : undefined,
  };
}

function mapPlaylist(value: any): Playlist {
  return {
    id: String(value.id),
    name: String(value.name || "Lista sin nombre"),
    songCount: Number(value.songCount || 0),
    duration: Number(value.duration || 0),
    coverArt: value.coverArt ? String(value.coverArt) : undefined,
  };
}
