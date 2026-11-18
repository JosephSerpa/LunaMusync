import type { IncomingMessage, ServerResponse } from "node:http";
import { LibraryEditor, validateCover, type OrganizationOptions, type TagChanges } from "./editor.js";
import { downloadOnlineCover, searchLyrics, searchOnlineCovers } from "./enrichment.js";
import { ApiError } from "./errors.js";
import type { SubsonicClient } from "./subsonic.js";

let editor: LibraryEditor | undefined;
let editorKey = "";

export async function routeAdmin(
  pathname: string,
  method: string,
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  client: SubsonicClient,
): Promise<void> {
  if (!await client.isAdmin()) throw new ApiError("Esta cuenta no tiene permisos de administración.", 403);
  const current = getEditor();
  const json = (body: unknown) => sendJson(response, body);
  const ids = (body: Record<string, unknown>) => {
    if (!Array.isArray(body.ids) || !body.ids.every((id) => typeof id === "string")) throw new ApiError("La selección de canciones no es válida.", 400);
    return body.ids as string[];
  };

  if (pathname === "/api/admin/tracks" && method === "GET") {
    json({ tracks: await current.list(url.searchParams.get("refresh") === "1") });
    return;
  }
  if (pathname === "/api/admin/tracks/update" && method === "POST") {
    const body = await readJson(request);
    if (!body.changes || typeof body.changes !== "object" || Array.isArray(body.changes)) throw new ApiError("Los metadatos no son válidos.", 400);
    const result = await current.update(ids(body), body.changes as TagChanges);
    void client.startScan().catch(() => undefined);
    json(result);
    return;
  }
  const coverMatch = pathname.match(/^\/api\/admin\/tracks\/([A-Za-z0-9_-]+)\/cover$/);
  if (coverMatch && method === "GET") {
    const cover = await current.cover(coverMatch[1]!);
    if (!cover) throw new ApiError("Esta canción no tiene carátula.", 404);
    sendBuffer(response, cover.data, cover.format);
    return;
  }
  if (pathname === "/api/admin/covers/local" && method === "POST") {
    const body = await readJson(request);
    const scope = body.scope === "library" ? "library" : "folder";
    json({ covers: await current.localCovers(requiredId(body.trackId), scope) });
    return;
  }
  const localCoverMatch = pathname.match(/^\/api\/admin\/local-cover\/([A-Za-z0-9_-]+)$/);
  if (localCoverMatch && method === "GET") {
    const cover = await current.localCover(localCoverMatch[1]!);
    sendBuffer(response, cover.data, cover.format);
    return;
  }
  if (pathname === "/api/admin/covers/search" && method === "POST") {
    const body = await readJson(request);
    json({ covers: await searchOnlineCovers({ artist: String(body.artist || ""), album: String(body.album || "") }) });
    return;
  }
  const onlineCoverMatch = pathname.match(/^\/api\/admin\/online-cover\/([0-9a-f-]+)$/i);
  if (onlineCoverMatch && method === "GET") {
    const cover = await downloadOnlineCover(onlineCoverMatch[1]!);
    sendBuffer(response, cover.data, cover.format);
    return;
  }
  if (pathname === "/api/admin/covers/apply" && method === "POST") {
    const body = await readJson(request, 17 * 1024 * 1024);
    let picture: { data: Buffer; format: string };
    if (body.source === "local") picture = await current.localCover(requiredId(body.coverId));
    else if (body.source === "online") picture = await downloadOnlineCover(requiredId(body.coverId));
    else if (body.source === "upload" && typeof body.data === "string") {
      const data = Buffer.from(body.data, "base64");
      if (data.length > 12 * 1024 * 1024) throw new ApiError("La imagen supera el límite de 12 MB.", 413);
      picture = { data, format: validateCover(data) };
    } else throw new ApiError("La carátula seleccionada no es válida.", 400);
    const result = await current.update(ids(body), {}, picture);
    void client.startScan().catch(() => undefined);
    json(result);
    return;
  }
  if (pathname === "/api/admin/lyrics/search" && method === "POST") {
    const body = await readJson(request);
    json({ lyrics: await searchLyrics({ title: String(body.title || ""), artist: String(body.artist || ""), album: String(body.album || ""), duration: Number(body.duration || 0) }) });
    return;
  }
  if (pathname === "/api/admin/lyrics/apply" && method === "POST") {
    const body = await readJson(request, 512 * 1024);
    if (typeof body.lyrics !== "string") throw new ApiError("La letra no es válida.", 400);
    const result = await current.saveLyrics(ids(body), body.lyrics);
    void client.startScan().catch(() => undefined);
    json(result);
    return;
  }
  if (pathname === "/api/admin/organize/preview" && method === "POST") {
    const body = await readJson(request);
    json(await current.organizationPlan(ids(body), organizationOptions(body.options)));
    return;
  }
  if (pathname === "/api/admin/organize/apply" && method === "POST") {
    const body = await readJson(request);
    const result = await current.organize(ids(body), organizationOptions(body.options));
    void client.startScan().catch(() => undefined);
    json(result);
    return;
  }
  if (pathname === "/api/admin/backups" && method === "GET") {
    json({ backups: await current.backups() });
    return;
  }
  const restoreMatch = pathname.match(/^\/api\/admin\/backups\/([a-zA-Z0-9-]+)\/restore$/);
  if (restoreMatch && method === "POST") {
    const result = await current.restore(restoreMatch[1]!);
    void client.startScan().catch(() => undefined);
    json(result);
    return;
  }
  if (pathname === "/api/admin/sync" && method === "GET") {
    json(await client.scanStatus());
    return;
  }
  if (pathname === "/api/admin/sync" && method === "POST") {
    await client.startScan();
    json({ scanning: true });
    return;
  }
  throw new ApiError("Ruta de administración no encontrada.", 404);
}

function getEditor(): LibraryEditor {
  if (!process.env.NAVIDROME_URL) throw new ApiError("El editor solo está disponible en una instalación gestionada.", 404);
  const key = `${process.env.LUNA_MUSIC_ROOT || "/music"}\0${process.env.LUNA_DATA || "/data"}`;
  if (!editor || key !== editorKey) {
    editor = new LibraryEditor();
    editorKey = key;
  }
  return editor;
}

function organizationOptions(value: unknown): OrganizationOptions {
  const options = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { folders: options.folders !== false, metadata: options.metadata !== false, renumber: options.renumber !== false };
}

function requiredId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new ApiError("El identificador no es válido.", 400);
  return value;
}

async function readJson(request: IncomingMessage, limit = 64 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    size += chunks.at(-1)!.length;
    if (size > limit) throw new ApiError("La solicitud es demasiado grande.", 413);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError("El cuerpo debe ser JSON válido.", 400); }
}

function sendJson(response: ServerResponse, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  response.end(body);
}

function sendBuffer(response: ServerResponse, data: Buffer, type: string): void {
  response.writeHead(200, { "Content-Type": type, "Content-Length": data.length, "Cache-Control": "private, max-age=60" });
  response.end(data);
}
