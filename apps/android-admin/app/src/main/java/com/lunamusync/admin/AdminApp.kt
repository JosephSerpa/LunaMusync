package com.lunamusync.admin

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import org.json.JSONObject

@Composable
fun LoginScreen(model: AdminViewModel) {
    var server by rememberSaveable { mutableStateOf(model.serverUrl.ifBlank { "http://" }) }
    var username by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState()).padding(horizontal = 25.dp, vertical = 45.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Moon(Modifier.size(40.dp))
            Text("luna", style = MaterialTheme.typography.headlineLarge)
            Text("  ADMIN", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
        }
        Spacer(Modifier.height(45.dp))
        Text("Tu biblioteca,\nen tus manos.", style = MaterialTheme.typography.displayLarge)
        Text("Conéctate a tu servidor Luna para administrar tu música desde cualquier lugar de tu red.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 15.dp, bottom = 30.dp))
        Field(server, { server = it }, "Dirección Luna", "http://192.168.1.10:1832")
        Spacer(Modifier.height(12.dp))
        Field(username, { username = it }, "Usuario administrador")
        Spacer(Modifier.height(12.dp))
        Field(password, { password = it }, "Contraseña", keyboard = KeyboardType.Password, password = true)
        if (model.error.isNotBlank()) ErrorText(model.error)
        Button(
            onClick = { model.connect(server, username, password) },
            enabled = !model.busy && server.isNotBlank() && username.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth().padding(top = 20.dp).height(52.dp),
            shape = CircleShape,
        ) { if (model.busy) CircularProgressIndicator(Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary) else Text("Conectar con Luna") }
        Text("Usa la dirección local del equipo donde instalaste Luna. Para acceder desde Internet utiliza HTTPS.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 16.dp))
    }
}

@Composable
fun AdminScreen(model: AdminViewModel) {
    var section by rememberSaveable { mutableStateOf(0) }
    var editor by rememberSaveable { mutableStateOf(false) }
    var albumPicker by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    val filtered = model.tracks.filter { "$it".contains(query, true) || "${it.title} ${it.artist} ${it.album} ${it.path}".contains(query, true) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = Color(0xFF09090C)) {
                NavigationBarItem(section == 0, { section = 0 }, { Icon(Icons.Outlined.LibraryMusic, null) }, label = { Text("Biblioteca") })
                NavigationBarItem(section == 1, { section = 1 }, { Icon(Icons.Outlined.AutoAwesome, null) }, label = { Text("Organizar") })
                NavigationBarItem(section == 2, { section = 2 }, { Icon(Icons.Outlined.History, null) }, label = { Text("Respaldos") })
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (section) {
                0 -> LibraryScreen(model, filtered, query, { query = it }, { editor = true }, { albumPicker = true })
                1 -> OrganizeScreen(model)
                else -> BackupsScreen(model)
            }
            if (model.loading || model.busy) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
            if (model.error.isNotBlank() || model.notice.isNotBlank()) {
                Snackbar(
                    modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
                    action = { TextButton(onClick = model::dismissMessages) { Text("Cerrar") } },
                    containerColor = if (model.error.isNotBlank()) Color(0xFF48252B) else Color(0xFF183B2B),
                ) { Text(model.error.ifBlank { model.notice }) }
            }
        }
    }
    if (editor && model.selected.isNotEmpty()) EditorDialog(model, { editor = false })
    if (albumPicker) AlbumPicker(model) { albumPicker = false }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LibraryScreen(model: AdminViewModel, filtered: List<Track>, query: String, onQuery: (String) -> Unit, onEdit: () -> Unit, onAlbum: () -> Unit) {
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 35.dp, bottom = 30.dp)) {
        item { Header("ADMINISTRACIÓN", "Tu biblioteca", model::logout) }
        item {
            OutlinedTextField(query, onQuery, modifier = Modifier.fillMaxWidth().padding(top = 20.dp), placeholder = { Text("Buscar canciones o álbumes") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(15.dp))
            Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { model.selectAll(filtered.map { it.id }) }) { Icon(Icons.Outlined.CheckBox, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(if (model.selected.isEmpty()) "Seleccionar" else "${model.selected.size} elegidas") }
                Spacer(Modifier.weight(1f))
                Text("${filtered.size} pistas", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
            }
            if (model.selected.isNotEmpty()) Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onEdit, modifier = Modifier.weight(1f)) { Icon(Icons.Outlined.Edit, null, Modifier.size(17.dp)); Spacer(Modifier.width(5.dp)); Text("Editar") }
                OutlinedButton(onClick = onAlbum, modifier = Modifier.weight(1f)) { Text("Asignar a álbum") }
                IconButton(onClick = model::clearSelection) { Icon(Icons.Outlined.Close, "Quitar selección") }
            }
        }
        items(filtered, key = { it.id }) { track ->
            val chosen = track.id in model.selected
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (chosen) Color(0x19FFFFFF) else Color.Transparent).combinedClickable(
                    onClick = { if (model.selected.isEmpty()) { model.selectOnly(track.id); onEdit() } else model.toggle(track.id) },
                    onLongClick = { model.toggle(track.id) },
                ).padding(vertical = 9.dp, horizontal = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TrackArt(model, track, 52)
                Column(Modifier.weight(1f).padding(horizontal = 11.dp)) {
                    Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium)
                    Text("${track.artist} · ${track.album}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${track.suffix}  ${formatDuration(track.duration)}${if (track.hasLyrics) "  ·  letra" else ""}", color = Color(0x70FFFFFF), style = MaterialTheme.typography.labelSmall)
                }
                Icon(if (chosen) Icons.Outlined.CheckBox else Icons.Outlined.MoreVert, null, tint = if (chosen) Color.White else Color(0x60FFFFFF))
            }
        }
        if (filtered.isEmpty() && !model.loading) item { EmptyState("No hay canciones", "Prueba otra búsqueda o actualiza la biblioteca.") }
        item { TextButton(onClick = { model.load(true) }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Refresh, null); Spacer(Modifier.width(8.dp)); Text("Volver a leer la biblioteca") } }
    }
}

@Composable
private fun EditorDialog(model: AdminViewModel, onClose: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(0) }
    Dialog(onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column {
                Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 35.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text("EDITAR ${model.selected.size} PISTAS", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(model.first?.title ?: "Selección múltiple", style = MaterialTheme.typography.headlineMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, "Cerrar") }
                }
                TabRow(selectedTabIndex = tab, containerColor = Color.Transparent) {
                    Tab(tab == 0, { tab = 0 }, text = { Text("Metadatos") })
                    Tab(tab == 1, { tab = 1 }, text = { Text("Carátulas") })
                    Tab(tab == 2, { tab = 2 }, text = { Text("Letras") })
                }
                when (tab) {
                    0 -> MetadataEditor(model)
                    1 -> CoverEditor(model)
                    else -> LyricsEditor(model)
                }
            }
        }
    }
}

@Composable
private fun MetadataEditor(model: AdminViewModel) {
    var title by rememberSaveable { mutableStateOf("") }
    var artist by rememberSaveable { mutableStateOf("") }
    var album by rememberSaveable { mutableStateOf("") }
    var albumArtist by rememberSaveable { mutableStateOf("") }
    var year by rememberSaveable { mutableStateOf("") }
    var genre by rememberSaveable { mutableStateOf("") }
    var track by rememberSaveable { mutableStateOf("") }
    var total by rememberSaveable { mutableStateOf("") }
    var disc by rememberSaveable { mutableStateOf("") }
    var comment by rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
        Text("Los campos vacíos conservan su valor actual.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        Field(title, { title = it }, "Título", enabled = model.selected.size == 1)
        Field(artist, { artist = it }, "Artista")
        Field(album, { album = it }, "Álbum")
        Field(albumArtist, { albumArtist = it }, "Artista del álbum")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Box(Modifier.weight(1f)) { Field(year, { year = it }, "Año", keyboard = KeyboardType.Number) }; Box(Modifier.weight(1f)) { Field(genre, { genre = it }, "Género") } }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Box(Modifier.weight(1f)) { Field(track, { track = it }, "Pista", keyboard = KeyboardType.Number) }; Box(Modifier.weight(1f)) { Field(total, { total = it }, "Total", keyboard = KeyboardType.Number) }; Box(Modifier.weight(1f)) { Field(disc, { disc = it }, "Disco", keyboard = KeyboardType.Number) } }
        Field(comment, { comment = it }, "Comentario", singleLine = false)
        Button(onClick = {
            val changes = JSONObject()
            mapOf("title" to title, "artist" to artist, "album" to album, "albumArtist" to albumArtist, "genre" to genre, "comment" to comment).forEach { (key, value) -> if (value.isNotBlank()) changes.put(key, value.trim()) }
            mapOf("year" to year, "track" to track, "trackTotal" to total, "disc" to disc).forEach { (key, value) -> value.toIntOrNull()?.let { changes.put(key, it) } }
            model.update(changes)
        }, enabled = !model.busy, modifier = Modifier.fillMaxWidth().height(50.dp)) { Icon(Icons.Outlined.Save, null); Spacer(Modifier.width(8.dp)); Text("Guardar metadatos") }
    }
}

@Composable
private fun CoverEditor(model: AdminViewModel) {
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { it?.let(model::uploadCover) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Button(onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Upload, null); Spacer(Modifier.width(8.dp)); Text("Subir JPEG o PNG") }
        SectionTitle("Carátulas en tus carpetas", "Busca junto a la canción o en todas las bibliotecas conectadas.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { model.findLocal("folder") }, modifier = Modifier.weight(1f)) { Text("Carpeta actual") }
            OutlinedButton(onClick = { model.findLocal("library") }, modifier = Modifier.weight(1f)) { Text("Toda la biblioteca") }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(9.dp), modifier = Modifier.padding(top = 12.dp)) {
            items(model.localCovers, key = { it.id }) { cover -> AsyncCover(model, "/api/admin/local-cover/${cover.id}", cover.path, Modifier.size(105.dp).clip(RoundedCornerShape(12.dp)).combinedClickable(onClick = { model.applyLocal(cover.id) })) }
        }
        SectionTitle("Buscar la carátula original", "Resultados de MusicBrainz y Cover Art Archive según la primera canción seleccionada.")
        OutlinedButton(onClick = { model.findOnline() }, enabled = !model.busy, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.TravelExplore, null); Spacer(Modifier.width(8.dp)); Text("Buscar en Internet") }
        model.onlineCovers.forEach { cover ->
            Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                AsyncCover(model, "/api/admin/online-cover/${cover.id}", cover.album, Modifier.size(62.dp).clip(RoundedCornerShape(10.dp)))
                Column(Modifier.weight(1f).padding(horizontal = 10.dp)) { Text(cover.album, maxLines = 1, overflow = TextOverflow.Ellipsis); Text("${cover.artist} ${cover.date}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, maxLines = 1) }
                TextButton(onClick = { model.applyOnline(cover.id) }) { Text("Aplicar") }
            }
        }
    }
}

@Composable
private fun LyricsEditor(model: AdminViewModel) {
    var text by rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        SectionTitle("Letras para LunaPlayer", "Se guardan embebidas y en un archivo .lrc junto a cada canción.")
        Button(onClick = { model.findLyrics() }, enabled = !model.busy, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Search, null); Spacer(Modifier.width(8.dp)); Text("Buscar en LRCLIB") }
        model.lyricsResults.forEach { result ->
            OutlinedButton(onClick = { text = result.synced ?: result.plain ?: "" }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.fillMaxWidth()) { Text("${result.title} · ${result.artist}"); Text(if (result.synced != null) "Sincronizada · ${formatDuration(result.duration)}" else "Texto simple", style = MaterialTheme.typography.labelMedium) }
            }
        }
        OutlinedTextField(text, { text = it }, modifier = Modifier.fillMaxWidth().height(260.dp).padding(vertical = 14.dp), label = { Text("Revisar o escribir letra") }, placeholder = { Text("[00:01.00] Primera línea…") })
        Button(onClick = { model.saveLyrics(text) }, enabled = text.isNotBlank() && !model.busy, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Save, null); Spacer(Modifier.width(8.dp)); Text("Guardar en la selección") }
    }
}

@Composable
private fun AlbumPicker(model: AdminViewModel, onClose: () -> Unit) {
    val albums = model.tracks.groupBy { it.albumArtist to it.album }.toList().sortedBy { it.first.second }
    AlertDialog(onDismissRequest = onClose, confirmButton = {}, dismissButton = { TextButton(onClick = onClose) { Text("Cancelar") } }, title = { Text("Asignar a un álbum") }, text = {
        LazyColumn(Modifier.heightIn(max = 420.dp)) {
            items(albums, key = { "${it.first.first}-${it.first.second}" }) { (key, tracks) ->
                TextButton(onClick = { model.assignAlbum(key.second, key.first); onClose() }, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth()) { Text(key.second, fontWeight = FontWeight.SemiBold); Text("${key.first} · ${tracks.size} pistas", style = MaterialTheme.typography.labelMedium) }
                }
            }
        }
    })
}

@Composable
private fun OrganizeScreen(model: AdminViewModel) {
    var folders by rememberSaveable { mutableStateOf(true) }
    var metadata by rememberSaveable { mutableStateOf(true) }
    var renumber by rememberSaveable { mutableStateOf(true) }
    var confirm by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Spacer(Modifier.height(35.dp)); Text("ORGANIZACIÓN AUTOMÁTICA", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Orden con vista previa", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 8.dp, bottom = 12.dp))
        Text("Biblioteca / Artista / Álbum / NN - Título.ext", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
        SwitchRow("Ordenar carpetas", folders) { folders = it; model.clearPlan() }
        SwitchRow("Completar metadatos", metadata) { metadata = it; model.clearPlan() }
        SwitchRow("Numerar pistas", renumber) { renumber = it; model.clearPlan() }
        Text("Se revisarán ${model.selected.size.ifEmpty { model.tracks.size }} canciones. Nada cambia hasta que confirmes.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 10.dp))
        Button(onClick = { model.preview(folders, metadata, renumber) }, enabled = !model.busy && model.tracks.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.AutoAwesome, null); Spacer(Modifier.width(8.dp)); Text("Generar vista previa") }
        model.plan?.let { plan ->
            if (plan.collisions.isNotEmpty()) ErrorText("Hay ${plan.collisions.size} colisiones. Luna no sobrescribirá ningún archivo.")
            LazyColumn(Modifier.weight(1f).padding(top = 10.dp)) {
                items(plan.changes, key = { it.track.id }) { change ->
                    Column(Modifier.fillMaxWidth().padding(vertical = 9.dp)) { Text(change.track.title, fontWeight = FontWeight.SemiBold); Text(change.track.path, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis); Text("→ ${change.destination}", style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                    HorizontalDivider(color = Color(0x16FFFFFF))
                }
            }
            Button(onClick = { confirm = true }, enabled = plan.collisions.isEmpty() && !model.busy, modifier = Modifier.fillMaxWidth().padding(bottom = 15.dp)) { Text("Aplicar ${plan.changes.size} cambios") }
        }
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, confirmButton = { TextButton(onClick = { confirm = false; model.organize(folders, metadata, renumber) }) { Text("Aplicar con respaldo") } }, dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancelar") } }, title = { Text("¿Organizar la biblioteca?") }, text = { Text("Se editarán etiquetas y rutas según la vista previa. Podrás deshacerlo desde Respaldos.") })
}

@Composable
private fun BackupsScreen(model: AdminViewModel) {
    var restore by remember { mutableStateOf<Backup?>(null) }
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Spacer(Modifier.height(35.dp)); Text("SEGURIDAD", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Respaldos", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 8.dp))
        OutlinedButton(onClick = { model.sync() }, enabled = !model.busy, modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp)) { Icon(Icons.Outlined.Sync, null); Spacer(Modifier.width(8.dp)); Text("Reindexar biblioteca") }
        LazyColumn {
            items(model.backups, key = { it.id }) { backup ->
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.History, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(backup.kind.replaceFirstChar { it.uppercase() }); Text("${backup.files} archivos · ${backup.createdAt.take(16).replace("T", " ")}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    TextButton(onClick = { restore = backup }) { Text("Restaurar") }
                }
                HorizontalDivider(color = Color(0x16FFFFFF))
            }
            if (model.backups.isEmpty() && !model.loading) item { EmptyState("Aún no hay respaldos", "Se crearán automáticamente con tu primera edición.") }
        }
    }
    restore?.let { backup -> AlertDialog(onDismissRequest = { restore = null }, confirmButton = { TextButton(onClick = { model.restore(backup.id); restore = null }) { Text("Restaurar archivos") } }, dismissButton = { TextButton(onClick = { restore = null }) { Text("Cancelar") } }, title = { Text("¿Restaurar esta copia?") }, text = { Text("Se recuperará el contenido y la ubicación anterior de ${backup.files} archivos.") }) }
}

@Composable
private fun Header(caption: String, title: String, onLogout: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) { Moon(Modifier.size(35.dp)); Text("luna", style = MaterialTheme.typography.headlineMedium); Spacer(Modifier.weight(1f)); IconButton(onClick = onLogout) { Icon(Icons.Outlined.Logout, "Desconectar") } }
    Text(caption, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 25.dp))
    Text(title, style = MaterialTheme.typography.displayLarge, modifier = Modifier.padding(top = 6.dp))
}

@Composable
private fun SectionTitle(title: String, description: String) {
    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 25.dp, bottom = 6.dp))
    Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 12.dp))
}

@Composable
private fun SwitchRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text(title, Modifier.weight(1f)); Switch(checked, onChange) }
}

@Composable
private fun Field(value: String, onChange: (String) -> Unit, label: String, placeholder: String = "", keyboard: KeyboardType = KeyboardType.Text, password: Boolean = false, enabled: Boolean = true, singleLine: Boolean = true) {
    OutlinedTextField(value, onChange, modifier = Modifier.fillMaxWidth(), label = { Text(label) }, placeholder = { Text(placeholder) }, keyboardOptions = KeyboardOptions(keyboardType = keyboard), visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None, enabled = enabled, singleLine = singleLine)
}

@Composable
private fun TrackArt(model: AdminViewModel, track: Track, size: Int) {
    AsyncCover(model, "/api/admin/tracks/${track.id}/cover?v=${model.artVersion}", track.title, Modifier.size(size.dp).clip(RoundedCornerShape(11.dp)))
}

@Composable
private fun AsyncCover(model: AdminViewModel, path: String, description: String, modifier: Modifier) {
    val request = ImageRequest.Builder(LocalContext.current).data(model.image(path)).addHeader("Cookie", model.cookie() ?: "").build()
    AsyncImage(request, description, modifier = modifier.background(Color(0xFF15151A)), contentScale = ContentScale.Crop)
}

@Composable
private fun ErrorText(text: String) { Text(text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp)) }

@Composable
private fun EmptyState(title: String, text: String) {
    Column(Modifier.fillMaxWidth().padding(45.dp), horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Outlined.LibraryMusic, null, Modifier.size(40.dp), tint = Color(0x60FFFFFF)); Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 15.dp)); Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 5.dp)) }
}

private fun formatDuration(seconds: Int): String = "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
private fun Int.ifEmpty(other: () -> Int) = if (this == 0) other() else this
