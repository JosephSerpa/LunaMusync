# Luna Musync

Tu biblioteca musical, con la identidad visual de [LunaPlayer](https://github.com/JosephSerpa/LunaPlayer). Luna Musync incluye un servidor fácil de instalar, un cliente web con reproductor, un editor de archivos y **Luna Admin**, su aplicación Android nativa de administración.

## Componentes

- **Luna Web:** álbumes, canciones, listas, búsqueda, carátulas, streaming por rangos, cola, aleatorio, repetición, volumen y controles multimedia del sistema.
- **Editor Luna:** selección individual o masiva, edición de etiquetas, arrastre de canciones hacia un álbum, carátulas locales o subidas, búsqueda en MusicBrainz/Cover Art Archive y letras de LRCLIB.
- **Organización segura:** infiere metadatos desde nombres y carpetas, numera pistas y muestra una vista previa antes de aplicar `Biblioteca/Artista/Álbum/NN - Título.ext`. Nunca sobrescribe un destino existente.
- **Respaldos:** cada operación conserva el contenido original en `/data/backups`; se puede restaurar desde Luna. Las letras se guardan embebidas y como `.lrc`.
- **Luna Admin para Android:** aplicación Kotlin + Jetpack Compose para editar, asignar canciones a álbumes, buscar carátulas y letras, organizar, reindexar y restaurar desde el móvil. Android 8 o superior.
- **Luna Core:** API TypeScript con sesiones `HttpOnly`; solo cuentas administradoras pueden modificar archivos. Las rutas están confinadas a las bibliotecas conectadas.
- **Servidor gestionado:** Docker Compose incluye Luna y su motor interno de indexación/streaming. Navidrome no publica puertos ni sustituye la interfaz de Luna.
- **Actualizaciones:** releases de GitHub, imagen fijada por digest, SHA-256 de Compose, copia de configuración y restauración automática si el despliegue falla.

Puedes conectar el reproductor web a otro servidor OpenSubsonic, pero el editor solo está disponible en una instalación gestionada por Luna.

## Instalar

Consulta [INSTALACION.md](INSTALACION.md). En Windows instala Docker Desktop, descomprime la release y abre `Instalar Luna.cmd`; el asistente permite elegir varias bibliotecas. En Linux o macOS ejecuta `./install.sh`.

Abre `http://localhost:1832` y crea tu usuario administrador. No hay que crear otra cuenta en Navidrome. La primera indexación puede tardar según el tamaño de la colección.

### Usar Luna Admin en el celular

1. En el archivo `.env` de la instalación, cambia o añade `LUNA_BIND=0.0.0.0`.
2. Reinicia Luna con `luna.ps1 restart` en Windows o `./luna.sh restart` en Linux/macOS. Permite el puerto `1832` únicamente en tu red privada.
3. Instala `luna-admin-VERSIÓN-debug.apk` desde la release y conecta con `http://IP-DEL-SERVIDOR:1832`.

El APK publicado es una compilación **debug instalable**, no una release firmada para tiendas. La cookie se cifra con Android Keystore; la contraseña no se guarda. Para acceso desde Internet utiliza un proxy HTTPS y `COOKIE_SECURE=true`; no expongas directamente el puerto.

## Escritura y privacidad

El editor modifica archivos únicamente después de una acción del usuario. Por eso Luna recibe las bibliotecas con escritura, mientras el motor de indexación conserva acceso de solo lectura. En Linux, el usuario que ejecuta Docker debe permitir escritura al UID `1000` del contenedor. Haz una copia general de tu colección antes de una reorganización grande.

MusicBrainz/Cover Art Archive reciben el artista y álbum consultados; LRCLIB recibe título, artista, álbum y duración. Estas búsquedas solo ocurren al solicitarlas y no necesitan claves. La escritura de etiquetas depende del formato de audio; Luna no recodifica el sonido. Si una operación falla, intenta restaurar los archivos de esa operación.

## Desarrollo

Requiere Node 22 o superior.

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

La web de desarrollo está en `http://localhost:5173` y la API en `http://localhost:3001`. Para compilar Android usa Android Studio, Java 17 y el proyecto `apps/android-admin`, o ejecuta allí `./gradlew :app:assembleDebug`.

Para probar la imagen de producción localmente:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build luna
```

## Estructura

- `apps/web`: cliente React, reproductor y editor visual.
- `apps/api`: API Node, edición segura y adaptador OpenSubsonic.
- `apps/android-admin`: Luna Admin nativa, Kotlin y Compose.
- `packages/design-tokens`: colores y tipografías basados en LunaPlayer.
- `scripts`: asistentes de instalación, gestión y actualización.
- `.github/workflows`: pruebas, imagen GHCR, APK y releases.
