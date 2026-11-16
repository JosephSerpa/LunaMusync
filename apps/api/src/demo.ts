import type { Album, Playlist, Song } from "./subsonic.js";

const palettes = [
  ["#61758a", "#111a2a", "#a8b6c8"],
  ["#6e526f", "#211525", "#c39eb9"],
  ["#77634e", "#241c14", "#d0af88"],
  ["#426f69", "#102421", "#8fc3b6"],
];

const definitions = [
  ["Nocturno", "Luna Serena", ["Marea", "Después de medianoche", "Órbita"]],
  ["Entre estrellas", "Nadia Sol", ["Satélite", "Gravedad", "Luz distante"]],
  ["Ciudad dormida", "Los Viajeros", ["Neón", "Último tren", "Amanecer"]],
  ["Respira", "Clara Norte", ["Bosque", "Aire", "Horizonte"]],
];

export const demoAlbums: Album[] = definitions.map(([name, artist, titles], albumIndex) => {
  const albumId = `demo-album-${albumIndex + 1}`;
  const songs = (titles as string[]).map((title, songIndex) => {
    const number = albumIndex * 3 + songIndex + 1;
    return {
      id: `demo-${number}`,
      title,
      artist: artist as string,
      album: name as string,
      albumId,
      coverArt: albumId,
      duration: 24,
      track: songIndex + 1,
      suffix: "wav",
      bitRate: 353,
      sampleRate: 22050,
      year: 2026,
      genre: ["Ambient", "Dream pop", "Electrónica", "Acústica"][albumIndex],
    } satisfies Song;
  });
  return {
    id: albumId,
    name: name as string,
    artist: artist as string,
    coverArt: albumId,
    songCount: songs.length,
    duration: songs.reduce((total, song) => total + song.duration, 0),
    year: 2026,
    genre: songs[0]?.genre,
    songs,
  };
});

export const demoSongs = demoAlbums.flatMap((album) => album.songs ?? []);
export const demoPlaylists: Playlist[] = [{
  id: "demo-playlist",
  name: "Una noche en Luna",
  songCount: demoSongs.length,
  duration: demoSongs.reduce((total, song) => total + song.duration, 0),
  coverArt: "demo-album-1",
  songs: demoSongs,
}];

export function demoCover(id: string): string {
  const index = Math.max(0, demoAlbums.findIndex((album) => album.id === id));
  const album = demoAlbums[index] ?? demoAlbums[0]!;
  const palette = palettes[index] ?? palettes[0]!;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="420" cy="170" r="94" fill="${palette[2]}" opacity=".85"/>
  <circle cx="455" cy="140" r="94" fill="${palette[1]}" opacity=".9"/>
  <path d="M0 460 Q140 350 280 460 T600 440 V600 H0Z" fill="${palette[1]}" opacity=".72"/>
  <text x="48" y="510" fill="white" font-family="sans-serif" font-size="32" letter-spacing="4">${album.name.toUpperCase()}</text>
  <text x="48" y="550" fill="white" opacity=".7" font-family="sans-serif" font-size="20">${album.artist}</text>
</svg>`;
}

const audioCache = new Map<string, Buffer>();

export function demoAudio(id: string): Buffer | null {
  const songIndex = demoSongs.findIndex((song) => song.id === id);
  if (songIndex < 0) return null;
  const cached = audioCache.get(id);
  if (cached) return cached;

  const sampleRate = 22050;
  const seconds = 24;
  const samples = sampleRate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);

  const root = 164.81 * 2 ** ((songIndex % 6) / 12);
  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const fade = Math.min(1, time / 1.5, (seconds - time) / 1.5);
    const pulse = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.25 * time);
    const sample = (
      Math.sin(2 * Math.PI * root * time) * 0.11
      + Math.sin(2 * Math.PI * root * 1.25 * time) * 0.07
      + Math.sin(2 * Math.PI * root * 1.5 * time) * 0.05
    ) * fade * pulse;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }
  audioCache.set(id, buffer);
  return buffer;
}
