import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { createApp } from "../src/app.js";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return `http://127.0.0.1:${address.port}`;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
}

function ok(value: Record<string, unknown>) {
  return { "subsonic-response": { status: "ok", version: "1.16.1", type: "navidrome", serverVersion: "0.58.0", ...value } };
}

const song = {
  id: "song-1", title: "Marea", artist: "Luna Serena", album: "Nocturno", albumId: "album-1",
  coverArt: "cover-1", duration: 180, track: 1, suffix: "flac", bitRate: 900, samplingRate: 44100,
};
const album = { id: "album-1", name: "Nocturno", artist: "Luna Serena", coverArt: "cover-1", songCount: 1, duration: 180, year: 2026 };

function fakeSubsonic(options: { firstTime?: boolean } = {}): Server {
  let username = "listener";
  let password = "secret";
  let firstTime = options.firstTime ?? false;
  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    const send = (payload: unknown, status = 200) => {
      const body = JSON.stringify(payload);
      response.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
      response.end(body);
    };
    if (url.pathname === "/app/") {
      const config = JSON.stringify(JSON.stringify({ firstTime }));
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<html><script>window.__APP_CONFIG__ = ${config}</script></html>`);
      return;
    }
    if (url.pathname === "/auth/createAdmin") {
      if (!firstTime) {
        send({ error: "Cannot create another first admin" }, 403);
        return;
      }
      let body = "";
      for await (const chunk of request) body += chunk;
      const credentials = JSON.parse(body);
      username = credentials.username;
      password = credentials.password;
      firstTime = false;
      send({ token: "native-jwt", username });
      return;
    }
    const method = url.pathname.split("/").pop();
    const salt = url.searchParams.get("s") || "";
    const expected = createHash("md5").update(`${password}${salt}`).digest("hex");
    const authenticated = url.searchParams.get("u") === username && url.searchParams.get("t") === expected;
    if (!authenticated) {
      send({ "subsonic-response": { status: "failed", error: { code: 40, message: "Wrong credentials" } } });
      return;
    }
    if (method === "ping") send(ok({}));
    else if (method === "getAlbumList2") send(ok({ albumList2: { album: [album] } }));
    else if (method === "getAlbum") send(ok({ album: { ...album, song: [song] } }));
    else if (method === "search3") send(ok({ searchResult3: { album: url.searchParams.get("query") ? [album] : [], song: [song] } }));
    else if (method === "getPlaylists") send(ok({ playlists: { playlist: [{ id: "list-1", name: "Noche", songCount: 1, duration: 180, coverArt: "cover-1" }] } }));
    else if (method === "getPlaylist") send(ok({ playlist: { id: "list-1", name: "Noche", songCount: 1, duration: 180, entry: [song] } }));
    else if (method === "getCoverArt") {
      response.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": 4 });
      response.end(Buffer.from([1, 2, 3, 4]));
    } else if (method === "stream") {
      const audio = Buffer.from("AUDIO-CONTENT");
      response.writeHead(206, {
        "Content-Type": "audio/flac",
        "Content-Length": 4,
        "Content-Range": `bytes 0-3/${audio.length}`,
        "Accept-Ranges": "bytes",
      });
      response.end(audio.subarray(0, 4));
    } else send(ok({}));
  });
}

test("health and demo expose real playable audio with byte ranges", async (context) => {
  const app = createApp();
  const base = await listen(app);
  context.after(() => app.close());

  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.equal(health.status, "ok");

  const library = await fetch(`${base}/api/demo/library`).then((response) => response.json());
  assert.equal(library.albums.length, 4);
  assert.equal(library.songs.length, 12);
  assert.ok(library.albums[0].songs.length > 0);

  const audio = await fetch(`${base}/api/demo/stream/demo-1`, { headers: { Range: "bytes=0-99" } });
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get("content-type"), "audio/wav");
  assert.equal(audio.headers.get("content-range"), `bytes 0-99/${44 + 22050 * 24 * 2}`);
  const bytes = Buffer.from(await audio.arrayBuffer());
  assert.equal(bytes.length, 100);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");

  const cover = await fetch(`${base}/api/demo/cover/demo-album-1`);
  assert.equal(cover.status, 200);
  assert.match(cover.headers.get("content-type") || "", /image\/svg\+xml/);
});

test("OpenSubsonic session protects catalog and proxies authenticated media", async (context) => {
  const upstream = fakeSubsonic();
  const upstreamUrl = await listen(upstream);
  const app = createApp();
  const base = await listen(app);
  context.after(() => { app.close(); upstream.close(); });

  assert.equal((await fetch(`${base}/api/library/albums`)).status, 401);
  const rejected = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverUrl: upstreamUrl, username: "listener", password: "wrong" }),
  });
  assert.equal(rejected.status, 401);

  const login = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverUrl: upstreamUrl, username: "listener", password: "secret" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("luna_session="));
  const session = await login.json();
  assert.equal(session.server.name, "navidrome");
  assert.equal(JSON.stringify(session).includes("secret"), false);
  const headers = { Cookie: cookie! };

  const albums = await fetch(`${base}/api/library/albums`, { headers }).then((response) => response.json());
  assert.equal(albums.albums[0].name, "Nocturno");
  const detail = await fetch(`${base}/api/library/albums/album-1`, { headers }).then((response) => response.json());
  assert.equal(detail.album.songs[0].sampleRate, 44100);
  const songs = await fetch(`${base}/api/library/songs?size=100`, { headers }).then((response) => response.json());
  assert.equal(songs.songs[0].suffix, "flac");
  const search = await fetch(`${base}/api/library/search?q=marea`, { headers }).then((response) => response.json());
  assert.equal(search.albums.length, 1);
  const playlists = await fetch(`${base}/api/library/playlists`, { headers }).then((response) => response.json());
  assert.equal(playlists.playlists[0].name, "Noche");
  const playlist = await fetch(`${base}/api/library/playlists/list-1`, { headers }).then((response) => response.json());
  assert.equal(playlist.playlist.songs.length, 1);

  const stream = await fetch(`${base}/api/stream/song-1`, { headers: { ...headers, Range: "bytes=0-3" } });
  assert.equal(stream.status, 206);
  assert.equal(await stream.text(), "AUDI");
  assert.equal(stream.headers.get("content-type"), "audio/flac");
  const cover = await fetch(`${base}/api/cover/cover-1?size=300`, { headers });
  assert.equal(cover.headers.get("content-type"), "image/jpeg");
  assert.equal((await cover.arrayBuffer()).byteLength, 4);

  await fetch(`${base}/api/session`, { method: "DELETE", headers });
  const loggedOut = await fetch(`${base}/api/session`, { headers }).then((response) => response.json());
  assert.equal(loggedOut.authenticated, false);
});


test("managed setup creates only the first administrator and opens a Luna session", async (context) => {
  const upstream = fakeSubsonic({ firstTime: true });
  const upstreamUrl = await listen(upstream);
  const previousUrl = process.env.NAVIDROME_URL;
  process.env.NAVIDROME_URL = upstreamUrl;
  const app = createApp();
  const base = await listen(app);
  context.after(() => {
    app.close();
    upstream.close();
    if (previousUrl === undefined) delete process.env.NAVIDROME_URL;
    else process.env.NAVIDROME_URL = previousUrl;
  });

  const initial = await fetch(`${base}/api/config`).then((response) => response.json());
  assert.deepEqual(initial, { managed: true, setupRequired: true });
  const invalid = await fetch(`${base}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "not valid", password: "Luna-Secret-123" }),
  });
  assert.equal(invalid.status, 400);

  const setup = await fetch(`${base}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "lunaowner", password: "Luna-Secret-123" }),
  });
  assert.equal(setup.status, 200);
  const cookie = setup.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("luna_session="));
  assert.match(setup.headers.get("set-cookie") || "", /HttpOnly/);
  const session = await setup.json();
  assert.equal(session.username, "lunaowner");
  assert.equal(session.authenticated, true);
  assert.equal(JSON.stringify(session).includes("Luna-Secret-123"), false);
  assert.equal(JSON.stringify(session).includes("native-jwt"), false);

  const configured = await fetch(`${base}/api/config`).then((response) => response.json());
  assert.deepEqual(configured, { managed: true, setupRequired: false });
  const repeated = await fetch(`${base}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "another", password: "Another-Secret-123" }),
  });
  assert.equal(repeated.status, 409);
  const albums = await fetch(`${base}/api/library/albums`, { headers: { Cookie: cookie! } }).then((response) => response.json());
  assert.equal(albums.albums[0].name, "Nocturno");
});
