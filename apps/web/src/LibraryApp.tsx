import { ArrowLeft, ListMusic, LoaderCircle, LogOut, Play, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, coverUrl, formatDuration } from "./api";
import { AlbumCard } from "./components/AlbumCard";
import { FullPlayer } from "./components/FullPlayer";
import { MoonIcon } from "./components/MoonIcon";
import { PlayerBar } from "./components/PlayerBar";
import { Sidebar } from "./components/Sidebar";
import { SongList } from "./components/SongList";
import { PlayerProvider, usePlayer } from "./player/PlayerContext";
import type { Album, LibraryView, Playlist, Session, Song } from "./types";

export function LibraryApp({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const storageKey = `luna-player-v1:${session.demo ? "demo" : `${session.serverUrl}:${session.username}`}`;
  return <PlayerProvider storageKey={storageKey}><LibraryContent session={session} onLogout={onLogout} /></PlayerProvider>;
}

function LibraryContent({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const player = usePlayer();
  const [view, setView] = useState<LibraryView>("home");
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selected, setSelected] = useState<Album | Playlist | null>(null);
  const [selectedKind, setSelectedKind] = useState<"album" | "playlist">("album");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ albums: Album[]; songs: Song[] }>({ albums: [], songs: [] });
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (session.demo) {
        const result = await api.demo();
        setAlbums(result.albums);
        setSongs(result.songs);
        setPlaylists(result.playlists);
      } else {
        const [albumResult, songResult, playlistResult] = await Promise.all([api.albums(), api.songs(), api.playlists()]);
        setAlbums(albumResult.albums);
        setSongs(songResult.songs);
        setPlaylists(playlistResult.playlists);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar la biblioteca.");
    } finally {
      setLoading(false);
    }
  }, [session.demo]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setSearchResults({ albums: [], songs: [] });
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = session.demo
          ? {
              albums: albums.filter((album) => `${album.name} ${album.artist}`.toLowerCase().includes(value.toLowerCase())),
              songs: songs.filter((song) => `${song.title} ${song.artist} ${song.album}`.toLowerCase().includes(value.toLowerCase())),
            }
          : await api.search(value);
        if (!cancelled) setSearchResults(result);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "La búsqueda no está disponible.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [albums, query, session.demo, songs]);

  const openAlbum = async (album: Album) => {
    setSelectedKind("album");
    setQuery("");
    if (album.songs || session.demo) {
      setSelected(album.songs ? album : { ...album, songs: songs.filter((song) => song.albumId === album.id) });
      return;
    }
    setDetailLoading(true);
    try {
      const result = await api.album(album.id);
      setSelected(result.album);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir el álbum.");
    } finally {
      setDetailLoading(false);
    }
  };

  const openPlaylist = async (playlist: Playlist) => {
    setSelectedKind("playlist");
    setQuery("");
    if (playlist.songs || session.demo) {
      setSelected(playlist);
      return;
    }
    setDetailLoading(true);
    try {
      const result = await api.playlist(playlist.id);
      setSelected(result.playlist);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir la lista.");
    } finally {
      setDetailLoading(false);
    }
  };

  const playAlbum = async (album: Album) => {
    let songsToPlay = album.songs;
    if (!songsToPlay && session.demo) songsToPlay = songs.filter((song) => song.albumId === album.id);
    if (!songsToPlay) {
      setDetailLoading(true);
      try {
        songsToPlay = (await api.album(album.id)).album.songs;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No se pudo reproducir el álbum.");
        return;
      } finally {
        setDetailLoading(false);
      }
    }
    if (songsToPlay) player.playQueue(songsToPlay);
  };

  const changeView = (next: LibraryView) => {
    setView(next);
    setSelected(null);
    setQuery("");
  };

  const greeting = new Date().getHours() < 12 ? "Buenos días" : new Date().getHours() < 20 ? "Buenas tardes" : "Buenas noches";
  const featured = albums[0];
  const showingSearch = query.trim().length > 0;

  return (
    <div className="library-app">
      {player.current && <div className="library-ambient" style={{ backgroundImage: `url(${coverUrl(player.current, 600)})` }} />}
      <Sidebar view={view} onView={changeView} session={session} onLogout={onLogout} />
      <div className="library-frame">
        <header className="library-topbar">
          <div className="mobile-brand brand"><MoonIcon size={27} /><span>luna</span></div>
          <label className="search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca canciones, álbumes o artistas" aria-label="Buscar en la biblioteca" />{searching ? <LoaderCircle className="spin" size={17} /> : query && <button onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={17} /></button>}</label>
          <div className="topbar-user"><span className="status-dot" /><div><strong>{session.username}</strong><small>{session.demo ? "Modo demostración" : session.managed ? "Luna Musync" : session.server.name}</small></div></div>
          <button className="icon-button mobile-logout" onClick={onLogout} aria-label="Cerrar sesión"><LogOut size={19} /></button>
        </header>
        <main className="library-content">
          {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
          {loading || detailLoading ? <LoadingLibrary /> : showingSearch ? (
            <SearchResults query={query} results={searchResults} openAlbum={openAlbum} playAlbum={playAlbum} />
          ) : selected ? (
            <DetailView item={selected} kind={selectedKind} onBack={() => setSelected(null)} />
          ) : (
            <>
              {view === "home" && (
                <>
                  <section className="home-heading"><div><p className="eyebrow">{greeting}, {session.username}</p><h1>Tu música,<br /><span>sin fronteras.</span></h1></div><p>Todo lo que quieres escuchar,<br />en un solo universo.</p></section>
                  {featured && <section className="featured-album"><div className="featured-art"><img src={coverUrl(featured, 800)} alt={`Carátula de ${featured.name}`} /></div><div className="featured-copy"><p className="eyebrow">DESTACADO PARA TI</p><h2>{featured.name}</h2><p>{featured.artist}</p><span>{featured.songCount} canciones · {formatDuration(featured.duration)}</span><button className="button button-primary" onClick={() => void playAlbum(featured)}><Play size={18} fill="currentColor" />Reproducir ahora</button></div></section>}
                  <SectionHeading title="Álbumes recientes" action="Ver todos" onAction={() => setView("albums")} />
                  <div className="album-grid">{albums.slice(0, 8).map((album) => <AlbumCard key={album.id} album={album} onOpen={openAlbum} onPlay={playAlbum} />)}</div>
                  <SectionHeading title="Una pista para empezar" action="Ver canciones" onAction={() => setView("songs")} />
                  <SongList songs={songs.slice(0, 7)} />
                </>
              )}
              {view === "albums" && <><PageHeading eyebrow="EXPLORA TU COLECCIÓN" title="Álbumes" count={albums.length} /><div className="album-grid album-grid-full">{albums.map((album) => <AlbumCard key={album.id} album={album} onOpen={openAlbum} onPlay={playAlbum} />)}</div></>}
              {view === "songs" && <><PageHeading eyebrow="TODA TU MÚSICA" title="Canciones" count={songs.length} /><SongList songs={songs} /></>}
              {view === "playlists" && <><PageHeading eyebrow="MOMENTOS GUARDADOS" title="Listas de reproducción" count={playlists.length} /><div className="playlist-grid">{playlists.map((playlist) => <button className="playlist-card" key={playlist.id} onClick={() => void openPlaylist(playlist)}><div><img src={coverUrl(playlist)} alt="" /><span><ListMusic size={25} /></span></div><strong>{playlist.name}</strong><p>{playlist.songCount} canciones · {formatDuration(playlist.duration)}</p></button>)}</div>{playlists.length === 0 && <div className="empty-state"><ListMusic size={38} /><h3>Aún no hay listas</h3><p>Las listas de tu servidor aparecerán aquí.</p></div>}</>}
            </>
          )}
        </main>
      </div>
      <PlayerBar />
      <FullPlayer />
    </div>
  );
}

function LoadingLibrary() {
  return <div className="loading-library"><div className="loading-heading shimmer" /><div className="loading-feature shimmer" /><div className="loading-grid">{Array.from({ length: 6 }, (_, index) => <div className="loading-card shimmer" key={index} />)}</div><span>Cargando tu universo musical…</span></div>;
}

function SectionHeading({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return <div className="section-heading"><h2>{title}</h2><button onClick={onAction}>{action}<span>→</span></button></div>;
}

function PageHeading({ eyebrow, title, count }: { eyebrow: string; title: string; count: number }) {
  return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{count} {count === 1 ? "elemento" : "elementos"} en tu biblioteca</p></div>;
}

function DetailView({ item, kind, onBack }: { item: Album | Playlist; kind: "album" | "playlist"; onBack: () => void }) {
  const player = usePlayer();
  const artist = "artist" in item ? item.artist : "Lista de reproducción";
  return <><button className="back-button" onClick={onBack}><ArrowLeft size={18} />Volver a la biblioteca</button><section className="detail-hero"><img src={coverUrl(item, 800)} alt={`Carátula de ${item.name}`} /><div><p className="eyebrow">{kind === "album" ? "ÁLBUM" : "LISTA DE REPRODUCCIÓN"}</p><h1>{item.name}</h1><p>{artist}</p><span>{item.songCount} canciones · {formatDuration(item.duration)}{"year" in item && item.year ? ` · ${item.year}` : ""}</span><button className="button button-primary" disabled={!item.songs?.length} onClick={() => item.songs && player.playQueue(item.songs)}><Play size={18} fill="currentColor" />Reproducir</button></div></section><SongList songs={item.songs ?? []} showAlbum={kind === "playlist"} /></>;
}

function SearchResults({ query, results, openAlbum, playAlbum }: { query: string; results: { albums: Album[]; songs: Song[] }; openAlbum: (album: Album) => void; playAlbum: (album: Album) => void }) {
  return <><PageHeading eyebrow="RESULTADOS DE BÚSQUEDA" title={`“${query}”`} count={results.albums.length + results.songs.length} />{results.albums.length > 0 && <><div className="section-heading"><h2>Álbumes</h2></div><div className="album-grid album-grid-full">{results.albums.map((album) => <AlbumCard key={album.id} album={album} onOpen={openAlbum} onPlay={playAlbum} />)}</div></>}<div className="section-heading"><h2>Canciones</h2></div><SongList songs={results.songs} /></>;
}
