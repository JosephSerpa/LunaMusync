import { ChevronUp, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";
import type { CSSProperties } from "react";
import { coverUrl, formatDuration } from "../api";
import { usePlayer } from "../player/PlayerContext";

export function PlayerBar() {
  const player = usePlayer();
  const progress = player.duration ? (player.currentTime / player.duration) * 100 : 0;
  return (
    <footer className="player-bar">
      <div className="player-track" onClick={() => player.current && player.setExpanded(true)}>
        {player.current ? <img src={coverUrl(player.current, 160)} alt="" /> : <div className="player-empty-art" />}
        <div><strong>{player.current?.title || "Nada sonando todavía"}</strong><span>{player.current?.artist || "Elige una canción de tu biblioteca"}</span></div>
      </div>
      <div className="player-center">
        <div className="player-controls">
          <button className={player.shuffle ? "icon-button subtle active" : "icon-button subtle"} onClick={player.toggleShuffle} aria-label="Aleatorio"><Shuffle size={17} /></button>
          <button className="icon-button" onClick={player.previous} disabled={!player.current} aria-label="Anterior"><SkipBack size={20} fill="currentColor" /></button>
          <button className="play-button" onClick={player.toggle} disabled={!player.current} aria-label={player.playing ? "Pausar" : "Reproducir"}>
            {player.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button className="icon-button" onClick={player.next} disabled={!player.current} aria-label="Siguiente"><SkipForward size={20} fill="currentColor" /></button>
          <button className={player.repeat !== "none" ? "icon-button subtle active" : "icon-button subtle"} onClick={player.cycleRepeat} aria-label="Repetir">
            {player.repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
          </button>
        </div>
        <div className="player-progress">
          <span>{formatDuration(player.currentTime)}</span>
          <input
            aria-label="Posición de reproducción"
            type="range"
            min="0"
            max={player.duration || 0}
            step="0.1"
            value={Math.min(player.currentTime, player.duration || 0)}
            onChange={(event) => player.seek(Number(event.target.value))}
            style={{ "--range-progress": `${progress}%` } as CSSProperties}
            disabled={!player.current}
          />
          <span>{formatDuration(player.duration)}</span>
        </div>
      </div>
      <div className="player-actions">
        <Volume2 size={18} />
        <input aria-label="Volumen" type="range" min="0" max="1" step="0.01" value={player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} style={{ "--range-progress": `${player.volume * 100}%` } as CSSProperties} />
        <button className="icon-button" onClick={() => player.setExpanded(true)} disabled={!player.current} aria-label="Abrir reproductor"><ChevronUp size={21} /></button>
      </div>
    </footer>
  );
}
