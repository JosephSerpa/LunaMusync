import { ListPlus, Music2, Play } from "lucide-react";
import { coverUrl, formatDuration } from "../api";
import { usePlayer } from "../player/PlayerContext";
import type { Song } from "../types";
import { MoonIcon } from "./MoonIcon";

interface SongListProps {
  songs: Song[];
  showAlbum?: boolean;
}

export function SongList({ songs, showAlbum = true }: SongListProps) {
  const player = usePlayer();
  if (songs.length === 0) return <div className="empty-state"><MoonIcon size={40} /><h3>Aquí hay silencio</h3><p>No encontramos canciones para mostrar.</p></div>;
  return (
    <div className="song-list">
      <div className="song-list-header"><span>#</span><span>TÍTULO</span>{showAlbum && <span>ÁLBUM</span>}<span>FORMATO</span><span>TIEMPO</span><span /></div>
      {songs.map((song, index) => {
        const active = player.current?.id === song.id;
        return (
          <div className={active ? "song-row active" : "song-row"} key={`${song.id}-${index}`}>
            <button className="song-index" onClick={() => player.playQueue(songs, index)} aria-label={`Reproducir ${song.title}`}><span>{active ? <Music2 size={13} /> : song.track || index + 1}</span><Play size={14} fill="currentColor" /></button>
            <button className="song-title" onClick={() => player.playQueue(songs, index)}>
              <img src={coverUrl(song, 100)} alt="" loading="lazy" />
              <span><strong>{song.title}</strong><small>{song.artist}</small></span>
            </button>
            {showAlbum && <span className="song-album">{song.album}</span>}
            <span className="song-format">{song.suffix?.toUpperCase() || "AUDIO"}</span>
            <span className="song-duration">{formatDuration(song.duration)}</span>
            <button className="icon-button subtle song-more" onClick={() => player.playNext(song)} title="Reproducir a continuación"><ListPlus size={18} /></button>
          </div>
        );
      })}
    </div>
  );
}
