# Instalar Luna Musync

## Windows, sin comandos

1. Instala y abre [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Descarga y descomprime Luna Musync.
3. Haz doble clic en **Instalar Luna.cmd**.
4. Selecciona cada carpeta de música. El asistente preguntará si quieres añadir otra.
5. Espera a que se abran las páginas de configuración.

Los puertos predeterminados son `3001` para Luna y `4533` para Navidrome. Si alguno está ocupado, el asistente elegirá el siguiente puerto libre y abrirá las direcciones correctas. No detendrá otros servicios.

En la primera instalación:

1. En la página de Navidrome que abre el asistente (`http://localhost:4533` por defecto), crea el usuario administrador. Es el único paso que Navidrome exige realizar desde su propia interfaz.
2. Abre Luna (`http://localhost:3001` por defecto) e inicia sesión con ese usuario.
3. Navidrome indexará las bibliotecas seleccionadas. Una colección grande puede tardar.

La instalación se guarda en `%USERPROFILE%\LunaMusync`. Allí encontrarás accesos para **abrir**, **detener**, **actualizar** o **cambiar las bibliotecas**. No necesitas volver a editar archivos de configuración.

## Linux o macOS

Con Docker y `curl` instalados:

```bash
chmod +x install.sh
./install.sh
```

También puedes indicar las carpetas directamente:

```bash
./install.sh --library "/música/rock" --library "/música/jazz"
```

## Actualizaciones seguras

En Windows, usa **Actualizar Luna.cmd**. En Linux o macOS:

```bash
~/LunaMusync/luna.sh update
```

El actualizador descarga únicamente la última release de GitHub, comprueba la suma SHA-256 de la configuración y fija la imagen por su digest SHA-256 antes de iniciarla. Guarda una copia de la configuración anterior en `backups` y la restaura si el despliegue falla. Nunca ejecuta `git pull` en el servidor ni borra los volúmenes de datos.

Las imágenes se construyen y publican en GHCR después de pasar comprobación de tipos, pruebas y compilación. Las releases también incluyen atestación de procedencia.

## Datos y privacidad

- Las carpetas de música se montan **solo como lectura**.
- Navidrome y Luna guardan sus datos en volúmenes Docker persistentes.
- Detener o actualizar no elimina esos volúmenes.
- Los puertos solo escuchan en `127.0.0.1` por defecto. Para acceder desde otros dispositivos, utiliza un proxy HTTPS y cambia `LUNA_BIND` y `COOKIE_SECURE` de forma consciente.
- El contenedor no recibe acceso al socket de Docker. Las actualizaciones se inician desde el asistente del equipo, no desde una interfaz pública.

## Comandos de gestión

Windows PowerShell, desde la carpeta de instalación:

```powershell
.\luna.ps1 status
.\luna.ps1 logs
.\luna.ps1 stop
.\luna.ps1 start
```

Linux o macOS:

```bash
./luna.sh status
./luna.sh logs
./luna.sh stop
./luna.sh start
```
