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
cat > "$INSTALL_DIR/.env" <<EOF
LUNA_IMAGE=$IMAGE
LUNA_REPOSITORY=$REPOSITORY
LUNA_PORT=3001
NAVIDROME_PORT=4533
NAVIDROME_PUBLIC_URL=http://localhost:4533
COOKIE_SECURE=false
EOF

if [[ $NO_START -eq 0 ]]; then
  cd "$INSTALL_DIR"
  docker compose --env-file .env -f docker-compose.yml -f docker-compose.libraries.yml up -d
  for _ in $(seq 1 60); do
    curl -fsS --max-time 3 http://localhost:3001/api/health >/dev/null 2>&1 && break
    sleep 3
  done
  echo "Luna: http://localhost:3001"
  echo "Primera vez: crea el administrador en http://localhost:4533"
else
  echo "Instalación preparada en $INSTALL_DIR"
fi
