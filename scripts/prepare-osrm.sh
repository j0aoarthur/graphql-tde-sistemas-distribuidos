#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/data/osrm"
mkdir -p "$DEST"
# Nordeste is the smallest official Geofabrik extract covering Feira de Santana.
# Download is deliberately manual: source is hundreds of MB.
PBF_URL="${PBF_URL:-https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf}"
if [[ ! -f "$DEST/nordeste.osm.pbf" ]]; then curl --fail --location --retry 3 "$PBF_URL" -o "$DEST/nordeste.osm.pbf"; fi
# Extract bounding box with extra margins for nearby routing.
docker run --rm -v "$DEST:/data" debian:bookworm-slim sh -c "apt-get update -qq && apt-get install -y -qq osmium-tool >/dev/null && osmium extract --overwrite -b=-39.20,-12.45,-38.70,-12.05 -o /data/feira.osm.pbf /data/nordeste.osm.pbf"
# OSRM MLD preprocessing. On some hosts, increase Docker RAM to >=4 GiB.
docker run --rm -v "$DEST:/data" ghcr.io/project-osrm/osrm-backend:latest osrm-extract -p /opt/car.lua /data/feira.osm.pbf
docker run --rm -v "$DEST:/data" ghcr.io/project-osrm/osrm-backend:latest osrm-partition /data/feira.osrm
docker run --rm -v "$DEST:/data" ghcr.io/project-osrm/osrm-backend:latest osrm-customize /data/feira.osrm
echo "OSRM preparado em $DEST; inicie o container de roteamento."
