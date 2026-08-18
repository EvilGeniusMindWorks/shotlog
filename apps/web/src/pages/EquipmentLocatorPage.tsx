// Where's my equipment (Round 4, shop study §2): list + map split on wide,
// list/map toggle on phone. Locations derive passively from filed
// paperwork (lib/equipmentLocation); pins from one-time site geocodes.
// No GPS hardware involved.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft } from 'lucide-react';
import { db, useLiveQuery } from '@/db';
import {
  buildAssetLocations,
  geocodeSite,
  markAtYard,
  staleness,
  type AssetLocation,
} from '@/lib/equipmentLocation';
import { showToast } from '@/components/ui/undo-toast';
import { formatDate } from '@/lib/utils';

const PIN_COLORS = { down: '#c53030', stale: '#b7791f', fresh: '#1a365d' } as const;

function pinIcon(text: string, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="min-width:30px;height:24px;border-radius:7px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:10px;font-family:ui-monospace,Menlo,monospace;padding:0 4px;">${text}</div>`,
    iconSize: [30, 24],
    iconAnchor: [15, 24],
  });
}

interface Pinned {
  loc: AssetLocation;
  geo: { lat: number; lng: number };
}

export function LocatorMap({
  pinned,
  focusId,
  compact,
}: {
  pinned: Pinned[];
  focusId?: string;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: !compact, attributionControl: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxNativeZoom: 19,
    }).addTo(map);
    map.setView([42.3, -72.6], 9);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    // The yard collects its machines into one pin
    const yard = pinned.filter((p) => p.loc.kind === 'yard');
    const sites = pinned.filter((p) => p.loc.kind !== 'yard');
    const bounds: L.LatLngTuple[] = [];
    for (const p of sites) {
      const tone = p.loc.down
        ? PIN_COLORS.down
        : staleness(p.loc.ageDays) === 'stale'
          ? PIN_COLORS.stale
          : PIN_COLORS.fresh;
      L.marker([p.geo.lat, p.geo.lng], {
        icon: pinIcon(p.loc.equipment.assetNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 5), tone),
      })
        .bindTooltip(`${p.loc.label}${p.loc.ageDays != null ? ` · ${p.loc.ageDays} d` : ''}`)
        .addTo(layer);
      bounds.push([p.geo.lat, p.geo.lng]);
    }
    if (yard.length > 0) {
      const g = yard[0].geo;
      L.marker([g.lat, g.lng], { icon: pinIcon(`+${yard.length}`, '#5c6b7a') })
        .bindTooltip('The yard')
        .addTo(layer);
      bounds.push([g.lat, g.lng]);
    }
    const focus = pinned.find((p) => p.loc.equipment.id === focusId);
    if (focus) map.flyTo([focus.geo.lat, focus.geo.lng], 13);
    else if (bounds.length > 0) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }, [pinned, focusId]);

  // Toggled/laid-out containers need a size kick or tiles stay blank
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 150);
    return () => clearTimeout(t);
  });

  // NEVER a dynamic className on the Leaflet container (React rewrites the
  // attribute and wipes Leaflet's own classes, blanking the tiles)
  return (
    <div
      ref={containerRef}
      className="locator-map"
      style={{ minHeight: compact ? 180 : 320, height: '100%', borderRadius: 12, overflow: 'hidden' }}
    />
  );
}

/** Locations + resolved pins (site geo → cache → geocode when online) */
export function useLocatorData() {
  const locations = useLiveQuery(buildAssetLocations, []);
  const [pinned, setPinned] = useState<Pinned[]>([]);
  useEffect(() => {
    let dead = false;
    (async () => {
      if (!locations) return;
      const out: Pinned[] = [];
      // The yard = the company's own address, geocoded once like a site
      const settings = (await db.companySettings.toArray())[0];
      let yardGeo: { lat: number; lng: number } | null = null;
      if (settings?.address) {
        yardGeo = await geocodeSite({
          id: 'company-yard',
          address: settings.address,
          city: settings.city,
          state: settings.state,
        } as never);
      }
      for (const loc of locations) {
        if (loc.kind === 'yard' && yardGeo) {
          out.push({ loc, geo: yardGeo });
        } else if (loc.kind === 'site' && loc.siteId) {
          const site = await db.sites.get(loc.siteId);
          const geo = site ? await geocodeSite(site) : null;
          if (geo) out.push({ loc, geo });
        }
      }
      if (!dead) setPinned(out);
    })();
    return () => {
      dead = true;
    };
  }, [locations]);
  return { locations, pinned };
}

function LocRow({
  loc,
  selected,
  onSelect,
}: {
  loc: AssetLocation;
  selected: boolean;
  onSelect: () => void;
}) {
  const s = staleness(loc.ageDays);
  const chip = loc.down
    ? { text: 'down', cls: 'bg-red-100 text-red-700' }
    : loc.kind === 'yard'
      ? { text: 'yard', cls: 'bg-gray-100 text-gray-600' }
      : loc.ageDays == null
        ? { text: '—', cls: 'bg-gray-100 text-gray-500' }
        : {
            text: loc.ageDays === 0 ? 'today' : `${loc.ageDays} d`,
            cls:
              s === 'fresh'
                ? 'bg-green-100 text-green-700'
                : s === 'aging'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700',
          };
  return (
    <div className={'rounded-lg ' + (selected ? 'bg-blue-50' : '')}>
      <button className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-gray-50 rounded-lg" onClick={onSelect}>
        <span className="font-mono font-bold text-xs bg-blue-50 text-navy rounded-lg px-2 py-0.5 shrink-0">
          {loc.equipment.assetNumber}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{loc.label}</p>
          <p className="text-xs text-gray-400 truncate">
            {loc.source}
            {loc.when && ` · ${formatDate(loc.when)}`}
            {s === 'stale' && loc.kind === 'site' && ' — mark at the yard?'}
          </p>
        </div>
        <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 shrink-0 ${chip.cls}`}>
          {chip.text}
        </span>
      </button>
      {selected && <LocActions loc={loc} />}
    </div>
  );
}

function LocActions({ loc }: { loc: AssetLocation }) {
  const navigate = useNavigate();
  return (
    <div className="flex gap-2 px-1 pb-2">
      {loc.kind !== 'yard' && (
        <button
          className="text-xs font-semibold text-navy border border-gray-300 bg-white rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
          onClick={() => {
            void markAtYard(loc.equipment).then(() =>
              showToast(`${loc.equipment.assetNumber} marked at the yard`),
            );
          }}
        >
          Mark at the yard
        </button>
      )}
      <button
        className="text-xs font-semibold text-navy border border-gray-300 bg-white rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
        onClick={() => navigate(`/equipment/${loc.equipment.id}`)}
      >
        Open {loc.equipment.assetNumber}
      </button>
    </div>
  );
}

export function EquipmentLocatorPage() {
  const navigate = useNavigate();
  const { locations, pinned } = useLocatorData();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [phoneView, setPhoneView] = useState<'list' | 'map'>('list');
  const list = useMemo(() => locations ?? [], [locations]);

  return (
    <div>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg leading-tight">Where's my equipment</h2>
            <p className="text-xs text-navy-200">
              from filed paperwork — last record → job → site · no GPS
            </p>
          </div>
          {/* phone toggle */}
          <div className="flex lg:hidden rounded-lg border border-white/30 overflow-hidden text-xs font-bold">
            {(['list', 'map'] as const).map((v) => (
              <button
                key={v}
                className={phoneView === v ? 'px-3 py-1.5 bg-white text-navy' : 'px-3 py-1.5 text-white'}
                onClick={() => setPhoneView(v)}
              >
                {v === 'list' ? 'List' : 'Map'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4">
        <div className="lg:grid lg:grid-cols-[46%_1fr] lg:gap-4 lg:items-start">
          <div className={phoneView === 'map' ? 'hidden lg:block' : ''}>
            <div className="bg-white border border-gray-200 rounded-xl px-2 py-2">
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1 px-1">
                By last record
              </p>
              {list.map((loc) => (
                <LocRow
                  key={loc.equipment.id}
                  loc={loc}
                  selected={selectedId === loc.equipment.id}
                  onSelect={() =>
                    setSelectedId(selectedId === loc.equipment.id ? undefined : loc.equipment.id)
                  }
                />
              ))}
              {locations !== undefined && list.length === 0 && (
                <p className="text-sm text-gray-400 py-2 px-1">No active equipment.</p>
              )}
            </div>
          </div>
          <div className={(phoneView === 'list' ? 'hidden lg:block ' : '') + 'mt-4 lg:mt-0 h-[420px]'}>
            <LocatorMap pinned={pinned} focusId={selectedId} />
            <p className="text-[11px] text-gray-400 mt-1">
              Pins from site coordinates — a one-time address geocode saved to the site, offline
              after. The yard collects its machines into one pin.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
