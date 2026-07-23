import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Home, Layers, MapPin, Search } from 'lucide-react';
import { cn, generateId } from '@/lib/utils';
import {
  closestStructure,
  distanceFt,
  type SiteDiagram,
} from '@/lib/siteDiagram';
import { Button } from '@/components/ui/button';

type PinMode = 'pan' | 'blast' | 'structure';

const TILE_LAYERS = {
  street: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
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
}

export function SiteDiagramEditor({ value, onChange, jobAddress, onUseClosest }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const pinsRef = useRef<L.LayerGroup | null>(null);
  const [mode, setMode] = useState<PinMode>('pan');
  const [busy, setBusy] = useState<string | null>(null);

  // Refs so map event handlers always see current state without re-binding
  const valueRef = useRef(value);
  valueRef.current = value;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const v = valueRef.current;
    const map = L.map(containerRef.current, {
      center: v.center ?? { lat: 42.44, lng: -72.63 }, // western MA fallback
      zoom: v.zoom,
      zoomControl: true,
    });
    mapRef.current = map;
    pinsRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const current = valueRef.current;
      const m = modeRef.current;
      if (m === 'blast') {
        onChangeRef.current({ ...current, blastPin: { lat: e.latlng.lat, lng: e.latlng.lng } });
        setMode('pan');
      } else if (m === 'structure') {
        onChangeRef.current({
          ...current,
          structures: [
            ...current.structures,
            {
              id: generateId(),
              lat: e.latlng.lat,
              lng: e.latlng.lng,
              label: `Structure ${current.structures.length + 1}`,
            },
          ],
        });
        setMode('pan');
      }
    });
    map.on('moveend zoomend', () => {
      const c = map.getCenter();
      onChangeRef.current({
        ...valueRef.current,
        center: { lat: c.lat, lng: c.lng },
        zoom: map.getZoom(),
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
    tileRef.current = L.tileLayer(spec.url, { attribution: spec.attribution, maxZoom: 19 }).addTo(map);
  }, [value.baseLayer]);

  // Redraw pins + distance lines whenever annotations change
  useEffect(() => {
    const pins = pinsRef.current;
    if (!pins) return;
    pins.clearLayers();
    const { blastPin, structures } = value;
    if (blastPin) {
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
      const current = valueRef.current;
      if (removeId === 'blast') {
        onChangeRef.current({ ...current, blastPin: null });
      } else {
        onChangeRef.current({
          ...current,
          structures: current.structures.filter((s) => s.id !== removeId),
        });
      }
      mapRef.current?.closePopup();
    };
    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, []);

  const flyTo = (lat: number, lng: number, zoom = 18) => {
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
            onChange({ ...value, baseLayer: value.baseLayer === 'street' ? 'satellite' : 'street' })
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
              : 'Tap the map to add a structure pin')}
        </div>
      )}

      {/* Map */}
      <div
        ref={containerRef}
        className={cn(
          'h-80 rounded-lg border border-gray-300 z-0',
          mode !== 'pan' && 'cursor-crosshair',
        )}
      />

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
