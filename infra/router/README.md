# The router

ShotLog's own router: an [OSRM](https://project-osrm.org) instance with the Massachusetts road map from OpenStreetMap. It answers one question, "how do I drive from this site to that hospital", so the Jobsite Contact Sheet's back page can print the way there in readable type. No vendor account, no per-route cost.

## Deploying it on Railway (one-time)

1. In the ShotLog Railway project, **New › Service › GitHub repo**, pick this repository, and set the service's **Root Directory** to `infra/router` (Settings › Source). Railway builds the Dockerfile there. The first build downloads the Massachusetts extract (~100 MB) and prepares it (a few minutes, needs ~2 GB of memory during the build).
2. Give the service a name (`router`). It listens on port 5000 inside the project network; no public domain is needed.
3. On the **API service**, add the variable `ROUTER_URL=http://router.railway.internal:5000` and redeploy the API.
4. Check: `GET /places/route?from=42.4473,-71.2297&to=42.4356,-71.2452` on the API answers with miles, minutes and steps.

## Refreshing the map

Redeploy the service; the build fetches the latest extract. A few times a year is plenty for a hospital run.

## Widening the region

Change the build argument `REGION` (Geofabrik path), e.g. `north-america/us/new-hampshire`, or `north-america/us-northeast` for all of New England and New York (a bigger build; allow ~4 GB during the build).

## Running it locally

```
docker build -t shotlog-router infra/router
docker run --rm -p 5000:5000 shotlog-router
ROUTER_URL=http://localhost:5000 npm run dev -w apps/server
```
