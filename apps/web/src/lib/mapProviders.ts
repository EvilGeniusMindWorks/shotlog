// Which map imagery the site map draws from, and the credit each source
// requires — shown in the map corner AND under every stored snapshot (the
// ArcGIS Location Platform agreement §3.1 d.4 requires an attribution
// statement on basemap output; OpenStreetMap's ODbL and USGS ask the same).
export const ARCGIS_KEY = (import.meta.env.VITE_ARCGIS_KEY as string | undefined) ?? '';

export const MAP_CREDIT = {
  street: '© OpenStreetMap contributors',
  satellite: ARCGIS_KEY
    ? 'Powered by Esri — Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    : 'Imagery: USDA, USGS The National Map',
} as const;

/** The credit line for a stored snapshot, by the base layer it was taken on */
export function snapshotCredit(baseLayer: 'street' | 'satellite' | undefined): string {
  return baseLayer === 'satellite' ? MAP_CREDIT.satellite : MAP_CREDIT.street;
}
