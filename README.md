# Chokepoint Intel

React + Vite dashboard monitoring vessel activity through the Strait of Hormuz.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and fill in your tokens
npm run dev
```

## Environment variables

Two keys are required. Both are exposed to the browser because they're read via
`import.meta.env.VITE_*`, so **apply platform-side restrictions** (domain allow-list,
usage limits) before deploying.

- `VITE_MAPBOX_TOKEN` — Mapbox public access token. Get one from
  https://account.mapbox.com/access-tokens/ and add a URL restriction.
- `VITE_AISSTREAM_API_KEY` — AISStream.io key for the live AIS WebSocket feed.
  If unset, the UI falls back to mock vessel data.

## Map

The map renders via **Mapbox GL JS** with the `streets-v12` style (light OSM-like
basemap). Overlays — MARAD high-risk zone, caution zone, EEZ boundary line,
shipping lanes, incident pins, and live ship positions — are drawn as GeoJSON
layers defined in `src/HormuzMap.jsx`.

Ship positions flow in via WebSocket from AISStream and are pushed to the map
source on every update. When the stream is not connected, a hand-placed mock
fleet of 15 vessels is shown instead so the UI remains legible.

## Project layout

```
src/
  App.jsx                    Entry; renders the main dashboard.
  HormuzCrisisMonitor.jsx    Layout, metrics, timeline, incidents list.
  HormuzMap.jsx              Mapbox map + all geospatial overlays.
```
