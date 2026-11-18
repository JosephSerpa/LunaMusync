import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile as copyFileUnlocked, mkdir, readdir, readFile, rename as renameUnlocked, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFile, updateFile as updateFileUnlocked, type TagPatch } from "music-metadata";
import { ApiError } from "./errors.js";

const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".m4a", ".mp4", ".m4b", ".ogg", ".opus", ".wav", ".aac", ".aiff", ".ape", ".wv", ".mpc"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

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

export interface OrganizationOptions {
  folders: boolean;
  metadata: boolean;
  renumber: boolean;
}

interface BackupItem {
  path: string;
  destination?: string;
  existed: boolean;
}

interface BackupManifest {
  id: string;
  createdAt: string;
  kind: string;
  items: BackupItem[];
}

interface CachedTrack {
  track: AdminTrack;
  mtimeMs: number;
  size: number;
}

export function encodeFileId(relativePath: string): string {
  return Buffer.from(relativePath.replaceAll("\\", "/"), "utf8").toString("base64url");
}

export class LibraryEditor {
  readonly musicRoot: string;
  private readonly backupRoot: string;
  private readonly cache = new Map<string, CachedTrack>();
  private scanning?: Promise<AdminTrack[]>;

  constructor(musicRoot = process.env.LUNA_MUSIC_ROOT || "/music", dataRoot = process.env.LUNA_DATA || "/data") {
    this.musicRoot = path.resolve(musicRoot);
    this.backupRoot = path.join(dataRoot, "backups");
  }

  async list(force = false): Promise<AdminTrack[]> {
    if (force) this.cache.clear();
    if (this.scanning) return this.scanning;
    this.scanning = this.scanFiles().finally(() => { this.scanning = undefined; });
    return this.scanning;
  }

  async tracks(ids: string[]): Promise<AdminTrack[]> {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) throw new ApiError("Selecciona entre 1 y 500 canciones.", 400);
    if (new Set(ids).size !== ids.length) throw new ApiError("La selección contiene canciones duplicadas.", 400);
    return Promise.all(ids.map((id) => this.readTrack(this.decode(id))));
  }

  async update(ids: string[], changes: TagChanges, picture?: { data: Buffer; format: string }): Promise<{ operationId: string; changed: number }> {
    const patch = tagPatch(changes);
    if (picture) patch.picture = [{ data: picture.data, format: picture.format, description: "Carátula frontal", type: "Cover (front)" }];
    if (Object.keys(patch).length === 0) throw new ApiError("No hay cambios que guardar.", 400);
    const tracks = await this.tracks(ids);
    const operation = await this.beginBackup("metadata", tracks.map((track) => ({ path: track.path, existed: true })));
    try {
      for (const track of tracks) {
        const absolute = await this.resolveExisting(track.path);
        await writeMetadataAtomically(absolute, patch, path.join(this.backupRoot, operation.id));
        this.cache.delete(track.path);
      }
      await this.finishBackup(operation);
      return { operationId: operation.id, changed: tracks.length };
    } catch (error) {
      await this.rollback(operation).catch((rollbackError) => console.error(`No se pudo restaurar automáticamente el respaldo ${operation.id}.`, rollbackError));
      throw error;
    }
  }

  async saveLyrics(ids: string[], lyrics: string): Promise<{ operationId: string; changed: number }> {
    const clean = lyrics.trim();
    if (!clean || clean.length > 200_000) throw new ApiError("La letra está vacía o supera el límite permitido.", 400);
    const tracks = await this.tracks(ids);
    const items: BackupItem[] = [];
    for (const track of tracks) {
      items.push({ path: track.path, existed: true });
      const lyricsPath = sidecarPath(track.path);
      items.push({ path: lyricsPath, existed: await this.fileExists(lyricsPath) });
    }
    const operation = await this.beginBackup("lyrics", items);
    try {
      for (const track of tracks) {
        const absolute = await this.resolveExisting(track.path);
        await writeMetadataAtomically(absolute, { lyrics: clean }, path.join(this.backupRoot, operation.id));
        const target = path.join(path.dirname(absolute), `${path.basename(absolute, path.extname(absolute))}.lrc`);
        const temp = `${target}.luna-${randomBytes(5).toString("hex")}.tmp`;
        await writeFile(temp, `${clean}\n`, "utf8");
        await rename(temp, target);
        this.cache.delete(track.path);
      }
      await this.finishBackup(operation);
      return { operationId: operation.id, changed: tracks.length };
    } catch (error) {
      await this.rollback(operation).catch((rollbackError) => console.error(`No se pudo restaurar automáticamente el respaldo ${operation.id}.`, rollbackError));
      throw error;
    }
  }

  async localCovers(trackId: string, scope: "folder" | "library"): Promise<Array<{ id: string; path: string }>> {
    const track = (await this.tracks([trackId]))[0]!;
    const base = scope === "folder" ? track.folder : "";
    const files = await this.walk(base, "images");
    return files.slice(0, 60).map((relative) => ({ id: encodeFileId(relative), path: relative }));
  }

  async localCover(id: string): Promise<{ data: Buffer; format: string; relativePath: string }> {
    const relativePath = this.decode(id);
    if (!IMAGE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) throw new ApiError("El archivo no es una imagen compatible.", 400);
    const absolute = await this.resolveExisting(relativePath);
    const data = await readFile(absolute);
    return { data, format: validateCover(data), relativePath };
  }

  async cover(id: string): Promise<{ data: Buffer; format: string } | null> {
    const relativePath = this.decode(id);
    const absolute = await this.resolveExisting(relativePath);
    const metadata = await parseFile(absolute);
    const picture = metadata.common.picture?.[0];
    if (picture) return { data: Buffer.from(picture.data), format: picture.format };
    const directory = path.dirname(absolute);
    const entries = await readdir(directory, { withFileTypes: true });
    const preferred = entries.filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => coverScore(a.name) - coverScore(b.name))[0];
    if (!preferred) return null;
    const data = await readFile(path.join(directory, preferred.name));
    return { data, format: validateCover(data) };
  }

  async organizationPlan(ids: string[], options: OrganizationOptions): Promise<{ changes: Array<{ track: AdminTrack; tags: TagChanges; destination: string }>; collisions: string[] }> {
    const tracks = (await this.tracks(ids)).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    const majorityArtist = majority(tracks.map((track) => track.albumArtist || track.artist).filter(validTag)) || "Artista desconocido";
    const majorityAlbum = majority(tracks.map((track) => track.album).filter(validTag)) || "Álbum desconocido";
    const changes = tracks.map((track, index) => {
      const parts = track.path.split("/");
      const fileName = path.basename(track.path, path.extname(track.path));
      const inferred = fileName.match(/^\s*(\d{1,3})[\s._-]+(.+)$/);
      const title = validTag(track.title) && track.title !== fileName ? track.title : inferred?.[2]?.trim() || fileName;
      const album = validTag(track.album) ? track.album : parts.length > 3 ? parts.at(-2)! : majorityAlbum;
      const artist = validTag(track.artist) ? track.artist : parts.length > 3 ? parts.at(-3)! : parts.length > 2 ? parts.at(-2)! : majorityArtist;
      const tags: TagChanges = options.metadata ? {
        title,
        artist,
        album,
        albumArtist: validTag(track.albumArtist) ? track.albumArtist : artist,
        ...(options.renumber ? { track: track.track ?? (inferred?.[1] ? Number(inferred[1]) : index + 1) } : {}),
      } : {};
      const library = parts[0] || "Biblioteca";
      const destination = options.folders
        ? [library, safePart(albumArtistFor(track, artist)), safePart(album), `${String(options.renumber ? tags.track ?? track.track ?? (inferred?.[1] ? Number(inferred[1]) : index + 1) : track.track ?? index + 1).padStart(2, "0")} - ${safePart(title)}${path.extname(track.path).toLowerCase()}`].join("/")
        : track.path;
      return { track, tags, destination };
    });
    const destinations = new Set<string>();
    const collisions = new Set<string>();
    for (const change of changes) {
      const key = change.destination.toLocaleLowerCase();
      if (destinations.has(key)) collisions.add(change.destination);
      destinations.add(key);
      if (change.destination !== change.track.path && existsSync(path.join(this.musicRoot, ...change.destination.split("/")))) collisions.add(change.destination);
    }
    return { changes, collisions: [...collisions] };
  }

  async organize(ids: string[], options: OrganizationOptions): Promise<{ operationId: string; changed: number }> {
    const plan = await this.organizationPlan(ids, options);
    if (plan.collisions.length) throw new ApiError(`La organización produciría colisiones: ${plan.collisions.join(", ")}`, 409);
    const items: BackupItem[] = [];
    for (const change of plan.changes) {
      const destination = change.destination === change.track.path ? undefined : change.destination;
      items.push({ path: change.track.path, destination, existed: true });
      const sourceSidecar = sidecarPath(change.track.path);
      if (await this.fileExists(sourceSidecar)) {
        items.push({ path: sourceSidecar, destination: destination ? sidecarPath(destination) : undefined, existed: true });
      }
    }
    const operation = await this.beginBackup("organization", items);
    try {
      for (const change of plan.changes) {
        const absolute = await this.resolveExisting(change.track.path);
        if (Object.keys(change.tags).length) await writeMetadataAtomically(absolute, tagPatch(change.tags), path.join(this.backupRoot, operation.id));
        if (change.destination !== change.track.path) {
          const target = this.resolvePath(change.destination);
          await mkdir(path.dirname(target), { recursive: true });
          await rename(absolute, target);
          const sourceSidecar = path.join(path.dirname(absolute), `${path.basename(absolute, path.extname(absolute))}.lrc`);
          if (existsSync(sourceSidecar)) await rename(sourceSidecar, path.join(path.dirname(target), `${path.basename(target, path.extname(target))}.lrc`));
        }
        this.cache.delete(change.track.path);
        this.cache.delete(change.destination);
      }
      await this.finishBackup(operation);
      return { operationId: operation.id, changed: plan.changes.length };
    } catch (error) {
      await this.rollback(operation).catch((rollbackError) => console.error(`No se pudo restaurar automáticamente el respaldo ${operation.id}.`, rollbackError));
      throw error;
    }
  }

  async backups(): Promise<Array<{ id: string; createdAt: string; kind: string; files: number }>> {
    if (!existsSync(this.backupRoot)) return [];
    const entries = await readdir(this.backupRoot, { withFileTypes: true });
    const result = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      try {
        const manifest = JSON.parse(await readFile(path.join(this.backupRoot, entry.name, "manifest.json"), "utf8")) as BackupManifest;
        result.push({ id: manifest.id, createdAt: manifest.createdAt, kind: manifest.kind, files: manifest.items.length });
      } catch { }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async restore(id: string): Promise<{ restored: number }> {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new ApiError("Respaldo inválido.", 400);
    const directory = path.join(this.backupRoot, id);
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8").catch(() => { throw new ApiError("El respaldo no existe.", 404); })) as BackupManifest;
    await this.rollback(manifest);
    for (const item of manifest.items) {
      this.cache.delete(item.path);
      if (item.destination) this.cache.delete(item.destination);
    }
    return { restored: manifest.items.length };
  }

  private async scanFiles(): Promise<AdminTrack[]> {
    if (!existsSync(this.musicRoot)) throw new ApiError("No hay bibliotecas conectadas al editor.", 503);
    const files = await this.walk("", "audio");
    const active = new Set(files);
    for (const cached of this.cache.keys()) if (!active.has(cached)) this.cache.delete(cached);
    const tracks: AdminTrack[] = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(6, files.length) }, async () => {
      while (cursor < files.length) {
        const relative = files[cursor++]!;
        const absolute = this.resolvePath(relative);
        const info = await stat(absolute);
        const cached = this.cache.get(relative);
        if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) tracks.push(cached.track);
        else {
          const track = await this.readTrack(relative);
          this.cache.set(relative, { track, mtimeMs: info.mtimeMs, size: info.size });
          tracks.push(track);
        }
      }
    });
    await Promise.all(workers);
    return tracks.sort((a, b) => `${a.albumArtist}\0${a.album}\0${String(a.track || 9999).padStart(4, "0")}\0${a.title}`.localeCompare(`${b.albumArtist}\0${b.album}\0${String(b.track || 9999).padStart(4, "0")}\0${b.title}`));
  }

  private async readTrack(relative: string): Promise<AdminTrack> {
    const absolute = await this.resolveExisting(relative);
    const info = await stat(absolute);
    const metadata = await parseFile(absolute, { duration: true });
    const common = metadata.common;
    const lyricsFile = path.join(path.dirname(absolute), `${path.basename(absolute, path.extname(absolute))}.lrc`);
    return {
      id: encodeFileId(relative),
      path: relative,
      folder: path.posix.dirname(relative) === "." ? "" : path.posix.dirname(relative),
      title: common.title || path.basename(relative, path.extname(relative)),
      artist: common.artist || common.artists?.join("; ") || "Artista desconocido",
      album: common.album || "Álbum desconocido",
      albumArtist: common.albumartist || common.artist || "Artista desconocido",
      year: common.year,
      genre: common.genre?.join("; ") || "",
      track: common.track.no ?? undefined,
      trackTotal: common.track.of ?? undefined,
      disc: common.disk.no ?? undefined,
      duration: Math.round(metadata.format.duration || 0),
      suffix: path.extname(relative).slice(1).toUpperCase(),
      hasCover: Boolean(common.picture?.length),
      hasLyrics: Boolean(common.lyrics?.length) || existsSync(lyricsFile),
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
    };
  }

  private async walk(base: string, kind: "audio" | "images"): Promise<string[]> {
    const result: string[] = [];
    const visit = async (relativeDirectory: string) => {
      const absolute = this.resolvePath(relativeDirectory);
      const entries = await readdir(absolute, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
        const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await visit(relative);
        else if (entry.isFile()) {
          const extensions = kind === "audio" ? AUDIO_EXTENSIONS : IMAGE_EXTENSIONS;
          if (extensions.has(path.extname(entry.name).toLowerCase())) result.push(relative);
        }
      }
    };
    await visit(base);
    return result;
  }

  private decode(id: string): string {
    let relative: string;
    try { relative = Buffer.from(id, "base64url").toString("utf8"); } catch { throw new ApiError("Identificador inválido.", 400); }
    if (!relative || relative.startsWith("/") || relative.includes("\0") || encodeFileId(relative) !== id) throw new ApiError("Identificador inválido.", 400);
    this.resolvePath(relative);
    return relative;
  }

  private resolvePath(relative: string): string {
    if (path.posix.isAbsolute(relative) || relative.split("/").includes("..")) throw new ApiError("La ruta sale de la biblioteca.", 400);
    const absolute = path.resolve(this.musicRoot, ...relative.split("/"));
    if (absolute !== this.musicRoot && !absolute.startsWith(`${this.musicRoot}${path.sep}`)) throw new ApiError("La ruta sale de la biblioteca.", 400);
    return absolute;
  }

  private async resolveExisting(relative: string): Promise<string> {
    const absolute = this.resolvePath(relative);
    const realRoot = await realpathSafe(this.musicRoot);
    const realFile = await realpathSafe(absolute);
    if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`)) throw new ApiError("El archivo sale de la biblioteca.", 400);
    return realFile;
  }

  private fileExists(relative: string): Promise<boolean> {
    return stat(this.resolvePath(relative)).then(() => true).catch(() => false);
  }

  private async beginBackup(kind: string, items: BackupItem[]): Promise<BackupManifest> {
    const id = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
    const operation: BackupManifest = { id, createdAt: new Date().toISOString(), kind, items };
    const directory = path.join(this.backupRoot, id);
    await mkdir(directory, { recursive: true });
    for (const item of items) {
      if (!item.existed) continue;
      const source = await this.resolveExisting(item.path);
      const target = path.join(directory, "files", ...item.path.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    }
    return operation;
  }

  private async finishBackup(operation: BackupManifest): Promise<void> {
    await writeFile(path.join(this.backupRoot, operation.id, "manifest.json"), JSON.stringify(operation, null, 2), "utf8");
  }

  private async rollback(operation: BackupManifest): Promise<void> {
    for (const item of [...operation.items].reverse()) {
      if (item.destination && item.destination !== item.path) {
        const destination = this.resolvePath(item.destination);
        if (existsSync(destination)) await unlink(destination);
      }
      const source = this.resolvePath(item.path);
      if (item.existed) {
        await mkdir(path.dirname(source), { recursive: true });
        await replaceFileAtomically(path.join(this.backupRoot, operation.id, "files", ...item.path.split("/")), source);
      } else if (existsSync(source)) await unlink(source);
    }
  }
}

function tagPatch(changes: TagChanges): TagPatch {
  const patch: TagPatch = {};
  const strings: Array<[keyof TagChanges, keyof TagPatch]> = [["title", "title"], ["artist", "artist"], ["album", "album"], ["albumArtist", "albumartist"], ["genre", "genre"], ["comment", "comment"]];
  for (const [input, output] of strings) {
    const value = changes[input];
    if (typeof value === "string" || value === null) (patch as Record<string, unknown>)[output] = typeof value === "string" ? value.trim() || null : null;
  }
  if (changes.artist !== undefined && changes.artist !== null) patch.artists = changes.artist.split(/[;/]/).map((artist) => artist.trim()).filter(Boolean);
  if (changes.year !== undefined) patch.year = validNumber(changes.year, 0, 9999, "El año");
  const track: { no?: number | null; of?: number | null } = {};
  if (changes.track !== undefined) track.no = validNumber(changes.track, 1, 9999, "La pista");
  if (changes.trackTotal !== undefined) track.of = validNumber(changes.trackTotal, 1, 9999, "El total de pistas");
  if (Object.keys(track).length) patch.track = track;
  if (changes.disc !== undefined) patch.disk = { no: validNumber(changes.disc, 1, 999, "El disco") };
  return patch;
}

function validNumber(value: number | null, min: number, max: number, label: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < min || value > max) throw new ApiError(`${label} debe ser un entero entre ${min} y ${max}.`, 400);
  return value;
}

function sidecarPath(relative: string): string {
  return `${relative.slice(0, -path.extname(relative).length)}.lrc`;
}

function validTag(value: string): boolean {
  return Boolean(value && !/^(Artista|Álbum) desconocido$/i.test(value));
}

function majority(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function albumArtistFor(track: AdminTrack, fallback: string): string {
  return validTag(track.albumArtist) ? track.albumArtist : validTag(track.artist) ? track.artist : fallback;
}

function safePart(value: string): string {
  const clean = value.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim().slice(0, 120);
  if (!clean || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(clean)) return "Sin nombre";
  return clean;
}

export function validateCover(data: Buffer): string {
  if (data.length > 8 && data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  throw new ApiError("La carátula debe ser una imagen JPEG o PNG válida.", 400);
}

function coverScore(name: string): number {
  const value = name.toLowerCase();
  return /^(cover|folder|front)\./.test(value) ? 0 : /(cover|front|folder)/.test(value) ? 1 : 2;
}

async function writeMetadataAtomically(absolute: string, patch: TagPatch, workDirectory: string) {
  const staged = path.join(workDirectory, `edit-${randomBytes(6).toString("hex")}.tmp`);
  await copyFile(absolute, staged);
  try {
    await updateFile(staged, patch, { atomic: true, backup: false });
    await replaceFileAtomically(staged, absolute);
  } finally {
    if (existsSync(staged)) await unlink(staged);
  }
}

async function replaceFileAtomically(source: string, destination: string) {
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.luna-${randomBytes(5).toString("hex")}.tmp`);
  try {
    await copyFile(source, temporary);
    await rename(temporary, destination);
  } finally {
    if (existsSync(temporary)) await unlink(temporary);
  }
}

async function updateFile(filePath: string, patch: TagPatch, options: { atomic: boolean; backup: boolean }) {
  return retryOnFileLock(() => updateFileUnlocked(filePath, patch, options));
}

async function copyFile(source: string, destination: string) {
  return retryOnFileLock(() => copyFileUnlocked(source, destination));
}

async function rename(source: string, destination: string) {
  return retryOnFileLock(() => renameUnlocked(source, destination));
}

async function retryOnFileLock<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try { return await operation(); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!["EPERM", "EBUSY"].includes(code || "") || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw new Error("File retry exhausted");
}

async function realpathSafe(value: string): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return realpath(value).catch(() => { throw new ApiError("El archivo ya no existe en la biblioteca.", 404); });
}
