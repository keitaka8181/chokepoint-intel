import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// --- Configuration ------------------------------------------------------

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

// Centered on the Strait of Hormuz
const INITIAL_CENTER = [56.75, 26.5];
const INITIAL_ZOOM = 8.2;

// Light OSM-like street style
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";

// --- Static overlay geometry -------------------------------------------
// All features are defined in real lon/lat so they sit on the actual map.

// MARAD High-Risk Zone (outer) and Caution Zone (inner) as approximate
// polygons around the Strait's choke area.
const marad_zone = {
  type: "Feature",
  properties: { kind: "marad_high" },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [56.10, 26.40], [56.30, 26.75], [56.70, 26.85], [57.10, 26.80],
      [57.40, 26.65], [57.40, 26.35], [57.10, 26.15], [56.70, 26.10],
      [56.30, 26.15], [56.10, 26.40]
    ]]
  }
};

const caution_zone = {
  type: "Feature",
  properties: { kind: "caution" },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [56.40, 26.45], [56.55, 26.65], [56.85, 26.70], [57.10, 26.65],
      [57.20, 26.50], [57.10, 26.35], [56.85, 26.30], [56.55, 26.35],
      [56.40, 26.45]
    ]]
  }
};

// EEZ-ish boundary line across the strait (illustrative, not authoritative).
const eez_line = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "LineString",
    coordinates: [
      [56.00, 26.80], [56.40, 26.78], [56.80, 26.75],
      [57.20, 26.72], [57.50, 26.70]
    ]
  }
};

// Shipping lanes: an inbound and outbound arc through the strait.
const shipping_lanes = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { direction: "outbound" },
      geometry: {
        type: "LineString",
        coordinates: [
          [56.00, 26.45], [56.30, 26.42], [56.60, 26.40],
          [56.90, 26.38], [57.20, 26.38], [57.50, 26.40]
        ]
      }
    },
    {
      type: "Feature",
      properties: { direction: "inbound" },
      geometry: {
        type: "LineString",
        coordinates: [
          [56.00, 26.35], [56.30, 26.32], [56.60, 26.30],
          [56.90, 26.28], [57.20, 26.28], [57.50, 26.30]
        ]
      }
    }
  ]
};

const INCIDENT_POINTS = [
  { lat: 26.6, lon: 56.3, severity: "high" },
  { lat: 26.7, lon: 56.7, severity: "medium" },
  { lat: 26.5, lon: 56.9, severity: "high" }
];

const incidents_geojson = {
  type: "FeatureCollection",
  features: INCIDENT_POINTS.map((p) => ({
    type: "Feature",
    properties: { severity: p.severity },
    geometry: { type: "Point", coordinates: [p.lon, p.lat] }
  }))
};

// --- Helpers -----------------------------------------------------------

const shipsToGeoJSON = (ships) => ({
  type: "FeatureCollection",
  features: ships.map((s, i) => ({
    type: "Feature",
    id: s.mmsi || i,
    properties: {
      type: s.type || "unknown",
      mmsi: s.mmsi || null
    },
    geometry: { type: "Point", coordinates: [s.lon, s.lat] }
  }))
});

// --- Component ---------------------------------------------------------

export default function HormuzMap({ ships }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!MAPBOX_TOKEN) {
      // Token missing — render fallback in JSX below.
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: true,
      cooperativeGestures: false
    });

    mapRef.current = map;

    map.on("load", () => {
      // --- Sources -------------------------------------------------------
      map.addSource("marad-zone", { type: "geojson", data: marad_zone });
      map.addSource("caution-zone", { type: "geojson", data: caution_zone });
      map.addSource("eez-line", { type: "geojson", data: eez_line });
      map.addSource("shipping-lanes", { type: "geojson", data: shipping_lanes });
      map.addSource("incidents", { type: "geojson", data: incidents_geojson });
      map.addSource("ships", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });

      // --- Layers (bottom → top) ----------------------------------------

      // MARAD high-risk zone fill + outline
      map.addLayer({
        id: "marad-zone-fill",
        type: "fill",
        source: "marad-zone",
        paint: {
          "fill-color": "#e05a4a",
          "fill-opacity": 0.12
        }
      });
      map.addLayer({
        id: "marad-zone-outline",
        type: "line",
        source: "marad-zone",
        paint: {
          "line-color": "#e05a4a",
          "line-width": 1.2,
          "line-dasharray": [3, 2]
        }
      });

      // Caution zone fill + outline
      map.addLayer({
        id: "caution-zone-fill",
        type: "fill",
        source: "caution-zone",
        paint: {
          "fill-color": "#e6a028",
          "fill-opacity": 0.10
        }
      });
      map.addLayer({
        id: "caution-zone-outline",
        type: "line",
        source: "caution-zone",
        paint: {
          "line-color": "#e6a028",
          "line-width": 1,
          "line-dasharray": [2, 2]
        }
      });

      // EEZ boundary
      map.addLayer({
        id: "eez-line",
        type: "line",
        source: "eez-line",
        paint: {
          "line-color": "#4a7fa8",
          "line-width": 1.2,
          "line-dasharray": [6, 4]
        }
      });

      // Shipping lanes — wide soft band underneath
      map.addLayer({
        id: "shipping-lanes-band",
        type: "line",
        source: "shipping-lanes",
        paint: {
          "line-color": "#3d80c2",
          "line-width": 14,
          "line-opacity": 0.12,
          "line-blur": 2
        }
      });
      // Shipping lanes — thin dashed centerline on top
      map.addLayer({
        id: "shipping-lanes-center",
        type: "line",
        source: "shipping-lanes",
        paint: {
          "line-color": "#3d80c2",
          "line-width": 1,
          "line-opacity": 0.6,
          "line-dasharray": [4, 3]
        }
      });

      // Incidents — halo + inner dot
      map.addLayer({
        id: "incidents-halo",
        type: "circle",
        source: "incidents",
        paint: {
          "circle-radius": 11,
          "circle-color": [
            "match",
            ["get", "severity"],
            "high", "#e05a4a",
            "medium", "#e6a028",
            "#6a8aaa"
          ],
          "circle-opacity": 0.18,
          "circle-stroke-color": [
            "match",
            ["get", "severity"],
            "high", "#e05a4a",
            "medium", "#e6a028",
            "#6a8aaa"
          ],
          "circle-stroke-width": 1,
          "circle-stroke-opacity": 0.8
        }
      });
      map.addLayer({
        id: "incidents-core",
        type: "circle",
        source: "incidents",
        paint: {
          "circle-radius": 3.5,
          "circle-color": [
            "match",
            ["get", "severity"],
            "high", "#e05a4a",
            "medium", "#e6a028",
            "#6a8aaa"
          ]
        }
      });

      // Ships — top-most layer
      map.addLayer({
        id: "ships-layer",
        type: "circle",
        source: "ships",
        paint: {
          "circle-radius": [
            "match",
            ["get", "type"],
            "tanker", 4.5,
            "cargo", 3.5,
            "unknown", 3,
            3
          ],
          "circle-color": [
            "match",
            ["get", "type"],
            "tanker", "#e05a4a",
            "cargo", "#2c6ea8",
            "unknown", "#6a8aaa",
            "#6a8aaa"
          ],
          "circle-opacity": [
            "match",
            ["get", "type"],
            "unknown", 0.7,
            0.9
          ],
          "circle-stroke-width": 0.6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.8
        }
      });

      // Cursor affordance on interactive layers.
      for (const id of ["ships-layer", "incidents-core", "incidents-halo"]) {
        map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
      }

      // Ship tooltip popup on click.
      map.on("click", "ships-layer", (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const { type, mmsi } = f.properties;
        const html = `<div style="font-family: system-ui, sans-serif; font-size: 12px;">
          <div style="font-weight:500;color:#0d1219;">${type?.toUpperCase() || "VESSEL"}</div>
          <div style="color:#4a7fa8;font-size:10px;">MMSI ${mmsi || "mock"}</div>
        </div>`;
        new mapboxgl.Popup({ closeButton: false, offset: 10 })
          .setLngLat(f.geometry.coordinates)
          .setHTML(html)
          .addTo(map);
      });

      loadedRef.current = true;

      // If ships arrived before map finished loading, push them in now.
      const src = map.getSource("ships");
      if (src && ships && ships.length > 0) {
        src.setData(shipsToGeoJSON(ships));
      }
    });

    return () => {
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // We intentionally run this effect only once; ship updates go through
    // the second effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push ship updates to the map whenever the `ships` prop changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const src = map.getSource("ships");
    if (src) {
      src.setData(shipsToGeoJSON(ships || []));
    }
  }, [ships]);

  // Missing-token fallback.
  if (!MAPBOX_TOKEN) {
    return (
      <div style={fallbackStyles.wrap}>
        <div style={fallbackStyles.box}>
          <div style={fallbackStyles.title}>Map unavailable</div>
          <div style={fallbackStyles.body}>
            <code style={fallbackStyles.code}>VITE_MAPBOX_TOKEN</code> is not set.
            Add a Mapbox public token to a <code style={fallbackStyles.code}>.env</code> file
            (see <code style={fallbackStyles.code}>.env.example</code>) and restart the dev server.
          </div>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}

const fallbackStyles = {
  wrap: {
    position: "absolute", inset: 0, display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "#0c1520"
  },
  box: {
    maxWidth: 360, padding: "16px 20px", borderRadius: 8,
    background: "#0d1219", border: "0.5px solid rgba(255,255,255,0.1)",
    color: "#c8d6e8", fontSize: 12, lineHeight: 1.5
  },
  title: {
    fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
    color: "#e05a4a", marginBottom: 8
  },
  body: { color: "#8aacca" },
  code: {
    background: "rgba(255,255,255,0.06)", padding: "1px 5px",
    borderRadius: 3, fontSize: 11, color: "#c8d6e8"
  }
};
