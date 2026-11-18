# Instalar Luna Musync

## Windows, sin comandos

1. Instala y abre [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Descarga y descomprime la release de Luna Musync.
3. Haz doble clic en **Instalar Luna.cmd**.
4. Selecciona cada carpeta de música; el asistente preguntará si quieres añadir otra.
5. Espera a que se abra Luna y crea tu usuario administrador en la pantalla de bienvenida.

Luna usa `http://localhost:1832` por defecto. Si el puerto está ocupado elegirá el siguiente libre, sin detener otros servicios. Solo verás la interfaz de Luna; el motor interno no publica puertos ni requiere otra cuenta.

La instalación se guarda en `%USERPROFILE%\LunaMusync`. Encontrarás accesos para **abrir**, **detener**, **actualizar** o **cambiar bibliotecas**.

## Linux o macOS

Con Docker y `curl` instalados:

```bash
chmod +x install.sh
./install.sh
```

También puedes indicar carpetas directamente:

```bash
./install.sh --library "/música/rock" --library "/música/jazz"
```

En Linux, las carpetas deben permitir escritura al UID `1000`, que es el usuario sin privilegios del contenedor Luna. Esto es necesario para guardar etiquetas y mover archivos desde el editor. Navidrome las sigue montando como solo lectura.

## Editar y organizar

Entra en **Editor** desde el menú lateral. Puedes seleccionar varias canciones y arrastrarlas a la cabecera de un álbum para cambiar sus etiquetas de álbum y artista del álbum. También puedes editar campos, aplicar carátulas y guardar letras.

**Organización automática** siempre genera una vista previa. Revisa las rutas antes de confirmar. Luna detiene la operación si hay colisiones y no sobrescribe archivos existentes. Cada edición crea un respaldo restaurable en el volumen `luna-data`, dentro de `/data/backups`. Estos respaldos no sustituyen una copia general de tu biblioteca y ocupan espacio adicional.

## Luna Admin en Android

Para que el celular pueda conectar por la misma red local:

1. Abre `.env` dentro de la carpeta de instalación y añade `LUNA_BIND=0.0.0.0`.
2. Reinicia Luna (comandos abajo). Si el firewall pregunta, permite el acceso solo en **redes privadas**.
3. Averigua la IP local del servidor e instala el APK `luna-admin-VERSIÓN-debug.apk` incluido en la release.
4. En Luna Admin introduce, por ejemplo, `http://192.168.1.20:1832`, tu usuario y contraseña.

El APK debug es instalable, pero no está firmado como una aplicación de producción para una tienda. Requiere Android 8 o posterior. La cookie se almacena cifrada; la contraseña no se conserva.

No abras el puerto directamente a Internet. Para usarlo fuera de casa configura un proxy HTTPS y cambia `COOKIE_SECURE=true`.

## Actualizaciones seguras

En Windows usa **Actualizar Luna.cmd**. En Linux o macOS:

```bash
~/LunaMusync/luna.sh update
```

El actualizador descarga la última release del repositorio configurado, comprueba SHA-256 de Compose y fija la imagen por digest. Guarda la configuración anterior y la restaura si el despliegue falla. Nunca ejecuta `git pull` en el servidor ni borra volúmenes.

## Datos y privacidad

- El motor interno monta la música como **solo lectura**; Luna la monta con escritura para las acciones confirmadas en el editor.
- Los datos y respaldos se conservan en volúmenes Docker. Detener o actualizar no los elimina.
- Las búsquedas online envían los metadatos necesarios a MusicBrainz, Cover Art Archive o LRCLIB únicamente cuando las solicitas.
- El contenedor no recibe acceso al socket de Docker; las actualizaciones se inician desde el equipo.

## Comandos de gestión

Windows PowerShell, desde la carpeta de instalación:

```powershell
.\luna.ps1 status
.\luna.ps1 logs
.\luna.ps1 restart
.\luna.ps1 stop
.\luna.ps1 start
```

Linux o macOS:

```bash
./luna.sh status
./luna.sh logs
./luna.sh restart
./luna.sh stop
./luna.sh start
```
