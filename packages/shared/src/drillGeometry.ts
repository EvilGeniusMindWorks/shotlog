// Kick geometry for angled holes. The blaster plans a hole as a VERTICAL
// depth plus a horizontal "kick" — how far the bottom of the hole lands
// from the collar, and in which compass direction. The rig drills at an
// angle, so the string is longer than the vertical depth; both the angle
// and the true length are DERIVED here (never stored) so plan and log
// always agree.

export type KickDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export const KICK_DIRECTIONS: readonly KickDirection[] = [
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
];

/** Angle from vertical, in degrees, for a hole with the given vertical
 *  depth and horizontal kick (both ft). Zero/absent kick → 0°. */
export function deriveDrillAngle(verticalDepth: number, kick: number | undefined): number {
  if (!kick || verticalDepth <= 0) return 0;
  return (Math.atan2(kick, verticalDepth) * 180) / Math.PI;
}

/** True drill-string length (ft) along the angle — what the driller
 *  actually drills to reach the planned vertical depth. */
export function deriveHoleLength(verticalDepth: number, kick: number | undefined): number {
  if (verticalDepth <= 0) return 0;
  if (!kick) return verticalDepth;
  return Math.sqrt(verticalDepth * verticalDepth + kick * kick);
}
