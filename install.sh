#!/usr/bin/env bash
set -euo pipefail

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/LunaMusync"
IMAGE="ghcr.io/josephserpa/luna-musync:latest"
REPOSITORY="JosephSerpa/LunaMusync"
NO_START=0
LIBRARIES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --library) LIBRARIES+=("$2"); shift 2 ;;
    --no-start) NO_START=1; shift ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null || { echo "Instala Docker antes de continuar." >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker no está en ejecución." >&2; exit 1; }

if [[ ${#LIBRARIES[@]} -eq 0 ]]; then
  while true; do
    read -r -p "Carpeta de música (vacío para terminar): " library
    [[ -z "$library" ]] && break
    LIBRARIES+=("$library")
  done
fi
[[ ${#LIBRARIES[@]} -gt 0 ]] || { echo "Selecciona al menos una biblioteca." >&2; exit 1; }
for library in "${LIBRARIES[@]}"; do
  [[ -d "$library" ]] || { echo "No existe: $library" >&2; exit 1; }
done

mkdir -p "$INSTALL_DIR"
cp "$SOURCE/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
cp "$SOURCE/scripts/luna.sh" "$INSTALL_DIR/luna.sh"
cp "$SOURCE/scripts/luna.ps1" "$INSTALL_DIR/luna.ps1"
chmod +x "$INSTALL_DIR/luna.sh"
{
  echo "services:"
  echo "  navidrome:"
  echo "    volumes:"
  index=1
  for library in "${LIBRARIES[@]}"; do
    path="${library//\\//}"
    path="${path//\"/\\\"}"
    echo "      - \"$path:/music/Biblioteca_$index:ro\""
    index=$((index + 1))
  done
} > "$INSTALL_DIR/docker-compose.libraries.yml"
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  find_free_port() {
    local port="$1"
    while ((port <= 65535)); do
      if ! (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then printf '%s' "$port"; return; fi
      ((port++))
    done
    echo "No hay puertos libres." >&2
    return 1
  }
  LUNA_PORT="$(find_free_port 1832)"
  cat > "$INSTALL_DIR/.env" <<EOF
LUNA_IMAGE=$IMAGE
LUNA_REPOSITORY=$REPOSITORY
LUNA_PORT=$LUNA_PORT
COOKIE_SECURE=false
EOF
fi
LUNA_PORT="$(sed -n 's/^LUNA_PORT=//p' "$INSTALL_DIR/.env" | head -n 1)"
LUNA_PORT="${LUNA_PORT:-1832}"

if [[ $NO_START -eq 0 ]]; then
  cd "$INSTALL_DIR"
  docker compose --env-file .env -f docker-compose.yml -f docker-compose.libraries.yml up -d
  for _ in $(seq 1 60); do
    curl -fsS --max-time 3 "http://localhost:$LUNA_PORT/api/health" >/dev/null 2>&1 && break
    sleep 3
  done
  echo "Luna está funcionando en http://localhost:$LUNA_PORT"
  echo "Abre Luna y crea tu usuario. Tus bibliotecas se indexarán automáticamente."
else
  echo "Instalación preparada en $INSTALL_DIR"
fi
