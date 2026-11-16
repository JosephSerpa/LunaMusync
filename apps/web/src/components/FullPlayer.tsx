import { ChevronDown, ChevronUp, ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { coverUrl, formatDuration } from "../api";
import { usePlayer } from "../player/PlayerContext";

export function FullPlayer() {
  const player = usePlayer();
  const [queueOpen, setQueueOpen] = useState(false);
  if (!player.expanded || !player.current) return null;
  const song = player.current;
  const progress = player.duration ? (player.currentTime / player.duration) * 100 : 0;

  return (
    <section className="full-player" aria-label="Reproductor completo">
      <div className="full-player-background" style={{ backgroundImage: `url(${coverUrl(song, 1000)})` }} />
      <header className="full-player-header">
        <button className="icon-button glass" onClick={() => player.setExpanded(false)} aria-label="Cerrar reproductor"><ChevronDown size={25} /></button>
        <span>REPRODUCIENDO AHORA</span>
        <button className={queueOpen ? "icon-button glass active" : "icon-button glass"} onClick={() => setQueueOpen((value) => !value)} aria-label="Mostrar cola"><ListMusic size={21} /></button>
      </header>
      <div className={queueOpen ? "full-player-layout queue-visible" : "full-player-layout"}>
        <div className="now-playing">
          <div className="now-playing-art-wrap"><img className="now-playing-art" src={coverUrl(song, 1000)} alt={`Carátula de ${song.album}`} /></div>
          <div className="now-playing-copy">
            <p className="eyebrow">{song.genre || "LUNA PLAYER"}</p>
            <h1>{song.title}</h1>
            <p>{song.artist} <span>—</span> {song.album}</p>
          </div>
          <div className="full-progress">
            <input aria-label="Posición de reproducción" type="range" min="0" max={player.duration || 0} step="0.1" value={Math.min(player.currentTime, player.duration || 0)} onChange={(event) => player.seek(Number(event.target.value))} style={{ "--range-progress": `${progress}%` } as CSSProperties} />
            <div><span>{formatDuration(player.currentTime)}</span><span>{formatDuration(player.duration)}</span></div>
          </div>
          <div className="full-controls">
            <button className={player.shuffle ? "icon-button active" : "icon-button"} onClick={player.toggleShuffle} aria-label="Aleatorio"><Shuffle size={21} /></button>
            <button className="icon-button" onClick={player.previous} aria-label="Anterior"><SkipBack size={29} fill="currentColor" /></button>
            <button className="play-button play-button-large" onClick={player.toggle} aria-label={player.playing ? "Pausar" : "Reproducir"}>{player.playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}</button>
            <button className="icon-button" onClick={player.next} aria-label="Siguiente"><SkipForward size={29} fill="currentColor" /></button>
            <button className={player.repeat !== "none" ? "icon-button active" : "icon-button"} onClick={player.cycleRepeat} aria-label="Repetir">{player.repeat === "one" ? <Repeat1 size={21} /> : <Repeat size={21} />}</button>
          </div>
          <div className="track-technical">
            {song.suffix && <span>{song.suffix.toUpperCase()}</span>}
            {song.bitRate && <span>{song.bitRate} kbps</span>}
            {song.sampleRate && <span>{(song.sampleRate / 1000).toFixed(1)} kHz</span>}
          </div>
        </div>
        {queueOpen && (
          <aside className="queue-panel">
            <div className="queue-heading"><div><p className="eyebrow">A CONTINUACIÓN</p><h2>Tu cola</h2></div><button className="icon-button" onClick={player.clear} title="Vaciar cola"><Trash2 size={18} /></button></div>
            <div className="queue-list">
              {player.queue.map((item, index) => (
                <div className={index === player.currentIndex ? "queue-item current" : "queue-item"} key={`${item.id}-${index}`}>
                  <button className="queue-song" onClick={() => player.playQueue(player.queue, index)}>
                    <img src={coverUrl(item, 100)} alt="" /><span><strong>{item.title}</strong><small>{item.artist}</small></span>
                  </button>
                  <div className="queue-item-actions">
                    <button disabled={index === 0} onClick={() => player.move(index, index - 1)} aria-label="Subir"><ChevronUp size={15} /></button>
                    <button disabled={index === player.queue.length - 1} onClick={() => player.move(index, index + 1)} aria-label="Bajar"><ChevronDown size={15} /></button>
                    <button onClick={() => player.removeAt(index)} aria-label="Quitar"><X size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
