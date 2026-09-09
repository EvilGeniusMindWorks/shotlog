import type L from 'leaflet';

/** The credit line, as small as the licences allow: no library prefix, small
 *  type, one trimmed line on a phone that expands on tap. "Powered by Esri"
 *  and the provider names (or the OSM credit) always stay visible — that is
 *  the condition the imagery is used under. */
export function compactAttribution(map: L.Map): void {
  const ctl = map.attributionControl;
  if (!ctl) return;
  ctl.setPrefix(false);
  const el = ctl.getContainer();
  if (!el) return;
  el.setAttribute('data-map-attribution', '');
  el.title = 'Tap for the full credit';
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    el.classList.toggle('is-expanded');
  });
}
