import { Play } from "lucide-react";
import { coverUrl } from "../api";
import type { Album } from "../types";

interface AlbumCardProps {
  album: Album;
  onOpen: (album: Album) => void;
  onPlay: (album: Album) => void;
}

export function AlbumCard({ album, onOpen, onPlay }: AlbumCardProps) {
  return (
    <article className="album-card">
      <div className="album-art-wrap">
        <button className="album-art-button" onClick={() => onOpen(album)} aria-label={`Abrir ${album.name}`}><img src={coverUrl(album)} alt="" loading="lazy" /></button>
        <button className="album-play" onClick={() => onPlay(album)} aria-label={`Reproducir ${album.name}`}><Play size={21} fill="currentColor" /></button>
      </div>
      <button className="album-copy" onClick={() => onOpen(album)}><strong>{album.name}</strong><span>{album.artist}</span></button>
      <p>{album.year || album.genre || `${album.songCount} canciones`}</p>
    </article>
  );
}
