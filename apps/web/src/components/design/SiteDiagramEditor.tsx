import { encodeCanvasJpeg } from '@/lib/imageCompress';
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
import { Input } from '@/components/ui/input';
import { parseCoordinates, searchAddress, formatLatLng, type GeoCandidate } from '@/lib/geo';
import { ARCGIS_KEY, MAP_CREDIT } from '@/lib/mapProviders';
import { compactAttribution } from '@/lib/mapAttribution';

type PinMode = 'pan' | 'blast' | 'structure' | 'measure';

const TILE_LAYERS = {
  street: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: MAP_CREDIT.street,
    // OSM serves tiles at every zoom we allow
    maxNativeZoom: 19,
  },
  satellite: ARCGIS_KEY
    ? {
        // Esri World Imagery through a keyed ArcGIS Location Platform endpoint
        // (licensed for a commercial app; 2M tiles/month free). Set
        // VITE_ARCGIS_KEY in the web build to turn this on.
        url: `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_KEY}`,
        attribution: MAP_CREDIT.satellite,
        // rural New England has no tiles above ~z17; upscale from there
        maxNativeZoom: 17,
      }
    : {
        // USGS National Map orthoimagery (NAIP and partners): US government
        // work, public domain — safe to snapshot into the shot record and the
        // customer's PDF. No key, but the cached tiles stop at z16 in
        // Massachusetts (z17+ is a slow 404), so upscale from z16.
        url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
        attribution: MAP_CREDIT.satellite,
        maxNativeZoom: 16,
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
  /** The site's remembered spot (site.geo) and a way to save one (site-map round, 2026-09-09) */
  siteSpot?: { lat: number; lng: number } | null;
  siteName?: string;
  onSaveSiteSpot?: (spot: { lat: number; lng: number }) => void | Promise<void>;
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

    // JPEG: satellite imagery compresses ~8× better than PNG. Capped at
    // 1280 px / 0.7 (sync-volume round, 2026-09-08): this snapshot rides in
    // the shot record and is re-sent on every shot edit — ~10 KB, not ~35.
    return await encodeCanvasJpeg(canvas);
  } catch {
    return null; // tainted canvas or transient failure — skip this snapshot
  }
}

export function SiteDiagramEditor({
  value,
  onChange,
  jobAddress,
  siteSpot,
  siteName,
  onSaveSiteSpot,
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
  // ── Location bar (site-map round): four doors to the spot ──
  const [where, setWhere] = useState('');
  const [candidates, setCandidates] = useState<GeoCandidate[] | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [showLatLng, setShowLatLng] = useState(false);
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const gpsWatch = useRef<number | null>(null);
  const [openedOn, setOpenedOn] = useState<string>(value.center ? "this shot's map" : '');
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
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

  const scheduleSnapshotRef = useRef<(() => void) | null>(null);
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

  // Self-heal: refresh the stored snapshot whenever the designer opens with
  // pins present — repairs any stale/corrupted snapshot just by visiting
  useEffect(() => {
    if (liveRef.current.blastPin || liveRef.current.structures.length > 0) {
      scheduleSnapshotRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutate = (updater: (v: SiteDiagram) => SiteDiagram) => {
    const next = updater(liveRef.current);
    liveRef.current = next; // later events in the same tick see the new state
    onChangeRef.current(next);
    scheduleSnapshot();
  };
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  // Opening order (site-map round): this shot's saved centre → the site's
  // spot → the job's address (searched once, quietly) → western MA. The site
  // and the address can arrive a beat after the map mounts — run it again then.
  const openedRef = useRef<'none' | 'fallback' | 'real'>('none');
  const openOn = () => {
    const map = mapRef.current;
    if (!map || liveRef.current.center || openedRef.current === 'real') return;
    if (siteSpot) {
      map.setView([siteSpot.lat, siteSpot.lng], 17);
      setOpenedOn("the site's spot");
      if (liveRef.current.baseLayer !== 'satellite') mutateRef.current((cur) => ({ ...cur, baseLayer: 'satellite' }));
      openedRef.current = 'real';
      return;
    }
    if (jobAddress && navigator.onLine) {
      openedRef.current = 'real';
      setOpenedOn("the job's address…");
      void searchAddress(jobAddress, { limit: 1 }).then(({ candidates: found }) => {
        if (openedRef.current !== 'real' || liveRef.current.center) return;
        if (found[0] && mapRef.current) {
          mapRef.current.setView([found[0].lat, found[0].lng], 16);
          setOpenedOn("the job's address");
        } else setOpenedOn('western Massachusetts — the address was not found');
      });
      return;
    }
    openedRef.current = 'fallback';
    setOpenedOn(jobAddress ? 'western Massachusetts — no signal to find the address' : 'western Massachusetts — the job has no address yet');
  };
  const openOnRef = useRef(openOn);
  openOnRef.current = openOn;
  useEffect(() => {
    openOnRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteSpot?.lat, siteSpot?.lng, jobAddress]);
  scheduleSnapshotRef.current = scheduleSnapshot;

  // Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const v = liveRef.current;
    const map = L.map(containerRef.current, {
      center: v.center ?? { lat: 42.44, lng: -72.63 }, // western MA fallback
      zoom: v.zoom,
      zoomControl: true,
    });
    compactAttribution(map);
    mapRef.current = map;
    pinsRef.current = L.layerGroup().addTo(map);
    // The container can be mid-layout when the map mounts — recalc once settled
    window.setTimeout(() => map.invalidateSize(), 100);
    if (!v.center) openOnRef.current();

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

  /** The bar's Go: coordinates fly straight there; anything else is searched */
  const go = async (text = where) => {
    const q = text.trim();
    if (!q) return;
    const coords = parseCoordinates(q);
    if (coords) {
      flyTo(coords.lat, coords.lng, 17);
      setCandidates(null);
      setOpenedOn(`coordinates ${formatLatLng(coords)}`);
      return;
    }
    if (!online) {
      setBusy('No signal — search needs one. Coordinates, GPS and the saved spot still work.');
      window.setTimeout(() => setBusy(null), 2500);
      return;
    }
    setBusy('Searching…');
    try {
      const { candidates: found, fellBack: fb } = await searchAddress(q);
      setFellBack(fb);
      if (found.length === 0) {
        setCandidates([]);
      } else if (found.length === 1) {
        flyTo(found[0].lat, found[0].lng, 16);
        setCandidates(null);
        setOpenedOn(found[0].label);
      } else {
        setCandidates(found);
      }
    } catch {
      setBusy('Search failed');
    } finally {
      setBusy(null);
    }
  };
  const pick = (c: GeoCandidate) => {
    flyTo(c.lat, c.lng, 16);
    setCandidates(null);
    setOpenedOn(c.label);
  };
  const findAddress = () => {
    if (!jobAddress) return;
    setWhere(jobAddress);
    void go(jobAddress);
  };
  const goToSiteSpot = () => {
    if (!siteSpot) return;
    flyTo(siteSpot.lat, siteSpot.lng, 17);
    setOpenedOn("the site's spot");
  };

  /** My GPS: watch for up to ten seconds so the fix can improve; "Use this" takes it */
  const myLocation = () => {
    if (!navigator.geolocation) {
      setBusy('This device has no location service');
      window.setTimeout(() => setBusy(null), 2000);
      return;
    }
    if (gpsWatch.current != null) navigator.geolocation.clearWatch(gpsWatch.current);
    setGps(null);
    setBusy('Locating…');
    gpsWatch.current = navigator.geolocation.watchPosition(
      (pos) => {
        setBusy(null);
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {
        setBusy('Location unavailable');
        window.setTimeout(() => setBusy(null), 2000);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
    window.setTimeout(() => {
      if (gpsWatch.current != null) navigator.geolocation.clearWatch(gpsWatch.current);
      gpsWatch.current = null;
    }, 10_000);
  };
  const useGps = () => {
    if (!gps) return;
    flyTo(gps.lat, gps.lng, 17);
    setOpenedOn(`my GPS (±${Math.round(gps.accuracy)} m)`);
    setGps(null);
  };
  const goLatLng = () => {
    const c = parseCoordinates(`${latText}, ${lngText}`);
    if (!c) {
      setBusy('Latitude and longitude as numbers, e.g. 42.4412 and -72.6321');
      window.setTimeout(() => setBusy(null), 2500);
      return;
    }
    flyTo(c.lat, c.lng, 17);
    setOpenedOn(`coordinates ${formatLatLng(c)}`);
    setShowLatLng(false);
  };
  const saveSiteSpot = async () => {
    if (!onSaveSiteSpot) return;
    const p = value.blastPin ?? value.center;
    if (!p) return;
    await onSaveSiteSpot({ lat: p.lat, lng: p.lng });
    setBusy(`Saved as ${siteName ? `${siteName}'s` : "the site's"} spot — the next shot here opens on it`);
    window.setTimeout(() => setBusy(null), 2500);
  };

  const closest = closestStructure(value);

  return (
    <div className="space-y-2">
      {/* Location bar — four doors to the spot (site-map round, 2026-09-09) */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1.5" data-location-bar>
        <div className="flex items-center gap-2">
          <Input
            value={where}
            placeholder="Address, place, or 42.4412, -72.6321"
            aria-label="Where is the shot?"
            data-location-input
            onChange={(e) => setWhere(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void go();
            }}
          />
          <Button size="sm" onClick={() => void go()} data-location-go disabled={!where.trim()}>
            Go
          </Button>
        </div>
        {candidates && candidates.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-white divide-y divide-gray-100" data-location-candidates>
            {fellBack && <p className="px-3 py-1 text-[11px] text-gray-500">Found by street and town (the free-text search had nothing)</p>}
            {candidates.map((c, i) => (
              <button key={i} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => pick(c)} data-location-candidate={i}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {candidates && candidates.length === 0 && (
          <p className="text-xs text-gray-500" data-location-none>
            Nothing found — try the town on its own, coordinates, or My GPS, then drag the blast pin.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {jobAddress && (
            <Button variant="outline" size="sm" onClick={findAddress} title={jobAddress} data-location-job>
              <Search className="h-4 w-4 mr-1" /> Job's address
            </Button>
          )}
          {siteSpot && (
            <Button variant="outline" size="sm" onClick={goToSiteSpot} data-location-site>
              <MapPin className="h-4 w-4 mr-1" /> {siteName ? `${siteName}'s spot` : "Site's spot"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={myLocation} data-location-gps>
            <Crosshair className="h-4 w-4 mr-1" /> My GPS
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowLatLng((v) => !v)} data-location-latlng>
            Coordinates…
          </Button>
          {onSaveSiteSpot && (value.blastPin || value.center) && (
            <Button variant="outline" size="sm" onClick={() => void saveSiteSpot()} data-location-save-spot>
              Save as {siteName ? `${siteName}'s` : "the site's"} spot
            </Button>
          )}
        </div>
        {gps && (
          <div className="flex items-center gap-2 text-xs text-gray-600" data-location-gps-fix>
            GPS fix {formatLatLng(gps)} · ±{Math.round(gps.accuracy)} m{gps.accuracy > 30 ? ' — wait a moment for a better one, or' : ' —'}
            <Button size="sm" className="h-7" onClick={useGps} data-location-gps-use>Use this</Button>
          </div>
        )}
        {showLatLng && (
          <div className="flex items-center gap-2" data-location-latlng-form>
            <Input className="w-36" inputMode="decimal" placeholder="Latitude 42.4412" aria-label="Latitude" value={latText} onChange={(e) => setLatText(e.target.value)} data-location-lat />
            <Input className="w-36" inputMode="decimal" placeholder="Longitude -72.6321" aria-label="Longitude" value={lngText} onChange={(e) => setLngText(e.target.value)} data-location-lng />
            <Button size="sm" onClick={goLatLng} data-location-latlng-go>Go</Button>
          </div>
        )}
        <p className="text-[11px] text-gray-500" data-location-opened>
          {openedOn ? `Opened on ${openedOn}.` : ''}{!online ? ' No signal — search needs one; coordinates, GPS and the saved spot work.' : ''} Then drag the blast pin to the exact spot — the pin is what the record keeps.
        </p>
      </div>

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
