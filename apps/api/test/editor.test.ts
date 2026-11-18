import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseFile } from "music-metadata";
import { demoAudio } from "../src/demo.js";
import { encodeFileId, LibraryEditor, validateCover } from "../src/editor.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function fixture(context: test.TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "luna-editor-test-"));
  const music = path.join(root, "music");
  const data = path.join(root, "data");
  const relative = "Biblioteca/Artista/03 - Noche.wav";
  const absolute = path.join(music, ...relative.split("/"));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, demoAudio("demo-1"));
  context.after(() => rm(root, { recursive: true, force: true }));
  return { editor: new LibraryEditor(music, data), music, relative, absolute };
}

test("metadata, covers and lyrics persist without re-encoding audio and can be restored", async (context) => {
  const { editor, relative, absolute } = await fixture(context);
  const original = await readFile(absolute);
  const [track] = await editor.list();
  assert.ok(track);
  assert.equal(track.path, relative);
  const updated = await editor.update([track.id], {
    title: "Noche editada", artist: "Luna", album: "Mareas", albumArtist: "Luna",
    year: 2026, genre: "Ambient", track: 3, trackTotal: 8, disc: 1, comment: "Edición Luna",
  }, { data: png, format: "image/png" });
  assert.equal(updated.changed, 1);
  const metadata = await parseFile(absolute);
  assert.equal(metadata.common.title, "Noche editada");
  assert.equal(metadata.common.album, "Mareas");
  assert.equal(metadata.common.albumartist, "Luna");
  assert.equal(metadata.common.track.no, 3);
  assert.equal(metadata.common.picture?.[0]?.format, "image/png");
  assert.deepEqual(Buffer.from(metadata.common.picture![0]!.data), png);

  const lyrics = "[00:01.00] Bajo la luna\n[00:02.00] todo vuelve";
  await editor.saveLyrics([track.id], lyrics);
  assert.equal(await readFile(absolute.replace(/\.wav$/, ".lrc"), "utf8"), `${lyrics}\n`);
  assert.ok(JSON.stringify((await parseFile(absolute)).common.lyrics).includes("Bajo la luna"));
  assert.equal((await editor.list(true))[0]?.hasLyrics, true);

  await editor.restore(updated.operationId);
  assert.deepEqual(await readFile(absolute), original);
  const restored = await parseFile(absolute);
  assert.notEqual(restored.common.title, "Noche editada");
});

test("organization previews destinations, moves sidecars and restores the original layout", async (context) => {
  const { editor, music, relative, absolute } = await fixture(context);
  const [track] = await editor.list();
  assert.ok(track);
  await editor.saveLyrics([track.id], "[00:01.00] Luna");
  const plan = await editor.organizationPlan([track.id], { folders: true, metadata: true, renumber: true });
  assert.equal(plan.collisions.length, 0);
  const destination = plan.changes[0]!.destination;
  assert.match(destination, /^Biblioteca\/Artista\/Álbum desconocido\/03 - Noche\.wav$/);
  const operation = await editor.organize([track.id], { folders: true, metadata: true, renumber: true });
  const target = path.join(music, ...destination.split("/"));
  assert.equal(existsSync(absolute), false);
  assert.equal(existsSync(target), true);
  assert.equal(existsSync(target.replace(/\.wav$/, ".lrc")), true);
  assert.equal((await editor.list(true))[0]?.path, destination);
  await editor.restore(operation.operationId);
  assert.equal(existsSync(absolute), true);
  assert.equal(existsSync(target), false);
  assert.equal((await parseFile(absolute)).common.album, undefined);
  assert.equal((await editor.list(true))[0]?.path, relative);
});

test("unsafe identifiers, invalid covers and organization collisions are rejected", async (context) => {
  const { editor, music, absolute } = await fixture(context);
  await assert.rejects(editor.tracks([encodeFileId("../outside.wav")]), /sale de la biblioteca|Identificador/);
  await assert.rejects(editor.tracks(["not*valid"]), /Identificador/);
  assert.throws(() => validateCover(Buffer.from("not an image")), /JPEG o PNG/);
  const [track] = await editor.list();
  assert.ok(track);
  const secondRelative = "Biblioteca/Artista/Otra.wav";
  const secondAbsolute = path.join(music, ...secondRelative.split("/"));
  await writeFile(secondAbsolute, demoAudio("demo-2"));
  const tracks = await editor.list(true);
  await editor.update(tracks.map((item) => item.id), { title: "Misma", artist: "Luna", album: "Igual", albumArtist: "Luna", track: 1 });
  const plan = await editor.organizationPlan(tracks.map((item) => item.id), { folders: true, metadata: false, renumber: true });
  assert.ok(plan.collisions.length > 0);
  await assert.rejects(editor.organize(tracks.map((item) => item.id), { folders: true, metadata: false, renumber: true }), /colisiones/);
  assert.equal(existsSync(absolute), true);
  assert.equal(existsSync(secondAbsolute), true);
});

test("local cover discovery stays within the selected library", async (context) => {
  const { editor, music, absolute } = await fixture(context);
  await writeFile(path.join(path.dirname(absolute), "cover.png"), png);
  const [track] = await editor.list();
  assert.ok(track);
  const folder = await editor.localCovers(track.id, "folder");
  assert.equal(folder.length, 1);
  const cover = await editor.localCover(folder[0]!.id);
  assert.equal(cover.format, "image/png");
  assert.deepEqual(cover.data, png);
  assert.equal(cover.relativePath, "Biblioteca/Artista/cover.png");
  assert.equal(existsSync(path.join(music, "Biblioteca")), true);
});
