# ShotLog's own router (S22, Matthew's pick: "our own router plus the QR code") —
# an OSRM instance holding the Massachusetts road map from OpenStreetMap, so
# the contact sheet's back page can print the drive to the hospital and the
# urgent care, one step per line, with no per-route cost and no vendor key.
#
# One service on Railway beside the API and the database (about $5–10 a month).
# The API reaches it through ROUTER_URL (e.g. http://router.railway.internal:5000).
# Refresh the map a few times a year by redeploying (the build downloads the
# latest extract). Widen the region by changing REGION (e.g. us-northeast).
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1 AS build
ARG REGION=north-america/us/massachusetts
RUN mkdir -p /data && cd /data \
  && curl -fsSL -o map.osm.pbf "https://download.geofabrik.de/${REGION}-latest.osm.pbf" \
  && osrm-extract -p /opt/car.lua map.osm.pbf \
  && osrm-partition map.osrm \
  && osrm-customize map.osrm \
  && rm map.osm.pbf

FROM ghcr.io/project-osrm/osrm-backend:v5.27.1
COPY --from=build /data /data
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--port", "5000", "/data/map.osrm"]
