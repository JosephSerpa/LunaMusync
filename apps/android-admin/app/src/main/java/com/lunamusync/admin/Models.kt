package com.lunamusync.admin

import org.json.JSONObject

data class Track(
    val id: String,
    val path: String,
    val title: String,
    val artist: String,
    val album: String,
    val albumArtist: String,
    val year: Int?,
    val genre: String,
    val track: Int?,
    val duration: Int,
    val suffix: String,
    val hasCover: Boolean,
    val hasLyrics: Boolean,
)

data class OnlineCover(val id: String, val album: String, val artist: String, val date: String)
data class LocalCover(val id: String, val path: String)
data class LyricsResult(
    val id: Long,
    val title: String,
    val artist: String,
    val duration: Int,
    val plain: String?,
    val synced: String?,
)
data class Backup(val id: String, val createdAt: String, val kind: String, val files: Int)
data class PlanChange(val track: Track, val destination: String, val tags: JSONObject)
data class OrganizationPlan(val changes: List<PlanChange>, val collisions: List<String>)

fun JSONObject.track() = Track(
    id = getString("id"),
    path = getString("path"),
    title = getString("title"),
    artist = getString("artist"),
    album = getString("album"),
    albumArtist = getString("albumArtist"),
    year = if (has("year")) getInt("year") else null,
    genre = optString("genre"),
    track = if (has("track")) getInt("track") else null,
    duration = optInt("duration"),
    suffix = optString("suffix"),
    hasCover = optBoolean("hasCover"),
    hasLyrics = optBoolean("hasLyrics"),
)

fun JSONObject.trackList(name: String): List<Track> {
    val array = optJSONArray(name) ?: return emptyList()
    return List(array.length()) { array.getJSONObject(it).track() }
}

fun JSONObject.stringList(name: String): List<String> {
    val array = optJSONArray(name) ?: return emptyList()
    return List(array.length()) { array.getString(it) }
}

fun idsJson(ids: Collection<String>) = org.json.JSONArray(ids.toList())
