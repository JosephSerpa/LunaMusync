import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { demoAlbums, demoAudio, demoCover, demoPlaylists, demoSongs } from "./demo.js";
import { SubsonicClient, SubsonicError, type ServerInfo } from "./subsonic.js";

interface Session {
  client: SubsonicClient;
  username: string;
  serverUrl: string;
  info: ServerInfo;
  expiresAt: number;
}

const sessions = new Map<string, Session>();
const SESSION_DURATION = 24 * 60 * 60 * 1000;
const COOKIE_NAME = "luna_session";
const webDist = path.resolve(process.env.WEB_DIST || path.join(process.cwd(), "../web/dist"));

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function createApp() {
  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    try {
      await route(request, response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error instanceof ApiError || error instanceof SubsonicError ? error.status : 500;
      const message = error instanceof ApiError || error instanceof SubsonicError
        ? error.message
        : "No se pudo completar la solicitud.";
      if (!(error instanceof ApiError) && !(error instanceof SubsonicError)) console.error(error);
      sendJson(response, status, { error: message });
    }
  });
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method || "GET";
  const url = new URL(request.url || "/", "http://localhost");
  const pathname = url.pathname;

  if (pathname === "/api/health" && method === "GET") {
    sendJson(response, 200, { status: "ok", service: "luna-core", version: "0.1.0" });
    return;
  }

  if (pathname === "/api/config" && method === "GET") {
    const managed = Boolean(process.env.NAVIDROME_URL);
    sendJson(response, 200, {
      managed,
      adminUrl: managed ? process.env.NAVIDROME_PUBLIC_URL || "http://localhost:4533" : null,
    });
    return;
  }

  if (pathname === "/api/session" && method === "POST") {
    const body = await readJson(request);
    const serverUrl = process.env.NAVIDROME_URL || requiredString(body.serverUrl, "La dirección del servidor es obligatoria.");
    const username = requiredString(body.username, "El usuario es obligatorio.");
    const password = requiredString(body.password, "La contraseña es obligatoria.");
    const { client, info } = await SubsonicClient.connect(serverUrl, username, password);
    const token = randomBytes(32).toString("base64url");
    sessions.set(token, {
      client,
      username,
      serverUrl,
      info,
      expiresAt: Date.now() + SESSION_DURATION,
    });
    response.setHeader("Set-Cookie", sessionCookie(token));
    sendJson(response, 200, sessionPayload(sessions.get(token)!, true));
    return;
  }

  if (pathname === "/api/session" && method === "GET") {
    const session = getSession(request);
    sendJson(response, 200, session ? sessionPayload(session, true) : { authenticated: false });
    return;
  }

  if (pathname === "/api/session" && method === "DELETE") {
    const token = getToken(request);
    if (token) sessions.delete(token);
    response.setHeader("Set-Cookie", sessionCookie("", 0));
    sendJson(response, 200, { authenticated: false });
    return;
  }

  if (pathname.startsWith("/api/demo/")) {
    routeDemo(pathname, method, request, response);
    return;
  }

  if (pathname.startsWith("/api/")) {
    const session = requireSession(request);

    if (pathname === "/api/library/albums" && method === "GET") {
      const size = boundedNumber(url.searchParams.get("size"), 40, 1, 100);
      const offset = boundedNumber(url.searchParams.get("offset"), 0, 0, 1_000_000);
      sendJson(response, 200, { albums: await session.client.albums(size, offset) });
      return;
    }

    const albumMatch = pathname.match(/^\/api\/library\/albums\/([^/]+)$/);
    if (albumMatch && method === "GET") {
      sendJson(response, 200, { album: await session.client.album(decode(albumMatch[1]!)) });
      return;
    }

    if (pathname === "/api/library/songs" && method === "GET") {
      const size = boundedNumber(url.searchParams.get("size"), 100, 1, 500);
      const offset = boundedNumber(url.searchParams.get("offset"), 0, 0, 1_000_000);
      sendJson(response, 200, { songs: await session.client.songs(size, offset) });
      return;
    }

    if (pathname === "/api/library/search" && method === "GET") {
      const query = url.searchParams.get("q")?.trim();
      if (!query) {
        sendJson(response, 200, { albums: [], songs: [] });
        return;
      }
      sendJson(response, 200, await session.client.search(query.slice(0, 200)));
      return;
    }

    if (pathname === "/api/library/playlists" && method === "GET") {
      sendJson(response, 200, { playlists: await session.client.playlists() });
      return;
    }

    const playlistMatch = pathname.match(/^\/api\/library\/playlists\/([^/]+)$/);
    if (playlistMatch && method === "GET") {
      sendJson(response, 200, { playlist: await session.client.playlist(decode(playlistMatch[1]!)) });
      return;
    }

    const streamMatch = pathname.match(/^\/api\/stream\/([^/]+)$/);
    if (streamMatch && (method === "GET" || method === "HEAD")) {
      const upstream = await session.client.stream(decode(streamMatch[1]!), request.headers.range);
      await pipeMedia(upstream, request, response, "audio/mpeg");
      return;
    }

    const coverMatch = pathname.match(/^\/api\/cover\/([^/]+)$/);
    if (coverMatch && (method === "GET" || method === "HEAD")) {
      const size = boundedNumber(url.searchParams.get("size"), 600, 64, 1600);
      const upstream = await session.client.cover(decode(coverMatch[1]!), size);
      await pipeMedia(upstream, request, response, "image/jpeg");
      return;
    }
  }

  if ((method === "GET" || method === "HEAD") && !pathname.startsWith("/api/")) {
    if (await serveStatic(pathname, request.method === "HEAD", response)) return;
  }
  throw new ApiError("Ruta no encontrada.", 404);
}

function routeDemo(pathname: string, method: string, request: IncomingMessage, response: ServerResponse): void {
  if (method !== "GET" && method !== "HEAD") throw new ApiError("Ruta no encontrada.", 404);
  if (pathname === "/api/demo/library") {
    sendJson(response, 200, { albums: demoAlbums, songs: demoSongs, playlists: demoPlaylists });
    return;
  }
  const coverMatch = pathname.match(/^\/api\/demo\/cover\/([^/]+)$/);
  if (coverMatch) {
    response.writeHead(200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
    response.end(method === "HEAD" ? undefined : demoCover(decode(coverMatch[1]!)));
    return;
  }
  const streamMatch = pathname.match(/^\/api\/demo\/stream\/([^/]+)$/);
  if (streamMatch) {
    const audio = demoAudio(decode(streamMatch[1]!));
    if (!audio) throw new ApiError("La canción de demostración no existe.", 404);
    sendBuffer(audio, request, response, "audio/wav");
    return;
  }
  throw new ApiError("Ruta no encontrada.", 404);
}

function sendBuffer(buffer: Buffer, request: IncomingMessage, response: ServerResponse, type: string): void {
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = buffer.length - 1;
  let status = 200;
  if (range) {
    if (range[1]) start = Number(range[1]);
    if (range[2]) end = Math.min(Number(range[2]), end);
    if (!range[1] && range[2]) start = Math.max(0, buffer.length - Number(range[2]));
    if (start > end || start >= buffer.length) {
      response.writeHead(416, { "Content-Range": `bytes */${buffer.length}` });
      response.end();
      return;
    }
    status = 206;
  }
  response.writeHead(status, {
    "Content-Type": type,
    "Content-Length": end - start + 1,
    "Accept-Ranges": "bytes",
    ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${buffer.length}` } : {}),
  });
  if (request.method === "HEAD") response.end();
  else response.end(buffer.subarray(start, end + 1));
}

async function pipeMedia(upstream: Response, request: IncomingMessage, response: ServerResponse, fallbackType: string): Promise<void> {
  if (!upstream.ok && upstream.status !== 206) {
    upstream.body?.cancel();
    throw new SubsonicError("El servidor no pudo entregar el contenido solicitado.", upstream.status === 404 ? 404 : 502);
  }
  const headers: Record<string, string> = {};
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  if (!headers["content-type"]) headers["content-type"] = fallbackType;
  response.writeHead(upstream.status, headers);
  if (request.method === "HEAD" || !upstream.body) {
    upstream.body?.cancel();
    response.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const stream = Readable.fromWeb(upstream.body as ReadableStream);
    stream.on("error", reject);
    response.on("close", () => {
      stream.destroy();
      resolve();
    });
    response.on("finish", resolve);
    stream.pipe(response);
  });
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 32 * 1024) throw new ApiError("La solicitud es demasiado grande.", 413);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError("El cuerpo debe ser JSON válido.", 400);
  }
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(message, 400);
  return value.trim();
}

function boundedNumber(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new ApiError("Parámetro de paginación inválido.", 400);
  return number;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ApiError("Identificador inválido.", 400);
  }
}

function getToken(request: IncomingMessage): string | null {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [name, ...parts] = cookie.trim().split("=");
    if (name === COOKIE_NAME) return parts.join("=") || null;
  }
  return null;
}

function getSession(request: IncomingMessage): Session | null {
  const token = getToken(request);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function requireSession(request: IncomingMessage): Session {
  return getSession(request) ?? (() => { throw new ApiError("La sesión ha caducado. Vuelve a conectarte.", 401); })();
}

function sessionPayload(session: Session, authenticated: boolean) {
  return {
    authenticated,
    username: session.username,
    serverUrl: session.serverUrl,
    server: session.info,
  };
}

function sessionCookie(token: string, maxAge?: number): string {
  const parts = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.COOKIE_SECURE === "true") parts.push("Secure");
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function serveStatic(pathname: string, head: boolean, response: ServerResponse): Promise<boolean> {
  if (!existsSync(webDist)) return false;
  let filePath = path.resolve(webDist, `.${pathname}`);
  if (!filePath.startsWith(`${webDist}${path.sep}`) && filePath !== webDist) return false;
  let info = await stat(filePath).catch(() => null);
  if (info?.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    info = await stat(filePath).catch(() => null);
  }
  if (!info?.isFile()) {
    filePath = path.join(webDist, "index.html");
    info = await stat(filePath).catch(() => null);
  }
  if (!info?.isFile()) return false;
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
  };
  response.writeHead(200, {
    "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=86400",
  });
  if (head) response.end();
  else createReadStream(filePath).pipe(response);
  return true;
}
