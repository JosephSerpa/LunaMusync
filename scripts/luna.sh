#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-status}"
ENV_FILE="$ROOT/.env"
COMPOSE_FILE="$ROOT/docker-compose.yml"
LIBRARIES_FILE="$ROOT/docker-compose.libraries.yml"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$LIBRARIES_FILE")

wait_luna() {
  local port
  port="$(sed -n 's/^LUNA_PORT=//p' "$ENV_FILE" | head -n 1)"
  port="${port:-3001}"
  for _ in $(seq 1 40); do
    if curl -fsS --max-time 3 "http://localhost:$port/api/health" >/dev/null 2>&1; then return; fi
    sleep 3
  done
  echo "Luna no respondió a tiempo. Revisa los logs." >&2
  return 1
}

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d ' ' -f 1; else shasum -a 256 "$1" | cut -d ' ' -f 1; fi
}

update_luna() {
  local repository release image expected actual backup temp version
  repository="$(sed -n 's/^LUNA_REPOSITORY=//p' "$ENV_FILE" | head -n 1)"
  repository="${repository:-JosephSerpa/LunaMusync}"
  release="$ROOT/.luna-release-download.json"
  curl -fsSL --max-time 30 "https://github.com/$repository/releases/latest/download/luna-release.json" -o "$release"
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$release")"
  image="$(sed -n 's/.*"image"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$release")"
  expected="$(sed -n 's/.*"composeSha256"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$release")"
  local owner="${repository%%/*}"
  if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.-]*$ ]] || [[ ! "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || [[ ! "$image" =~ ^ghcr\.io/${owner,,}/luna-musync@sha256:[0-9a-f]{64}$ ]] || [[ ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
    echo "La release no contiene datos verificables válidos." >&2
    return 1
  fi
  backup="$ROOT/backups/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup"
  cp "$COMPOSE_FILE" "$ENV_FILE" "$backup/"
  temp="$backup/docker-compose.downloaded.yml"
  curl -fsSL --max-time 30 "https://github.com/$repository/releases/download/$version/docker-compose.yml" -o "$temp"
  actual="$(sha256 "$temp")"
  if [[ "$actual" != "$expected" ]]; then echo "La configuración no supera SHA-256." >&2; return 1; fi
  docker compose --env-file "$ENV_FILE" -f "$temp" -f "$LIBRARIES_FILE" config --quiet || return 1
  cp "$temp" "$COMPOSE_FILE"
  sed -i.bak "s|^LUNA_IMAGE=.*|LUNA_IMAGE=$image|" "$ENV_FILE"
  if ! "${COMPOSE[@]}" pull luna || ! "${COMPOSE[@]}" up -d || ! wait_luna; then
    cp "$backup/docker-compose.yml" "$COMPOSE_FILE"
    cp "$backup/.env" "$ENV_FILE"
    "${COMPOSE[@]}" up -d || true
    echo "La actualización falló; se restauró la configuración anterior." >&2
    return 1
  fi
  rm -f "$release" "$ENV_FILE.bak"
  echo "Luna se actualizó correctamente. Copia anterior: $backup"
}

[[ -f "$ENV_FILE" ]] || { echo "No se encontró la instalación de Luna." >&2; exit 1; }
case "$COMMAND" in
  start) "${COMPOSE[@]}" up -d; wait_luna; echo "Luna está disponible en http://localhost:3001" ;;
  stop) "${COMPOSE[@]}" stop; echo "Luna se detuvo sin borrar datos." ;;
  restart) "${COMPOSE[@]}" restart; wait_luna ;;
  status) "${COMPOSE[@]}" ps ;;
  logs) "${COMPOSE[@]}" logs --tail=100 ;;
  update) update_luna ;;
  *) echo "Uso: $0 [start|stop|restart|status|logs|update]" >&2; exit 2 ;;
esac
