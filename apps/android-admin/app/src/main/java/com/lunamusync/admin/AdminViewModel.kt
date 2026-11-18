package com.lunamusync.admin

import android.app.Application
import android.net.Uri
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import org.json.JSONObject

class AdminViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SessionStore(application)
    private val api = LunaApi(store)

    var authenticated by mutableStateOf(store.connected); private set
    var tracks by mutableStateOf<List<Track>>(emptyList()); private set
    var selected by mutableStateOf<Set<String>>(emptySet()); private set
    var loading by mutableStateOf(false); private set
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf(""); private set
    var notice by mutableStateOf(""); private set
    var localCovers by mutableStateOf<List<LocalCover>>(emptyList()); private set
    var onlineCovers by mutableStateOf<List<OnlineCover>>(emptyList()); private set
    var lyricsResults by mutableStateOf<List<LyricsResult>>(emptyList()); private set
    var backups by mutableStateOf<List<Backup>>(emptyList()); private set
    var plan by mutableStateOf<OrganizationPlan?>(null); private set
    var artVersion by mutableStateOf(0L); private set

    val first: Track? get() = tracks.firstOrNull { it.id == selected.firstOrNull() }
    val serverUrl: String get() = store.serverUrl ?: ""
    fun image(path: String) = api.image(path)
    fun cookie() = api.cookie()

    init { if (authenticated) load() }

    fun connect(server: String, username: String, password: String) = launch {
        busy = true; error = ""
        try {
            api.connect(server, username, password)
            authenticated = true
            load()
        } catch (reason: Exception) { fail(reason) }
        finally { busy = false }
    }

    fun logout() {
        launch {
            runCatching { api.disconnect() }
            store.clear()
            authenticated = false
            tracks = emptyList()
            selected = emptySet()
        }
    }

    fun load(refresh: Boolean = false) = launch {
        if (!store.connected) { authenticated = false; return@launch }
        loading = true; error = ""
        try {
            tracks = api.tracks(refresh)
            backups = api.backups()
            selected = selected.filterTo(mutableSetOf()) { id -> tracks.any { it.id == id } }
            if (refresh) artVersion = System.currentTimeMillis()
        } catch (reason: Exception) { fail(reason) }
        finally { loading = false }
    }

    fun toggle(id: String) { selected = if (id in selected) selected - id else selected + id }
    fun selectOnly(id: String) { selected = setOf(id) }
    fun clearSelection() { selected = emptySet() }
    fun selectAll(ids: List<String>) { selected = if (selected.size == ids.size) emptySet() else ids.toSet() }
    fun dismissMessages() { error = ""; notice = "" }
    fun clearPlan() { plan = null }

    fun update(changes: JSONObject) = operation("Metadatos actualizados y reindexación solicitada.") { api.update(selected, changes) }
    fun assignAlbum(name: String, artist: String) = operation("Las canciones se asignaron a “$name”.") {
        api.update(selected, JSONObject().put("album", name).put("albumArtist", artist))
    }
    fun findLocal(scope: String) = launch {
        val track = first ?: return@launch
        busy = true; error = ""
        try { localCovers = api.localCovers(track.id, scope) }
        catch (reason: Exception) { fail(reason) }
        finally { busy = false }
    }
    fun findOnline() = launch {
        val track = first ?: return@launch
        busy = true; error = ""
        try { onlineCovers = api.onlineCovers(track) }
        catch (reason: Exception) { fail(reason) }
        finally { busy = false }
    }
    fun applyLocal(id: String) = operation("Carátula aplicada.") { api.applyCover(selected, "local", coverId = id) }
    fun applyOnline(id: String) = operation("Carátula original aplicada.") { api.applyCover(selected, "online", coverId = id) }
    fun uploadCover(uri: Uri) = operation("Carátula subida y aplicada.") {
        val bytes = getApplication<Application>().contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw ApiException("No se pudo leer la imagen seleccionada.", 400)
        if (bytes.size > 12 * 1024 * 1024) throw ApiException("La imagen supera el límite de 12 MB.", 413)
        api.applyCover(selected, "upload", data = Base64.encodeToString(bytes, Base64.NO_WRAP))
    }
    fun findLyrics() = launch {
        val track = first ?: return@launch
        busy = true; error = ""
        try {
            lyricsResults = api.searchLyrics(track)
            if (lyricsResults.isEmpty()) notice = "LRCLIB no encontró esta letra."
        } catch (reason: Exception) { fail(reason) }
        finally { busy = false }
    }
    fun saveLyrics(text: String) = operation("Letra guardada dentro del audio y como .lrc.") { api.lyrics(selected, text) }

    fun preview(folders: Boolean, metadata: Boolean, renumber: Boolean) = launch {
        val ids = selected.ifEmpty { tracks.mapTo(mutableSetOf()) { it.id } }
        busy = true; error = ""
        try { plan = api.preview(ids, folders, metadata, renumber) }
        catch (reason: Exception) { fail(reason) }
        finally { busy = false }
    }
    fun organize(folders: Boolean, metadata: Boolean, renumber: Boolean) = operation("Biblioteca organizada y reindexación solicitada.") {
        api.organize(selected.ifEmpty { tracks.mapTo(mutableSetOf()) { it.id } }, folders, metadata, renumber)
        plan = null
    }
    fun restore(id: String) = operation("Copia restaurada correctamente.") { api.restore(id) }
    fun sync() = operation("Reindexación iniciada.") { api.sync() }

    private fun operation(message: String, action: suspend () -> Unit) = launch {
        busy = true; error = ""; notice = ""
        try {
            action()
            selected = emptySet()
            load(true)
            notice = message
        } catch (reason: Exception) { fail(reason) }
        finally { busy = false }
    }

    private fun launch(action: suspend () -> Unit) = viewModelScope.launch { action() }
    private fun fail(reason: Exception) {
        error = reason.message ?: "No se pudo completar la operación."
        if (reason is ApiException && reason.status == 401) {
            store.clear()
            authenticated = false
        }
    }
}
