import { useState, useEffect, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import HormuzMap from "./HormuzMap";

const AISSTREAM_API_KEY = import.meta.env.VITE_AISSTREAM_API_KEY;

const HORMUZ_BBOX = [[[25.5, 56.0], [27.0, 57.5]]];

const classifyShip = (shipType) => {
  if (!shipType) return "unknown";
  if (shipType >= 80 && shipType <= 89) return "tanker";
  if (shipType >= 70 && shipType <= 79) return "cargo";
  return "unknown";
};

const generateBaseline90Days = () => {
  const days = [];
  const today = new Date();
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const baseline = 41 + (Math.random() - 0.5) * 4;
    let actual;
    if (i > 50) actual = 39 + (Math.random() - 0.5) * 6;
    else if (i > 35) actual = 35 - (50 - i) * 0.8 + (Math.random() - 0.5) * 3;
    else actual = 23 + (Math.random() - 0.5) * 4;
    days.push({
      date: d.toISOString().slice(0, 10),
      baseline: Math.round(baseline * 10) / 10,
      actual: Math.round(actual * 10) / 10
    });
  }
  return days;
};

const INCIDENTS = [
  { date: "2025-01-14", desc: "Armed drone strike on VLCC near Larak Island", tag: "ATTACK", type: "attack" },
  { date: "2024-12-29", desc: "IRGC detention of Marshall Is. flagged tanker", tag: "SEIZURE", type: "attack" },
  { date: "2024-11-03", desc: "MARAD advisory updated — threat level elevated", tag: "MARAD", type: "marad" },
  { date: "2024-10-17", desc: "Suspicious vessel without AIS transited strait", tag: "AIS GAP", type: "aisgap" },
  { date: "2024-09-22", desc: "Vessel speed anomaly cluster near Qeshm", tag: "ANOMALY", type: "anomaly" }
];

const STRAITS = ["Hormuz", "Malacca", "Suez", "Bab-el-M.", "Taiwan", "Bosphorus"];

export default function HormuzCrisisMonitor() {
  const [ships, setShips] = useState(new Map());
  const [connected, setConnected] = useState(false);
  const [activeStrait, setActiveStrait] = useState("Hormuz");
  const [sliderDay, setSliderDay] = useState(90);
  const wsRef = useRef(null);

  const baseline90 = useMemo(() => generateBaseline90Days(), []);

  useEffect(() => {
    if (!AISSTREAM_API_KEY) {
      console.warn("VITE_AISSTREAM_API_KEY not set. Using mock data.");
      return;
    }

    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        APIKey: AISSTREAM_API_KEY,
        BoundingBoxes: HORMUZ_BBOX,
        FilterMessageTypes: ["PositionReport", "ShipStaticData"]
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const meta = msg.MetaData;
        if (!meta) return;
        const mmsi = meta.MMSI;
        if (!mmsi) return;

        setShips((prev) => {
          const next = new Map(prev);
          const existing = next.get(mmsi) || {};
          if (msg.MessageType === "PositionReport") {
            const pr = msg.Message.PositionReport;
            next.set(mmsi, {
              ...existing,
              mmsi,
              lat: pr.Latitude,
              lon: pr.Longitude,
              sog: pr.Sog,
              cog: pr.Cog,
              updated: Date.now()
            });
          } else if (msg.MessageType === "ShipStaticData") {
            const sd = msg.Message.ShipStaticData;
            next.set(mmsi, {
              ...existing,
              mmsi,
              shipType: sd.Type,
              name: sd.Name,
              updated: Date.now()
            });
          }
          return next;
        });
      } catch (e) {
        console.error(e);
      }
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => setConnected(false);

    const cleanup = setInterval(() => {
      setShips((prev) => {
        const cutoff = Date.now() - 10 * 60 * 1000;
        const next = new Map();
        for (const [k, v] of prev) if (v.updated > cutoff) next.set(k, v);
        return next;
      });
    }, 30000);

    return () => {
      clearInterval(cleanup);
      ws.close();
    };
  }, []);

  const liveShips = useMemo(() => {
    const arr = Array.from(ships.values()).filter((s) => s.lat && s.lon);
    return arr;
  }, [ships]);

  const currentMetrics = useMemo(() => {
    const total = liveShips.length;
    const tankers = liveShips.filter((s) => classifyShip(s.shipType) === "tanker").length;
    const tankerRatio = total > 0 ? Math.round((tankers / total) * 100) : 0;
    const speeds = liveShips.filter((s) => s.sog != null && s.sog > 0).map((s) => s.sog);
    const avgSpeed = speeds.length > 0 ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10 : 0;

    const usingMock = !connected;
    const display = usingMock
      ? { vessels: 23, tankerRatio: 28, avgSpeed: 9.1 }
      : { vessels: total, tankerRatio, avgSpeed };

    const baseline = { vessels: 41, tankerRatio: 51, avgSpeed: 14.3 };
    const delta = (now, base) => Math.round(((now - base) / base) * 100);

    return {
      ...display,
      baseline,
      deltaVessels: delta(display.vessels, baseline.vessels),
      deltaTanker: delta(display.tankerRatio, baseline.tankerRatio),
      deltaSpeed: delta(display.avgSpeed, baseline.avgSpeed)
    };
  }, [liveShips, connected]);

  // Ship list in lon/lat for the Mapbox layer.
  const shipsForMap = useMemo(() => {
    if (connected && liveShips.length > 0) {
      return liveShips.map((s) => ({
        lat: s.lat,
        lon: s.lon,
        type: classifyShip(s.shipType),
        mmsi: s.mmsi
      }));
    }
    return [
      { lat: 26.3, lon: 56.17, type: "tanker" }, { lat: 26.4, lon: 56.35, type: "tanker" },
      { lat: 26.35, lon: 56.55, type: "tanker" }, { lat: 26.3, lon: 56.7, type: "tanker" },
      { lat: 26.35, lon: 56.85, type: "tanker" }, { lat: 26.4, lon: 57.0, type: "tanker" },
      { lat: 26.35, lon: 57.15, type: "tanker" }, { lat: 26.4, lon: 57.3, type: "tanker" },
      { lat: 26.2, lon: 56.25, type: "cargo" }, { lat: 26.25, lon: 56.45, type: "cargo" },
      { lat: 26.2, lon: 56.72, type: "cargo" }, { lat: 26.25, lon: 56.92, type: "cargo" },
      { lat: 26.2, lon: 57.1, type: "cargo" },
      { lat: 26.5, lon: 56.6, type: "unknown" }, { lat: 26.55, lon: 57.23, type: "unknown" }
    ];
  }, [liveShips, connected]);

  const timelineData = useMemo(() => {
    return baseline90.map((d, i) => ({
      ...d,
      actualVisible: i <= sliderDay ? d.actual : null
    }));
  }, [baseline90, sliderDay]);

  const sliderDate = baseline90[sliderDay]?.date || "";

  return (
    <div style={styles.app}>
      <style>{globalStyles}</style>

      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>Chokepoint Intel</span>
          <div style={styles.separator} />
          <div style={styles.straitTabs}>
            {STRAITS.map((s) => (
              <button
                key={s}
                className={`tab ${activeStrait === s ? "active" : ""}`}
                onClick={() => setActiveStrait(s)}
                disabled={s !== "Hormuz"}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={styles.riskGauge}>
          <span style={styles.gaugeLabel}>Risk</span>
          <div style={styles.gaugeBars}>
            <div style={{ ...styles.gaugeBar, height: 6, background: "#e05a4a" }} />
            <div style={{ ...styles.gaugeBar, height: 9, background: "#e05a4a" }} />
            <div style={{ ...styles.gaugeBar, height: 12, background: "#e05a4a" }} />
            <div style={{ ...styles.gaugeBar, height: 9, background: "rgba(224,90,74,0.25)" }} />
            <div style={{ ...styles.gaugeBar, height: 6, background: "rgba(224,90,74,0.15)" }} />
          </div>
          <div style={styles.separator} />
          <div className="live-dot" />
          <span style={styles.liveLabel}>{connected ? "Live" : "Mock"}</span>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.mapArea}>
          <HormuzMap ships={shipsForMap} />

          <div style={styles.mapLegend}>
            <LegendItem color="#e05a4a" label="Tanker" />
            <LegendItem color="#2c6ea8" label="Cargo" />
            <LegendItem color="#6a8aaa" label="Unknown" />
            <LegendBox bg="rgba(224,90,74,0.2)" border="rgba(224,90,74,0.5)" label="MARAD zone" />
            <LegendBox bg="rgba(230,160,40,0.15)" border="rgba(230,160,40,0.6)" label="Caution zone" />
            <LegendBox bg="rgba(224,90,74,0.1)" border="#e05a4a" label="Incident" />
            <div style={{ width: "100%", height: 0.5, background: "rgba(255,255,255,0.06)", margin: "3px 0" }} />
            <div style={{ ...styles.legendItem, fontSize: 9, color: "#3d6080" }}>--- EEZ boundary</div>
          </div>

          <div style={styles.shipCounter}>
            <span style={{ color: "#3d6080", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>Tracking</span>
            <span style={{ color: "#c8d6e8", fontSize: 14, fontWeight: 500, marginLeft: 8 }}>{shipsForMap.length}</span>
            <span style={{ color: "#6a8aaa", fontSize: 10, marginLeft: 4 }}>vessels</span>
          </div>
        </div>

        <div style={styles.sidebar}>
          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>Live vs baseline (90d median)</div>
            <MetricRow name="Vessels / 24h" now={currentMetrics.vessels} base={currentMetrics.baseline.vessels} unit="" delta={currentMetrics.deltaVessels} />
            <MetricRow name="Tanker ratio" now={currentMetrics.tankerRatio} base={currentMetrics.baseline.tankerRatio} unit="%" delta={currentMetrics.deltaTanker} />
            <MetricRow name="Avg speed" now={currentMetrics.avgSpeed} base={currentMetrics.baseline.avgSpeed} unit="kn" delta={currentMetrics.deltaSpeed} />
          </div>

          <div style={styles.chartArea}>
            <div style={styles.panelTitle}>90-day trend</div>
            <div style={{ height: 60 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={baseline90} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={[10, 55]} />
                  <Line type="monotone" dataKey="baseline" stroke="rgba(74,127,168,0.35)" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="actual" stroke="#7eb8e8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ ...styles.panelSection, paddingBottom: 6 }}>
            <div style={styles.panelTitle}>Recent incidents</div>
          </div>
          <div style={styles.incidentsList}>
            {INCIDENTS.map((inc, i) => (
              <div key={i} style={styles.incidentItem}>
                <div style={styles.incidentDate}>{inc.date}</div>
                <div style={styles.incidentDesc}>{inc.desc}</div>
                <span style={{ ...styles.incidentTag, ...incidentTagStyle(inc.type) }}>{inc.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.timeline}>
        <div style={styles.timelineHeader}>
          <span style={styles.timelineLabel}>90-day passage volume vs baseline</span>
          <span style={styles.timelineRange}>{baseline90[0]?.date} — {sliderDate}</span>
        </div>
        <div style={{ position: "relative", height: 44 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timelineData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[10, 55]} />
              <Tooltip
                contentStyle={{ background: "#0d1219", border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 4, fontSize: 11, color: "#c8d6e8" }}
                labelStyle={{ color: "#3d6080", fontSize: 10 }}
                cursor={{ stroke: "rgba(126,184,232,0.3)", strokeWidth: 1 }}
              />
              <Line type="monotone" dataKey="baseline" stroke="rgba(74,127,168,0.35)" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} name="Baseline" />
              <Line type="monotone" dataKey="actualVisible" stroke="#7eb8e8" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Actual" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <input
          type="range"
          min="0"
          max="90"
          step="1"
          value={sliderDay}
          onChange={(e) => setSliderDay(parseInt(e.target.value))}
          style={styles.slider}
        />
      </div>
    </div>
  );
}

const MetricRow = ({ name, now, base, unit, delta }) => {
  const color = delta <= -35 ? "#e05a4a" : delta <= -15 ? "#e6a028" : delta >= 35 ? "#e05a4a" : "#4ab478";
  const bg = delta <= -35 ? "rgba(224,90,74,0.15)" : delta <= -15 ? "rgba(230,160,40,0.15)" : delta >= 35 ? "rgba(224,90,74,0.15)" : "rgba(74,180,120,0.15)";
  const pct = Math.min(100, Math.abs((now / base) * 100));
  return (
    <div style={styles.metricRow}>
      <span style={styles.metricName}>{name}</span>
      <div style={{ textAlign: "right" }}>
        <div style={styles.metricValues}>
          <span style={styles.metricNow}>{now}{unit}</span>
          <span style={styles.metricBase}>/ {base}{unit}</span>
          <span style={{ ...styles.metricDelta, background: bg, color }}>
            {delta >= 0 ? "+" : ""}{delta}%
          </span>
        </div>
        <div style={{ marginTop: 3 }}>
          <div style={styles.deviationBarBg}>
            <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: color }} />
          </div>
        </div>
      </div>
    </div>
  );
};

const LegendItem = ({ color, label }) => (
  <div style={styles.legendItem}>
    <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
    {label}
  </div>
);

const LegendBox = ({ bg, border, label }) => (
  <div style={styles.legendItem}>
    <div style={{ width: 10, height: 6, borderRadius: 1, background: bg, border: `0.5px solid ${border}`, flexShrink: 0 }} />
    {label}
  </div>
);

const incidentTagStyle = (type) => {
  if (type === "marad" || type === "anomaly") return { background: "rgba(230,160,40,0.12)", color: "#a07030" };
  if (type === "aisgap") return { background: "rgba(126,184,232,0.1)", color: "#4a80a8" };
  return {};
};

const globalStyles = `
  .tab { padding: 2px 5px; font-size: 11px; border-radius: 3px; cursor: pointer; color: #6a8aaa; border: none; background: transparent; font-family: inherit; transition: all 0.15s; }
  .tab.active { background: rgba(74,127,168,0.2); color: #7eb8e8; }
  .tab:hover:not(.active):not(:disabled) { color: #9ab8d0; }
  .tab:disabled { cursor: not-allowed; opacity: 0.5; }
  .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #e05a4a; animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`;

const styles = {
  app: { display: "flex", flexDirection: "column", height: "100vh", background: "#0a0e14", color: "#c8d6e8", fontSize: 13, fontFamily: "system-ui, -apple-system, sans-serif", overflow: "hidden" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "0.5px solid rgba(255,255,255,0.08)", background: "#0d1219", flexShrink: 0 },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: { fontSize: 11, fontWeight: 500, letterSpacing: "0.12em", color: "#4a7fa8", textTransform: "uppercase" },
  separator: { width: 0.5, height: 16, background: "rgba(255,255,255,0.12)" },
  straitTabs: { display: "flex", gap: 2 },
  riskGauge: { display: "flex", alignItems: "center", gap: 8 },
  gaugeLabel: { fontSize: 10, color: "#4a7fa8", letterSpacing: "0.08em", textTransform: "uppercase" },
  gaugeBars: { display: "flex", gap: 3, alignItems: "flex-end" },
  gaugeBar: { width: 6, borderRadius: 1 },
  liveLabel: { fontSize: 10, color: "#e05a4a", letterSpacing: "0.06em" },
  main: { display: "flex", flex: 1, overflow: "hidden" },
  mapArea: { flex: 1, position: "relative", background: "#0c1520", overflow: "hidden" },
  mapLegend: { position: "absolute", zIndex: 2, bottom: 12, left: 12, background: "rgba(13,18,25,0.85)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 },
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#6a8aaa" },
  shipCounter: { position: "absolute", zIndex: 2, top: 12, right: 12, background: "rgba(13,18,25,0.85)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center" },
  sidebar: { width: 240, borderLeft: "0.5px solid rgba(255,255,255,0.08)", background: "#0d1219", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 },
  panelSection: { padding: "12px 14px", borderBottom: "0.5px solid rgba(255,255,255,0.06)" },
  panelTitle: { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#3d6080", marginBottom: 10 },
  metricRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  metricName: { fontSize: 11, color: "#6a8aaa" },
  metricValues: { display: "flex", alignItems: "baseline", gap: 4 },
  metricNow: { fontSize: 13, fontWeight: 500, color: "#c8d6e8" },
  metricBase: { fontSize: 10, color: "#3d6080" },
  metricDelta: { fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 3 },
  deviationBarBg: { height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" },
  chartArea: { padding: "12px 14px", borderBottom: "0.5px solid rgba(255,255,255,0.06)" },
  incidentsList: { padding: "10px 14px", flex: 1, overflowY: "auto" },
  incidentItem: { padding: "7px 0", borderBottom: "0.5px solid rgba(255,255,255,0.04)" },
  incidentDate: { fontSize: 10, color: "#3d6080", marginBottom: 2 },
  incidentDesc: { fontSize: 11, color: "#8aacca", lineHeight: 1.4 },
  incidentTag: { display: "inline-block", fontSize: 9, padding: "1px 5px", borderRadius: 2, marginTop: 3, background: "rgba(224,90,74,0.12)", color: "#b06050", letterSpacing: "0.05em" },
  timeline: { height: 110, borderTop: "0.5px solid rgba(255,255,255,0.08)", background: "#0d1219", padding: "10px 16px", flexShrink: 0 },
  timelineHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  timelineLabel: { fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#3d6080" },
  timelineRange: { fontSize: 10, color: "#3d6080" },
  slider: { width: "100%", marginTop: 4, accentColor: "#4a7fa8" }
};
