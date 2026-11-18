import { ApiError } from "./errors.js";

const USER_AGENT = "LunaMusync/0.2 (https://github.com/JosephSerpa/LunaMusync)";
let lastMusicBrainzRequest = 0;

export interface CoverSearchInput {
  artist: string;
  album: string;
}

export interface LyricsSearchInput extends CoverSearchInput {
  title: string;
  duration: number;
}

export async function searchOnlineCovers(input: CoverSearchInput) {
  const artist = clean(input.artist, 200);
  const album = clean(input.album, 300);
  const query = `release:"${escapeQuery(album)}"${artist ? ` AND artist:"${escapeQuery(artist)}"` : ""}`;
  const elapsed = Date.now() - lastMusicBrainzRequest;
  if (elapsed < 1100) await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  lastMusicBrainzRequest = Date.now();
  const url = new URL("https://musicbrainz.org/ws/2/release/");
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "8");
  const payload = await externalJson(url);
  return (payload.releases || []).filter((release: any) => release["cover-art-archive"]?.front).slice(0, 6).map((release: any) => ({
    id: String(release.id),
    album: String(release.title || album),
    artist: String(release["artist-credit"]?.[0]?.name || artist),
    date: String(release.date || ""),
    source: "MusicBrainz / Cover Art Archive",
  }));
}

export async function downloadOnlineCover(id: string): Promise<{ data: Buffer; format: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new ApiError("Identificador de carátula inválido.", 400);
  const response = await externalFetch(`https://coverartarchive.org/release/${id}/front-500`);
  if (response.status === 404) throw new ApiError("Esa edición ya no tiene una carátula disponible.", 404);
  if (!response.ok) throw new ApiError("No se pudo descargar la carátula.", 502);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 12 * 1024 * 1024) throw new ApiError("La carátula supera el límite de 12 MB.", 413);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 12 * 1024 * 1024) throw new ApiError("La carátula supera el límite de 12 MB.", 413);
  const type = response.headers.get("content-type")?.split(";")[0]?.toLowerCase();
  if (type !== "image/jpeg" && type !== "image/png") throw new ApiError("El servicio no devolvió una imagen JPEG o PNG.", 502);
  return { data, format: type };
}

export async function searchLyrics(input: LyricsSearchInput) {
  const title = clean(input.title, 300);
  const artist = clean(input.artist, 200);
  const album = input.album ? clean(input.album, 300) : "";
  const exact = new URL("https://lrclib.net/api/get");
  exact.searchParams.set("track_name", title);
  exact.searchParams.set("artist_name", artist);
  if (album) exact.searchParams.set("album_name", album);
  if (input.duration > 0) exact.searchParams.set("duration", String(Math.round(input.duration)));
  const exactResponse = await externalFetch(exact);
  if (exactResponse.ok) return [mapLyrics(await exactResponse.json())];
  if (exactResponse.status !== 404) await lyricsError(exactResponse);
  await exactResponse.body?.cancel();
  const search = new URL("https://lrclib.net/api/search");
  search.searchParams.set("track_name", title);
  search.searchParams.set("artist_name", artist);
  if (album) search.searchParams.set("album_name", album);
  const response = await externalFetch(search);
  if (!response.ok) await lyricsError(response);
  const results = await response.json();
  if (!Array.isArray(results)) throw new ApiError("El servicio de letras devolvió una respuesta no válida.", 502);
  return results.slice(0, 8).map(mapLyrics);
}

async function externalJson(url: URL): Promise<any> {
  const response = await externalFetch(url);
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError(response.status === 429 ? "El servicio externo está limitando las solicitudes. Espera antes de reintentar." : "El servicio externo no está disponible.", response.status === 429 ? 429 : 502);
  }
  return response.json();
}

function externalFetch(url: URL | string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw new ApiError("No se pudo conectar con el servicio externo.", 503); });
}

async function lyricsError(response: Response): Promise<never> {
  await response.body?.cancel();
  throw new ApiError(response.status === 429 ? "LRCLIB está limitando las solicitudes. Espera antes de reintentar." : "No se pudo consultar LRCLIB.", response.status === 429 ? 429 : 502);
}

function mapLyrics(value: any) {
  return {
    id: Number(value.id),
    title: String(value.trackName || value.name || ""),
    artist: String(value.artistName || ""),
    album: String(value.albumName || ""),
    duration: Number(value.duration || 0),
    instrumental: Boolean(value.instrumental),
    plainLyrics: typeof value.plainLyrics === "string" ? value.plainLyrics : null,
    syncedLyrics: typeof value.syncedLyrics === "string" ? value.syncedLyrics : null,
  };
}

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError("Faltan datos para realizar la búsqueda.", 400);
  return value.trim().slice(0, maxLength);
}

function escapeQuery(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
