import { AlignLeft, CheckSquare, DatabaseBackup, FolderOpen, Globe2, History, Library, LoaderCircle, Music2, RefreshCw, RotateCcw, Save, Search, Square, Upload, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { api, formatDuration } from "../api";
import type { AdminTrack, Backup, LyricsResult, OnlineCover, OrganizationOptions, OrganizationPlan, TagChanges } from "../types";
import { MoonIcon } from "./MoonIcon";

interface AlbumGroup {
  key: string;
  name: string;
  artist: string;
  tracks: AdminTrack[];
}

const emptyTags = { title: "", artist: "", album: "", albumArtist: "", year: "", genre: "", track: "", trackTotal: "", disc: "", comment: "" };
const kindNames: Record<string, string> = { metadata: "Metadatos y carátulas", lyrics: "Letras", organization: "Organización" };

export function AdminPanel({ onLibraryChanged }: { onLibraryChanged: () => Promise<void> }) {
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [display, setDisplay] = useState<"albums" | "songs">("albums");
  const [section, setSection] = useState<"library" | "organize" | "backups">("library");
  const [tool, setTool] = useState<"tags" | "covers" | "lyrics">("tags");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [artVersion, setArtVersion] = useState(0);
  const [tags, setTags] = useState(emptyTags);
  const [localCovers, setLocalCovers] = useState<Array<{ id: string; path: string }>>([]);
  const [onlineCovers, setOnlineCovers] = useState<OnlineCover[]>([]);
  const [lyricsResults, setLyricsResults] = useState<LyricsResult[]>([]);
  const [lyricsText, setLyricsText] = useState("");
  const [options, setOptions] = useState<OrganizationOptions>({ folders: true, metadata: true, renumber: true });
  const [plan, setPlan] = useState<OrganizationPlan | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [sync, setSync] = useState<{ scanning: boolean; count?: number }>({ scanning: false });

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const [trackResult, backupResult, syncResult] = await Promise.all([api.admin.tracks(refresh), api.admin.backups(), api.admin.sync()]);
      setTracks(trackResult.tracks);
      setBackups(backupResult.backups);
      setSync(syncResult);
      setSelected((current) => new Set([...current].filter((id) => trackResult.tracks.some((track) => track.id === id))));
      if (refresh) setArtVersion(Date.now());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir el editor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search ? tracks.filter((track) => `${track.title} ${track.artist} ${track.album} ${track.path}`.toLocaleLowerCase().includes(search)) : tracks;
  }, [query, tracks]);
  const albums = useMemo(() => {
    const groups = new Map<string, AlbumGroup>();
    for (const track of filtered) {
      const key = `${track.albumArtist}\0${track.album}`;
      const group = groups.get(key) || { key, name: track.album, artist: track.albumArtist, tracks: [] };
      group.tracks.push(track);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [filtered]);
  const ids = [...selected];
  const first = tracks.find((track) => track.id === ids[0]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load(true);
      await onLibraryChanged();
      setNotice(message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la edición.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const dragStart = (event: DragEvent, track: AdminTrack) => {
    const dragged = selected.has(track.id) ? ids : [track.id];
    setSelected(new Set(dragged));
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-luna-tracks", JSON.stringify(dragged));
  };

  const dropOnAlbum = async (event: DragEvent, album: AlbumGroup) => {
    event.preventDefault();
    try {
      const dragged = JSON.parse(event.dataTransfer.getData("application/x-luna-tracks")) as string[];
      if (!Array.isArray(dragged) || dragged.length === 0 || dragged.length > 500) return;
      await run(() => api.admin.update(dragged, { album: album.name, albumArtist: album.artist }), `${dragged.length} canciones ahora pertenecen a “${album.name}”.`);
    } catch { setError("No se pudo leer la selección arrastrada."); }
  };

  const saveTags = async (event: FormEvent) => {
    event.preventDefault();
    const changes: TagChanges = {};
    for (const key of ["title", "artist", "album", "albumArtist", "genre", "comment"] as const) {
      if (tags[key].trim()) changes[key] = tags[key].trim();
    }
    for (const key of ["year", "track", "trackTotal", "disc"] as const) {
      if (tags[key]) changes[key] = Number(tags[key]);
    }
    if (!Object.keys(changes).length) { setError("Escribe al menos un campo para guardar cambios."); return; }
    await run(() => api.admin.update(ids, changes), `Metadatos actualizados en ${ids.length} canciones.`);
    setTags(emptyTags);
  };

  const applyCover = async (source: "local" | "online", coverId: string) => {
    await run(() => api.admin.applyCover(ids, source, coverId), `Carátula aplicada a ${ids.length} canciones.`);
  };

  const uploadCover = async (file?: File) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setError("La imagen supera el límite de 12 MB."); return; }
    const data = await fileToBase64(file);
    await run(() => api.admin.uploadCover(ids, data), `Carátula aplicada a ${ids.length} canciones.`);
  };

  const findLyrics = async () => {
    if (!first) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.admin.searchLyrics(first);
      setLyricsResults(result.lyrics);
      if (result.lyrics[0]) setLyricsText(result.lyrics[0].syncedLyrics || result.lyrics[0].plainLyrics || "");
      if (!result.lyrics.length) setNotice("LRCLIB no encontró una letra para esta canción.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron buscar letras."); }
    finally { setBusy(false); }
  };

  const organizationIds = selected.size ? ids : tracks.map((track) => track.id);
  const previewOrganization = async () => {
    setBusy(true);
    setError("");
    try { setPlan(await api.admin.organizePreview(organizationIds, options)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo preparar la vista previa."); }
    finally { setBusy(false); }
  };

  const restore = async (backup: Backup) => {
    if (!window.confirm(`¿Restaurar esta copia? Se recuperará el contenido anterior de ${backup.files} archivos.`)) return;
    await run(() => api.admin.restore(backup.id), "La copia se restauró correctamente.");
  };

  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div><p className="eyebrow">CONTROL DE TU COLECCIÓN</p><h1>Editor de biblioteca</h1><p>Edita, organiza y recupera tu música sin salir de Luna.</p></div>
        <button className="button button-glass" disabled={loading || busy} onClick={() => void load(true)}><RefreshCw size={17} className={loading ? "spin" : ""} />Actualizar</button>
      </div>
      <div className="admin-warning"><DatabaseBackup size={18} /><span>Cada cambio crea un respaldo propio. Solo se modifican los archivos cuando confirmas una acción.</span></div>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
      {notice && <div className="admin-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")}><X size={16} /></button></div>}
      <div className="admin-tabs" role="tablist">
        <button className={section === "library" ? "active" : ""} onClick={() => setSection("library")}><Library size={17} />Biblioteca</button>
        <button className={section === "organize" ? "active" : ""} onClick={() => setSection("organize")}><WandSparkles size={17} />Organización automática</button>
        <button className={section === "backups" ? "active" : ""} onClick={() => setSection("backups")}><History size={17} />Respaldos <span>{backups.length}</span></button>
      </div>

      {loading && tracks.length === 0 ? <div className="admin-loading"><LoaderCircle className="spin" size={28} /><span>Leyendo los metadatos de tu biblioteca…</span></div> : section === "library" ? (
        <div className="admin-workspace">
          <div className="admin-browser">
            <div className="admin-browser-tools">
              <label className="admin-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en los archivos" /></label>
              <div className="admin-display"><button className={display === "albums" ? "active" : ""} onClick={() => setDisplay("albums")}>Álbumes</button><button className={display === "songs" ? "active" : ""} onClick={() => setDisplay("songs")}>Canciones</button></div>
            </div>
            <div className="admin-selection-bar">
              <button onClick={() => setSelected(selected.size === filtered.length && filtered.length ? new Set() : new Set(filtered.map((track) => track.id)))}>
                {selected.size === filtered.length && filtered.length ? <CheckSquare size={17} /> : <Square size={17} />}{selected.size ? `${selected.size} seleccionadas` : "Seleccionar visibles"}
              </button>
              <span>{filtered.length} canciones · {albums.length} álbumes</span>
            </div>
            {display === "albums" ? <div className="admin-albums">{albums.map((album) => (
              <article className="admin-album" key={album.key} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => void dropOnAlbum(event, album)}>
                <div className="admin-album-heading"><AdminArt track={album.tracks[0]} version={artVersion} /><div><strong>{album.name}</strong><span>{album.artist}</span><small>{album.tracks.length} canciones · arrastra aquí para agrupar</small></div></div>
                <div className="admin-track-list">{album.tracks.map((track) => <TrackRow key={track.id} track={track} selected={selected.has(track.id)} onToggle={() => toggle(track.id)} onDrag={(event) => dragStart(event, track)} />)}</div>
              </article>
            ))}</div> : <div className="admin-track-list admin-all-tracks">{filtered.map((track) => <TrackRow key={track.id} track={track} selected={selected.has(track.id)} onToggle={() => toggle(track.id)} onDrag={(event) => dragStart(event, track)} showAlbum />)}</div>}
            {!filtered.length && <div className="empty-state"><Music2 size={36} /><h3>No hay canciones aquí</h3><p>Prueba otra búsqueda o actualiza la biblioteca.</p></div>}
          </div>

          <aside className="admin-inspector">
            <div className="admin-inspector-heading"><div><p className="eyebrow">EDICIÓN</p><h2>{selected.size ? `${selected.size} ${selected.size === 1 ? "canción" : "canciones"}` : "Selecciona música"}</h2></div>{selected.size > 0 && <button className="icon-button" onClick={() => setSelected(new Set())} aria-label="Quitar selección"><X size={18} /></button>}</div>
            {first && <div className="admin-current"><AdminArt track={first} version={artVersion} /><div><strong>{first.title}</strong><span>{first.artist} · {first.album}</span><small>{first.path}</small></div></div>}
            <div className="admin-tools"><button className={tool === "tags" ? "active" : ""} onClick={() => setTool("tags")}>Metadatos</button><button className={tool === "covers" ? "active" : ""} onClick={() => setTool("covers")}>Carátulas</button><button className={tool === "lyrics" ? "active" : ""} onClick={() => setTool("lyrics")}>Letras</button></div>
            {!selected.size ? <div className="admin-inspector-empty"><CheckSquare size={30} /><p>Selecciona una o varias canciones. Los campos vacíos no cambiarán.</p></div> : tool === "tags" ? (
              <form className="admin-tag-form" onSubmit={(event) => void saveTags(event)}>
                <TagInput label="Título" value={tags.title} onChange={(value) => setTags({ ...tags, title: value })} placeholder={selected.size > 1 ? "No disponible en edición masiva" : first?.title} disabled={selected.size > 1} />
                <TagInput label="Artista" value={tags.artist} onChange={(value) => setTags({ ...tags, artist: value })} placeholder="Sin cambios" />
                <TagInput label="Álbum" value={tags.album} onChange={(value) => setTags({ ...tags, album: value })} placeholder="Sin cambios" />
                <TagInput label="Artista del álbum" value={tags.albumArtist} onChange={(value) => setTags({ ...tags, albumArtist: value })} placeholder="Sin cambios" />
                <div className="admin-field-row"><TagInput label="Año" type="number" value={tags.year} onChange={(value) => setTags({ ...tags, year: value })} /><TagInput label="Género" value={tags.genre} onChange={(value) => setTags({ ...tags, genre: value })} /></div>
                <div className="admin-field-row admin-field-three"><TagInput label="Pista" type="number" value={tags.track} onChange={(value) => setTags({ ...tags, track: value })} /><TagInput label="Total" type="number" value={tags.trackTotal} onChange={(value) => setTags({ ...tags, trackTotal: value })} /><TagInput label="Disco" type="number" value={tags.disc} onChange={(value) => setTags({ ...tags, disc: value })} /></div>
                <label>Comentario<textarea value={tags.comment} onChange={(event) => setTags({ ...tags, comment: event.target.value })} placeholder="Sin cambios" /></label>
                <button className="button button-primary button-full" disabled={busy}><Save size={17} />{busy ? "Guardando…" : "Guardar metadatos"}</button>
              </form>
            ) : tool === "covers" ? (
              <div className="admin-enrichment">
                <label className="admin-upload button button-glass"><Upload size={17} />Subir JPEG o PNG<input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(event) => { void uploadCover(event.target.files?.[0]); event.target.value = ""; }} /></label>
                <div className="admin-tool-section"><h3><FolderOpen size={17} />Buscar en carpetas</h3><p>Imágenes de la carpeta del álbum o de cualquier biblioteca conectada.</p><div className="admin-inline-buttons"><button disabled={busy || !first} onClick={() => void findLocal(first!, "folder", setBusy, setError, setLocalCovers)}>Carpeta actual</button><button disabled={busy || !first} onClick={() => void findLocal(first!, "library", setBusy, setError, setLocalCovers)}>Toda la biblioteca</button></div><div className="admin-cover-grid">{localCovers.map((cover) => <button key={cover.id} disabled={busy} onClick={() => void applyCover("local", cover.id)} title={cover.path}><img src={`/api/admin/local-cover/${cover.id}`} alt={cover.path} /></button>)}</div></div>
                <div className="admin-tool-section"><h3><Globe2 size={17} />Buscar en Internet</h3><p>MusicBrainz y Cover Art Archive. La búsqueda usa el artista y álbum de la primera canción.</p><button className="button button-glass button-full" disabled={busy || !first} onClick={() => void findOnline(first!, setBusy, setError, setOnlineCovers)}>Buscar carátula original</button><div className="admin-cover-results">{onlineCovers.map((cover) => <button key={cover.id} disabled={busy} onClick={() => void applyCover("online", cover.id)}><img src={`/api/admin/online-cover/${cover.id}`} alt={cover.album} /><span><strong>{cover.album}</strong><small>{cover.artist}{cover.date ? ` · ${cover.date}` : ""}</small></span></button>)}</div></div>
              </div>
            ) : (
              <div className="admin-enrichment"><div className="admin-tool-section"><h3><AlignLeft size={17} />Letras sincronizadas o simples</h3><p>LRCLIB busca por los datos de la primera canción. Se guardan dentro del audio y como archivo .lrc compatible.</p><button className="button button-glass button-full" disabled={busy || !first} onClick={() => void findLyrics()}>Buscar en LRCLIB</button><div className="admin-lyrics-results">{lyricsResults.map((result) => <button key={result.id} onClick={() => setLyricsText(result.syncedLyrics || result.plainLyrics || "")}><strong>{result.title}</strong><span>{result.artist} · {formatDuration(result.duration)}</span><small>{result.syncedLyrics ? "Sincronizada" : result.plainLyrics ? "Texto simple" : "Instrumental"}</small></button>)}</div><label className="admin-lyrics-editor">Revisa o escribe la letra<textarea value={lyricsText} onChange={(event) => setLyricsText(event.target.value)} placeholder="[00:01.00] Primera línea…" /></label><button className="button button-primary button-full" disabled={busy || !lyricsText.trim()} onClick={() => void run(() => api.admin.applyLyrics(ids, lyricsText), `Letra guardada en ${ids.length} canciones.`)}><Save size={17} />Guardar letra en la selección</button></div></div>
            )}
          </aside>
        </div>
      ) : section === "organize" ? (
        <div className="admin-organize">
          <div className="admin-organize-options"><p className="eyebrow">VISTA PREVIA OBLIGATORIA</p><h2>Orden algorítmico, bajo tu control</h2><p>Luna infiere datos desde etiquetas, nombres y carpetas. Después puedes revisar cada cambio antes de aplicarlo.</p>
            <div className="admin-pattern"><span>Biblioteca</span><b>/</b><span>Artista</span><b>/</b><span>Álbum</span><b>/</b><span>NN - Título.ext</span></div>
            <label><input type="checkbox" checked={options.folders} onChange={(event) => { setOptions({ ...options, folders: event.target.checked }); setPlan(null); }} /><span><strong>Ordenar carpetas</strong><small>Mover los archivos a la estructura mostrada.</small></span></label>
            <label><input type="checkbox" checked={options.metadata} onChange={(event) => { setOptions({ ...options, metadata: event.target.checked }); setPlan(null); }} /><span><strong>Completar metadatos</strong><small>Inferir título, artista y álbum cuando falten.</small></span></label>
            <label><input type="checkbox" checked={options.renumber} onChange={(event) => { setOptions({ ...options, renumber: event.target.checked }); setPlan(null); }} /><span><strong>Numerar pistas</strong><small>Conservar números existentes o inferirlos del nombre.</small></span></label>
            <p className="admin-organize-scope">Se organizarán <strong>{organizationIds.length} canciones</strong>: {selected.size ? "tu selección actual" : "toda la biblioteca, porque no hay selección"}.</p>
            <button className="button button-primary" disabled={busy || !organizationIds.length} onClick={() => void previewOrganization()}><WandSparkles size={17} />Generar vista previa</button>
          </div>
          <div className="admin-plan">{!plan ? <div className="admin-inspector-empty"><WandSparkles size={35} /><p>Aquí verás las rutas y etiquetas propuestas. Nada se moverá todavía.</p></div> : <><div className="admin-plan-heading"><h2>{plan.changes.length} cambios propuestos</h2><span>{plan.collisions.length ? `${plan.collisions.length} colisiones` : "Sin colisiones"}</span></div>{plan.collisions.length > 0 && <div className="error-banner">Hay destinos duplicados o archivos existentes. Luna no sobrescribirá nada; edita esos metadatos y vuelve a generar la vista previa.</div>}<div className="admin-plan-list">{plan.changes.map((change) => <div key={change.track.id}><strong>{change.track.title}</strong><span>{change.track.path}</span><b>→</b><span>{change.destination}</span></div>)}</div><button className="button button-primary" disabled={busy || plan.collisions.length > 0} onClick={() => { if (window.confirm(`¿Aplicar la organización a ${organizationIds.length} canciones? Se creará un respaldo restaurable.`)) void run(() => api.admin.organizeApply(organizationIds, options), "Biblioteca organizada y reindexación solicitada.").then(() => setPlan(null)); }}><CheckSquare size={17} />Aplicar organización</button></>}</div>
        </div>
      ) : (
        <div className="admin-backups"><div className="admin-backups-heading"><div><h2>Respaldos de edición</h2><p>Restaura el contenido y la ubicación de los archivos incluidos en una operación.</p></div><div className="admin-sync"><span className={sync.scanning ? "scanning" : ""}>{sync.scanning ? "Indexando biblioteca" : `Índice al día${sync.count ? ` · ${sync.count} pistas` : ""}`}</span><button className="button button-glass" disabled={busy || sync.scanning} onClick={() => void api.admin.startSync().then(() => setSync({ scanning: true })).catch((reason) => setError(reason.message))}><RefreshCw size={16} />Reindexar</button></div></div>{backups.map((backup) => <article key={backup.id}><span className="admin-backup-icon"><History size={20} /></span><div><strong>{kindNames[backup.kind] || backup.kind}</strong><span>{new Date(backup.createdAt).toLocaleString()} · {backup.files} archivos</span><small>{backup.id}</small></div><button className="button button-glass" disabled={busy} onClick={() => void restore(backup)}><RotateCcw size={16} />Restaurar</button></article>)}{!backups.length && <div className="empty-state"><History size={38} /><h3>Todavía no hay respaldos</h3><p>Aparecerán automáticamente con tu primera edición.</p></div>}</div>
      )}
    </section>
  );
}

function TrackRow({ track, selected, onToggle, onDrag, showAlbum = false }: { track: AdminTrack; selected: boolean; onToggle: () => void; onDrag: (event: DragEvent) => void; showAlbum?: boolean }) {
  return <div className={`admin-track${selected ? " selected" : ""}`} draggable onDragStart={onDrag}><button className="admin-check" onClick={onToggle} aria-label={`${selected ? "Quitar" : "Seleccionar"} ${track.title}`}>{selected ? <CheckSquare size={17} /> : <Square size={17} />}</button><span className="admin-track-number">{track.track || "—"}</span><div><strong>{track.title}</strong><span>{track.artist}{showAlbum ? ` · ${track.album}` : ""}</span></div><span className="admin-track-flags">{track.hasLyrics && <span title="Tiene letra"><AlignLeft size={13} /></span>}<i>{track.suffix}</i></span><span className="admin-track-duration">{formatDuration(track.duration)}</span></div>;
}

function AdminArt({ track, version }: { track?: AdminTrack; version: number }) {
  const [failed, setFailed] = useState(false);
  if (!track || failed) return <div className="admin-art admin-art-empty"><MoonIcon size={28} /></div>;
  return <img className="admin-art" src={`/api/admin/tracks/${track.id}/cover?v=${version}`} alt="" onError={() => setFailed(true)} />;
}

function TagInput({ label, value, onChange, placeholder = "", type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: "text" | "number"; disabled?: boolean }) {
  return <label>{label}<input type={type} min={type === "number" ? 0 : undefined} value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

async function findLocal(track: AdminTrack, scope: "folder" | "library", setBusy: (busy: boolean) => void, setError: (error: string) => void, setCovers: (covers: Array<{ id: string; path: string }>) => void) {
  setBusy(true); setError("");
  try { setCovers((await api.admin.localCovers(track.id, scope)).covers); }
  catch (reason) { setError(reason instanceof Error ? reason.message : "No se encontraron carátulas locales."); }
  finally { setBusy(false); }
}

async function findOnline(track: AdminTrack, setBusy: (busy: boolean) => void, setError: (error: string) => void, setCovers: (covers: OnlineCover[]) => void) {
  setBusy(true); setError("");
  try { setCovers((await api.admin.searchCovers(track.albumArtist || track.artist, track.album)).covers); }
  catch (reason) { setError(reason instanceof Error ? reason.message : "No se encontraron carátulas en Internet."); }
  finally { setBusy(false); }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}
