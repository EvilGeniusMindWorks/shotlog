import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Copy, Crosshair, Home, Layers, MapPin, Ruler, Search } from 'lucide-react';
import { cn, generateId } from '@/lib/utils';
import {
  closestStructure,
  distanceFt,
  type SiteDiagram,
} from '@/lib/siteDiagram';
import { Button } from '@/components/ui/button';

type PinMode = 'pan' | 'blast' | 'structure' | 'measure';

const TILE_LAYERS = {
  street: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    // OSM serves tiles at every zoom we allow
    maxNativeZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    // Esri imagery has no tiles above ~z17 in rural areas — request z17 and
    // let Leaflet upscale, instead of rendering blank gray
    maxNativeZoom: 17,
  },
};

const blastIcon = L.divIcon({
  className: '',
  html: '<div style="width:30px;height:30px;border-radius:50%;background:#dd6b20;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;">✸</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const structureIcon = (label: string) =>
  L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:24px;height:24px;border-radius:4px;background:#1a365d;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">⌂</div><div style="background:white;border-radius:3px;padding:0 4px;font-size:10px;font-weight:700;color:#1a365d;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.3);">${label}</div></div>`,
    iconSize: [24, 40],
    iconAnchor: [12, 12],
  });

interface Props {
  value: SiteDiagram;
  onChange: (d: SiteDiagram) => void;
  jobAddress?: string;
  onUseClosest?: (distanceFeet: number, label: string) => void;
  /** Called with a rendered PNG of the map + annotations after edits settle */
  onSnapshot?: (blob: Blob) => void;
  /** Sibling shots this diagram can be cloned to */
  cloneTargets?: { id: string; label: string }[];
  onClone?: (targetShotId: string) => void;
}

/**
 * Composite the currently-visible tiles + annotations into a PNG. Tiles are
 * loaded with crossOrigin=anonymous so the canvas stays untainted; if a tile
 * host ever blocks CORS, toBlob throws and we skip the snapshot gracefully.
 */
async function captureSnapshot(
  map: L.Map,
  container: HTMLElement,
  value: SiteDiagram,
): Promise<Blob | null> {
  try {
    const size = map.getSize();
    const canvas = document.createElement('canvas');
    canvas.width = size.x;
    canvas.height = size.y;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#e5e3df';
    ctx.fillRect(0, 0, size.x, size.y);

    // Tiles: draw each at its on-screen position
    const cRect = container.getBoundingClientRect();
    for (const img of container.querySelectorAll<HTMLImageElement>('img.leaflet-tile')) {
      if (!img.complete || img.naturalWidth === 0) continue;
      const r = img.getBoundingClientRect();
      ctx.drawImage(img, r.left - cRect.left, r.top - cRect.top, r.width, r.height);
    }

    const toPt = (lat: number, lng: number) => map.latLngToContainerPoint([lat, lng]);

    // Distance lines
    if (value.blastPin) {
      const b = toPt(value.blastPin.lat, value.blastPin.lng);
      ctx.strokeStyle = '#1a365d';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      for (const s of value.structures) {
        const p = toPt(s.lat, s.lng);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // Blast pin
      ctx.beginPath();
      ctx.arc(b.x, b.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#dd6b20';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // Structure pins + labels
    for (const s of value.structures) {
      const p = toPt(s.lat, s.lng);
      ctx.fillStyle = '#1a365d';
      ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 10, p.y - 10, 20, 20);
      const label = value.blastPin
        ? `${s.label} — ${Math.round(distanceFt(value.blastPin, s))} ft`
        : s.label;
      ctx.font = 'bold 11px Arial';
      const w = ctx.measureText(label).width;
      ctx.fillStyle = 'white';
      ctx.fillRect(p.x - w / 2 - 3, p.y + 12, w + 6, 15);
      ctx.fillStyle = '#1a365d';
      ctx.fillText(label, p.x - w / 2, p.y + 23);
    }

    // JPEG: satellite imagery compresses ~8× better than PNG at this quality
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85),
    );
  } catch {
    return null; // tainted canvas or transient failure — skip this snapshot
  }
}

export function SiteDiagramEditor({
  value,
  onChange,
  jobAddress,
  onUseClosest,
  onSnapshot,
  cloneTargets,
  onClone,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const pinsRef = useRef<L.LayerGroup | null>(null);
  const [mode, setMode] = useState<PinMode>('pan');
  const [busy, setBusy] = useState<string | null>(null);
  // Transient measure tool: two taps → distance line (not persisted)
  const [measurePts, setMeasurePts] = useState<{ lat: number; lng: number }[]>([]);
  const measureRef = useRef(measurePts);
  measureRef.current = measurePts;
  const measureLayerRef = useRef<L.LayerGroup | null>(null);

  // liveRef is the single source of truth for map event handlers. It updates
  // SYNCHRONOUSLY on every mutation — waiting for React's render round-trip
  // (the previous approach) let rapid events (pin, pan, remount) read stale
  // state and clobber just-placed pins.
  const liveRef = useRef(value);
  useEffect(() => {
    liveRef.current = value;
  }, [value]);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const snapshotTimer = useRef<number | undefined>(undefined);

  const scheduleSnapshot = () => {
    if (!onSnapshotRef.current) return;
    window.clearTimeout(snapshotTimer.current);
    // Wait for tiles to settle after the edit before compositing
    snapshotTimer.current = window.setTimeout(async () => {
      const map = mapRef.current;
      const container = containerRef.current;
      if (!map || !container) return;
      const blob = await captureSnapshot(map, container, liveRef.current);
      if (blob) onSnapshotRef.current?.(blob);
    }, 1500);
  };

  const mutate = (updater: (v: SiteDiagram) => SiteDiagram) => {
    const next = updater(liveRef.current);
    liveRef.current = next; // later events in the same tick see the new state
    onChangeRef.current(next);
    scheduleSnapshot();
  };
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;

  // Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const v = liveRef.current;
    const map = L.map(containerRef.current, {
      center: v.center ?? { lat: 42.44, lng: -72.63 }, // western MA fallback
      zoom: v.zoom,
      zoomControl: true,
    });
    mapRef.current = map;
    pinsRef.current = L.layerGroup().addTo(map);
    // The container can be mid-layout when the map mounts — recalc once settled
    window.setTimeout(() => map.invalidateSize(), 100);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const m = modeRef.current;
      if (m === 'measure') {
        const pts = measureRef.current;
        setMeasurePts(
          pts.length >= 2 ? [{ lat: e.latlng.lat, lng: e.latlng.lng }] : [...pts, { lat: e.latlng.lat, lng: e.latlng.lng }],
        );
        return;
      }
      if (m === 'blast') {
        mutateRef.current((cur) => ({
          ...cur,
          blastPin: { lat: e.latlng.lat, lng: e.latlng.lng },
        }));
        setMode('pan');
      } else if (m === 'structure') {
        mutateRef.current((cur) => ({
          ...cur,
          structures: [
            ...cur.structures,
            {
              id: generateId(),
              lat: e.latlng.lat,
              lng: e.latlng.lng,
              label: `Structure ${cur.structures.length + 1}`,
            },
          ],
        }));
        setMode('pan');
      }
    });
    map.on('moveend zoomend', () => {
      const c = map.getCenter();
      const zoom = map.getZoom();
      mutateRef.current((cur) => {
        // Skip no-op writes (init, programmatic setView to the same place)
        if (
          cur.center &&
          Math.abs(cur.center.lat - c.lat) < 1e-9 &&
          Math.abs(cur.center.lng - c.lng) < 1e-9 &&
          cur.zoom === zoom
        ) {
          return cur;
        }
        return { ...cur, center: { lat: c.lat, lng: c.lng }, zoom };
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Base layer follows state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    const spec = TILE_LAYERS[value.baseLayer];
    tileRef.current = L.tileLayer(spec.url, {
      attribution: spec.attribution,
      maxZoom: 19,
      maxNativeZoom: spec.maxNativeZoom,
      crossOrigin: 'anonymous', // required for canvas snapshot capture
    }).addTo(map);
  }, [value.baseLayer]);

  // Transient measure line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!measureLayerRef.current) measureLayerRef.current = L.layerGroup().addTo(map);
    const layer = measureLayerRef.current;
    layer.clearLayers();
    for (const p of measurePts) {
      L.circleMarker(p, { radius: 5, color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 1 }).addTo(layer);
    }
    if (measurePts.length === 2) {
      const ft = Math.round(distanceFt(measurePts[0], measurePts[1]));
      L.polyline(measurePts, { color: '#7c3aed', weight: 3, dashArray: '8,5' }).addTo(layer);
      const mid = {
        lat: (measurePts[0].lat + measurePts[1].lat) / 2,
        lng: (measurePts[0].lng + measurePts[1].lng) / 2,
      };
      L.marker(mid, {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#7c3aed;color:white;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3);">${ft} ft</div>`,
          iconSize: [60, 22],
          iconAnchor: [30, 11],
        }),
        interactive: false,
      }).addTo(layer);
    }
  }, [measurePts]);

  // Redraw pins + distance lines whenever annotations change
  useEffect(() => {
    const pins = pinsRef.current;
    if (!pins) return;
    pins.clearLayers();
    const { blastPin, structures } = value;
    if (blastPin) {
      // Dashed blast-zone rectangle around the pin (wireframe style)
      const dLat = 0.00022;
      const dLng = 0.0003;
      L.rectangle(
        [
          [blastPin.lat - dLat, blastPin.lng - dLng],
          [blastPin.lat + dLat, blastPin.lng + dLng],
        ],
        { color: '#dd6b20', weight: 2, dashArray: '6,4', fill: false, interactive: false },
      ).addTo(pins);
      L.marker(blastPin, { icon: blastIcon })
        .addTo(pins)
        .bindPopup(
          `<b>Blast Location</b><br/><button data-remove="blast" style="color:#c53030;">Remove</button>`,
        );
    }
    for (const s of structures) {
      const dist = blastPin ? Math.round(distanceFt(blastPin, s)) : null;
      const label = dist !== null ? `${s.label} — ${dist} ft` : s.label;
      L.marker(s, { icon: structureIcon(label) })
        .addTo(pins)
        .bindPopup(
          `<b>${s.label}</b>${dist !== null ? `<br/>${dist} ft from blast` : ''}<br/><button data-remove="${s.id}" style="color:#c53030;">Remove</button>`,
        );
      if (blastPin) {
        L.polyline([blastPin, s], {
          color: '#1a365d',
          weight: 2,
          dashArray: '6,4',
          opacity: 0.8,
        }).addTo(pins);
      }
    }
  }, [value]);

  // Handle Remove buttons inside Leaflet popups (they live outside React)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const removeId = target.dataset?.remove;
      if (!removeId) return;
      if (removeId === 'blast') {
        mutateRef.current((cur) => ({ ...cur, blastPin: null }));
      } else {
        mutateRef.current((cur) => ({
          ...cur,
          structures: cur.structures.filter((s) => s.id !== removeId),
        }));
      }
      mapRef.current?.closePopup();
    };
    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, []);

  const flyTo = (lat: number, lng: number, zoom = 17) => {
    mapRef.current?.setView([lat, lng], zoom);
  };

  const findAddress = async () => {
    if (!jobAddress) return;
    setBusy('Searching address…');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(jobAddress)}`,
        { headers: { Accept: 'application/json' } },
      );
      const results = (await res.json()) as { lat: string; lon: string }[];
      if (results[0]) flyTo(parseFloat(results[0].lat), parseFloat(results[0].lon));
      else setBusy('Address not found');
    } catch {
      setBusy('Search failed — offline?');
    } finally {
      window.setTimeout(() => setBusy(null), 1500);
    }
  };

  const myLocation = () => {
    if (!navigator.geolocation) return;
    setBusy('Locating…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        flyTo(pos.coords.latitude, pos.coords.longitude);
        setBusy(null);
      },
      () => setBusy('Location unavailable'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const closest = closestStructure(value);

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={mode === 'blast' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode(mode === 'blast' ? 'pan' : 'blast')}
        >
          <MapPin className="h-4 w-4 mr-1" /> Pin Blast
        </Button>
        <Button
          variant={mode === 'structure' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode(mode === 'structure' ? 'pan' : 'structure')}
        >
          <Home className="h-4 w-4 mr-1" /> Pin Structure
        </Button>
        <Button
          variant={mode === 'measure' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (mode === 'measure') {
              setMode('pan');
              setMeasurePts([]);
            } else {
              setMode('measure');
            }
          }}
        >
          <Ruler className="h-4 w-4 mr-1" /> Measure
        </Button>
        <div className="flex-1" />
        {jobAddress && (
          <Button variant="outline" size="sm" onClick={findAddress} title={jobAddress}>
            <Search className="h-4 w-4 mr-1" /> Job Address
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={myLocation}>
          <Crosshair className="h-4 w-4 mr-1" /> My Location
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            mutate((cur) => ({
              ...cur,
              baseLayer: cur.baseLayer === 'street' ? 'satellite' : 'street',
            }))
          }
        >
          <Layers className="h-4 w-4 mr-1" />
          {value.baseLayer === 'street' ? 'Satellite' : 'Street'}
        </Button>
      </div>

      {(mode !== 'pan' || busy) && (
        <div
          className={cn(
            'text-sm font-medium rounded-md px-3 py-2',
            busy ? 'bg-gray-100 text-gray-600' : 'bg-orange-50 text-safety-orange border border-orange-200',
          )}
        >
          {busy ??
            (mode === 'blast'
              ? 'Tap the map to place the blast location'
              : mode === 'structure'
                ? 'Tap the map to add a structure pin'
                : measurePts.length === 0
                  ? 'Tap two points to measure the distance'
                  : measurePts.length === 1
                    ? 'Tap the second point'
                    : 'Tap again to start a new measurement')}
        </div>
      )}

      {/* Map wrapper: compass overlay + Leaflet container.
          The container className MUST stay constant: Leaflet adds its own
          classes and any React className change wipes them (blank map).
          Cursor changes go through inline style. `isolate` traps Leaflet's
          internal z-indexes so controls never bleed over sticky headers. */}
      <div className="relative">
        <div
          ref={containerRef}
          className="h-80 rounded-lg border border-gray-300 z-0 isolate"
          style={{ cursor: mode !== 'pan' ? 'crosshair' : undefined }}
        />
        <div className="absolute top-2 right-2 h-9 w-9 rounded-full bg-gray-900/80 text-white flex flex-col items-center justify-center pointer-events-none z-10">
          <span className="text-[8px] leading-none">▲</span>
          <span className="text-[10px] font-bold leading-none">N</span>
        </div>
      </div>

      {/* Clone to sibling shots */}
      {onClone && cloneTargets && cloneTargets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cloneTargets.map((t) => (
            <Button key={t.id} variant="outline" size="sm" onClick={() => onClone(t.id)}>
              <Copy className="h-4 w-4 mr-1" /> Clone to {t.label}
            </Button>
          ))}
        </div>
      )}

      {/* Closest structure → compliance auto-fill */}
      {closest && (
        <div className="flex items-center justify-between bg-navy-50 rounded-lg px-3 py-2">
          <span className="text-sm">
            Closest structure: <b>{closest.pin.label}</b> —{' '}
            <span className="font-mono font-bold">{Math.round(closest.distance)} ft</span>
          </span>
          {onUseClosest && (
            <Button size="sm" onClick={() => onUseClosest(Math.round(closest.distance), closest.pin.label)}>
              Use for Compliance
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
