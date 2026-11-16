# Luna Musync

Tu biblioteca musical, con la identidad visual de [LunaPlayer](https://github.com/JosephSerpa/LunaPlayer). Luna Musync combina un cliente web con reproductor y un servidor local sencillo de instalar. LunaPlayer sigue siendo la aplicación Android para conectar y escuchar tu música.

## Componentes

- **Luna Web:** álbumes, canciones, listas, búsqueda, carátulas, streaming por rangos, cola de reproducción, aleatorio, repetición, volumen y controles multimedia del sistema.
- **Luna Core:** API TypeScript que conecta por OpenSubsonic y protege las credenciales con una sesión `HttpOnly`.
- **Servidor gestionado:** Docker Compose incluye Luna y un motor interno de indexación y streaming, almacenamiento persistente y bibliotecas montadas en modo de solo lectura.
- **Actualizaciones:** releases de GitHub, imagen fijada por digest, comprobación SHA-256 de Compose, copia de seguridad y restauración si el despliegue falla.

Puedes conectar Luna Web a un servidor Navidrome, Subsonic, Airsonic o Gonic existente, o usar el instalador gestionado. La instalación gestionada utiliza Navidrome como componente interno: no necesitas abrir su interfaz ni configurar sus puertos.

## Instalar

Consulta [INSTALACION.md](INSTALACION.md). En Windows, instala Docker Desktop, descomprime la release y abre `Instalar Luna.cmd`. El asistente permite seleccionar varias carpetas de música. En Linux o macOS, ejecuta `./install.sh`.

Al abrir Luna por primera vez, crea tu propio usuario administrador directamente en su pantalla de bienvenida. Luna inicia la sesión automáticamente e indexa las bibliotecas elegidas durante la instalación. Los archivos musicales no se modifican.

## Desarrollo

Requiere Node 22 o superior.

```bash
npm ci
npm run dev
```

La web de desarrollo está en `http://localhost:5173` y la API en `http://localhost:3001`. Sin configurar un servidor gestionado puedes introducir la URL de cualquier servidor OpenSubsonic o abrir la demo con audio sintético.

```bash
npm run typecheck
npm test
npm run build
```

Para probar la imagen de producción localmente:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build luna
```

## Estructura

- `apps/web`: cliente React y reproductor.
- `apps/api`: API Node y adaptador OpenSubsonic.
- `packages/design-tokens`: colores y tipografías basados en LunaPlayer.
- `scripts`: asistentes de instalación, gestión y actualización.
- `.github/workflows`: comprobaciones automáticas y releases en GHCR.

## Estado

Esta versión incluye el cliente web y el servidor instalable. La aplicación Android de administración y el editor integrado de metadatos son trabajo futuro; esta versión no modifica etiquetas ni archivos de audio.
