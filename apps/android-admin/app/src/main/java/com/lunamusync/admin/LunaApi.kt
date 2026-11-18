package com.lunamusync.admin

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder

class ApiException(message: String, val status: Int) : IOException(message)

class LunaApi(private val store: SessionStore) {
    suspend fun connect(server: String, username: String, password: String) {
        val url = normalizeServer(server)
        val response = request(url, "/api/session", "POST", JSONObject().put("username", username).put("password", password), authenticated = false)
        val cookie = response.second?.substringBefore(";")?.takeIf { it.startsWith("luna_session=") }
            ?: throw ApiException("El servidor no creó una sesión Luna válida.", 502)
        store.save(url, cookie)
    }

    suspend fun tracks(refresh: Boolean): List<Track> = request(path = "/api/admin/tracks${if (refresh) "?refresh=1" else ""}").first.trackList("tracks")
    suspend fun update(ids: Collection<String>, changes: JSONObject) = mutation("/api/admin/tracks/update", JSONObject().put("ids", idsJson(ids)).put("changes", changes))
    suspend fun localCovers(trackId: String, scope: String): List<LocalCover> {
        val root = request(path = "/api/admin/covers/local", method = "POST", body = JSONObject().put("trackId", trackId).put("scope", scope)).first
        val array = root.getJSONArray("covers")
        return List(array.length()) { val item = array.getJSONObject(it); LocalCover(item.getString("id"), item.getString("path")) }
    }
    suspend fun onlineCovers(track: Track): List<OnlineCover> {
        val body = JSONObject().put("artist", track.albumArtist.ifBlank { track.artist }).put("album", track.album)
        val root = request(path = "/api/admin/covers/search", method = "POST", body = body).first
        val array = root.getJSONArray("covers")
        return List(array.length()) { val item = array.getJSONObject(it); OnlineCover(item.getString("id"), item.getString("album"), item.getString("artist"), item.optString("date")) }
    }
    suspend fun applyCover(ids: Collection<String>, source: String, coverId: String? = null, data: String? = null) = mutation("/api/admin/covers/apply", JSONObject().put("ids", idsJson(ids)).put("source", source).put("coverId", coverId).put("data", data))
    suspend fun searchLyrics(track: Track): List<LyricsResult> {
        val body = JSONObject().put("title", track.title).put("artist", track.artist).put("album", track.album).put("duration", track.duration)
        val root = request(path = "/api/admin/lyrics/search", method = "POST", body = body).first
        val array = root.getJSONArray("lyrics")
        return List(array.length()) { val item = array.getJSONObject(it); LyricsResult(item.getLong("id"), item.optString("title"), item.optString("artist"), item.optInt("duration"), item.optional("plainLyrics"), item.optional("syncedLyrics")) }
    }
    suspend fun lyrics(ids: Collection<String>, lyrics: String) = mutation("/api/admin/lyrics/apply", JSONObject().put("ids", idsJson(ids)).put("lyrics", lyrics))
    suspend fun preview(ids: Collection<String>, folders: Boolean, metadata: Boolean, renumber: Boolean): OrganizationPlan {
        val root = request(path = "/api/admin/organize/preview", method = "POST", body = organizationBody(ids, folders, metadata, renumber)).first
        val changes = root.getJSONArray("changes")
        return OrganizationPlan(List(changes.length()) { val item = changes.getJSONObject(it); PlanChange(item.getJSONObject("track").track(), item.getString("destination"), item.getJSONObject("tags")) }, root.stringList("collisions"))
    }
    suspend fun organize(ids: Collection<String>, folders: Boolean, metadata: Boolean, renumber: Boolean) = mutation("/api/admin/organize/apply", organizationBody(ids, folders, metadata, renumber))
    suspend fun backups(): List<Backup> {
        val root = request(path = "/api/admin/backups").first
        val array = root.getJSONArray("backups")
        return List(array.length()) { val item = array.getJSONObject(it); Backup(item.getString("id"), item.getString("createdAt"), item.getString("kind"), item.getInt("files")) }
    }
    suspend fun restore(id: String) = mutation("/api/admin/backups/${encode(id)}/restore", null)
    suspend fun sync() = request(path = "/api/admin/sync", method = "POST", body = null).first
    suspend fun disconnect() = request(path = "/api/session", method = "DELETE", body = null)

    fun image(path: String) = "${store.serverUrl}$path"
    fun cookie() = store.cookie

    private suspend fun mutation(path: String, body: JSONObject?) = request(path = path, method = "POST", body = body).first

    private suspend fun request(path: String, method: String = "GET", body: JSONObject? = null): Pair<JSONObject, String?> {
        return request(store.serverUrl ?: throw ApiException("Configura primero tu servidor Luna.", 400), path, method, body, authenticated = true)
    }

    private suspend fun request(base: String, path: String, method: String, body: JSONObject?, authenticated: Boolean): Pair<JSONObject, String?> = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        val connection = URI("$base$path").toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = if (path.startsWith("/api/admin/tracks")) 120_000 else 30_000
            connection.setRequestProperty("Accept", "application/json")
            if (authenticated) connection.setRequestProperty("Cookie", store.cookie ?: "")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.bufferedWriter().use { it.write(body.toString()) }
            }
            val status = connection.responseCode
            val text = (if (status in 200..399) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { if (text.isBlank()) JSONObject() else JSONObject(text) }.getOrElse { throw ApiException("Luna devolvió una respuesta no válida.", 502) }
            if (status !in 200..299) throw ApiException(json.optString("error", "No se pudo conectar con Luna (HTTP $status)."), status)
            json to connection.getHeaderField("Set-Cookie")
        } catch (error: ApiException) {
            throw error
        } catch (error: Exception) {
            throw ApiException("No se pudo conectar con Luna. Revisa la dirección y que ambos dispositivos estén en la misma red.", 503)
        } finally {
            connection.disconnect()
        }
    }

    private fun normalizeServer(value: String): String {
        val url = URI(value.trim().removeSuffix("/")).toURL()
        if (url.protocol != "http" && url.protocol != "https") throw ApiException("La dirección debe empezar por http:// o https://", 400)
        return url.toString().removeSuffix("/")
    }

    private fun organizationBody(ids: Collection<String>, folders: Boolean, metadata: Boolean, renumber: Boolean) = JSONObject()
        .put("ids", idsJson(ids))
        .put("options", JSONObject().put("folders", folders).put("metadata", metadata).put("renumber", renumber))
}

private fun JSONObject.optional(name: String): String? = if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }
private fun encode(value: String) = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
