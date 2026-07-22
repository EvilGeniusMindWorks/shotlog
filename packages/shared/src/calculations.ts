// ══════════════════════════════════════════════════════
// CORE BLAST DESIGN CALCULATIONS
// ══════════════════════════════════════════════════════

/** Scaled Distance: SD = D / √W */
export function scaledDistance(distanceFt: number, chargeWeightLbs: number): number {
  if (chargeWeightLbs <= 0) return Infinity;
  return distanceFt / Math.sqrt(chargeWeightLbs);
}

/** Predicted PPV using site K factor: PPV = K × SD^(-1.6) */
export function predictedPPV(kFactor: number, sd: number): number {
  if (sd <= 0) return Infinity;
  return kFactor * Math.pow(sd, -1.6);
}

/** Derive K factor from actual readings: K = PPV × SD^1.6 */
export function derivedKFactor(actualPPV: number, sd: number): number {
  return actualPPV * Math.pow(sd, 1.6);
}

/** Maximum charge weight per delay for a given distance and target SD: W = (D / SD)² */
export function maxChargeWeight(distanceFt: number, targetSD: number): number {
  if (targetSD <= 0) return Infinity;
  return Math.pow(distanceFt / targetSD, 2);
}

/** Minimum safe distance for a given charge weight and target SD: D = SD × √W */
export function minSafeDistance(chargeWeightLbs: number, targetSD: number): number {
  return targetSD * Math.sqrt(chargeWeightLbs);
}

// ══════════════════════════════════════════════════════
// COMPLIANCE CHECKS
// ══════════════════════════════════════════════════════

/** USBM RI8507 frequency-dependent PPV limit (stepped curve) */
export function usbmRI8507Limit(frequencyHz: number): number {
  if (frequencyHz <= 4) return 0.5;
  if (frequencyHz <= 12) return 0.5 + (frequencyHz - 4) * (0.5 / 8);  // 0.5→1.0
  if (frequencyHz <= 30) return 1.0 + (frequencyHz - 12) * (1.0 / 18); // 1.0→2.0
  return 2.0;
}

/** OSM Regulations distance-dependent PPV limit */
export function osmPPVLimit(distanceFt: number): number {
  if (distanceFt <= 300) return 1.25;
  if (distanceFt <= 5000) return 1.00;
  return 0.75;
}

export type ComplianceStatus = 'compliant' | 'warning' | 'violation';

/** Check a PPV value against a limit, with 80% warning threshold */
function checkAgainstLimit(ppv: number, limit: number): ComplianceStatus {
  if (ppv > limit) return 'violation';
  if (ppv > limit * 0.8) return 'warning';
  return 'compliant';
}

/** Check against both USBM RI8507 and OSM standards */
export function checkCompliance(
  ppv: number,
  frequencyHz: number,
  distanceFt: number,
): {
  usbm: { status: ComplianceStatus; limit: number; actual: number };
  osm: { status: ComplianceStatus; limit: number; actual: number };
  overall: ComplianceStatus;
} {
  const usbmLimit = usbmRI8507Limit(frequencyHz);
  const osmLimit = osmPPVLimit(distanceFt);

  const usbm = { status: checkAgainstLimit(ppv, usbmLimit), limit: usbmLimit, actual: ppv };
  const osm = { status: checkAgainstLimit(ppv, osmLimit), limit: osmLimit, actual: ppv };

  const severity: Record<ComplianceStatus, number> = { compliant: 0, warning: 1, violation: 2 };
  const overall = severity[usbm.status] >= severity[osm.status] ? usbm.status : osm.status;

  return { usbm, osm, overall };
}

/** Determine applicable SD threshold by distance range (OSM table) */
export function osmSDThreshold(distanceFt: number): { sd: number; maxPoundsPerDelay: number } {
  if (distanceFt <= 300) {
    return { sd: 50, maxPoundsPerDelay: Math.pow(distanceFt / 50, 2) };
  }
  if (distanceFt <= 5000) {
    return { sd: 55, maxPoundsPerDelay: Math.pow(distanceFt / 55, 2) };
  }
  return { sd: 65, maxPoundsPerDelay: Math.pow(distanceFt / 65, 2) };
}

// ══════════════════════════════════════════════════════
// PATTERN & VOLUME CALCULATIONS
// ══════════════════════════════════════════════════════

/** Total square feet for a shot pattern */
export function totalSqFt(burdenFt: number, spacingFt: number, numHoles: number): number {
  return burdenFt * spacingFt * numHoles;
}

/** Average drill depth */
export function avgDrillDepth(totalFootage: number, numHoles: number): number {
  if (numHoles <= 0) return 0;
  return totalFootage / numHoles;
}

/** Cubic yards of rock per foot of blasthole */
export function cubicYardsPerFoot(burdenFt: number, spacingFt: number): number {
  return (burdenFt * spacingFt) / 27;
}

/** Total yards of rock for a shot */
export function totalYardsShot(
  burdenFt: number,
  spacingFt: number,
  totalDrillFootage: number,
): number {
  return cubicYardsPerFoot(burdenFt, spacingFt) * totalDrillFootage;
}

/** Powder factor (lbs explosive per cubic yard of rock) */
export function powderFactor(totalPoundsShot: number, totalYards: number): number {
  if (totalYards <= 0) return 0;
  return totalPoundsShot / totalYards;
}

/** Powder factor assessment */
export function powderFactorAssessment(pf: number): string {
  if (pf < 0.3) return 'Very light — may result in poor fragmentation';
  if (pf < 0.8) return 'Light — suitable for presplit or controlled blasting';
  if (pf < 1.5) return 'Normal — typical construction blasting';
  if (pf < 3.0) return 'Heavy — dense rock or high fragmentation needed';
  return 'Very heavy — verify loading design';
}

// ══════════════════════════════════════════════════════
// LOADING DENSITY CALCULATIONS (DynoNobel pages 9-10)
// ══════════════════════════════════════════════════════

/** Pounds of explosive per foot of blasthole: lbs/ft = 0.3405 × D² × ρ */
export function poundsPerFoot(
  explosiveDiameterInches: number,
  loadingDensityGcc: number,
): number {
  return 0.3405 * Math.pow(explosiveDiameterInches, 2) * loadingDensityGcc;
}

/** Kilograms of explosive per meter of blasthole: kg/m = 0.0007854 × D² × ρ */
export function kilogramsPerMeter(
  explosiveDiameterMM: number,
  loadingDensityGcc: number,
): number {
  return 0.0007854 * Math.pow(explosiveDiameterMM, 2) * loadingDensityGcc;
}

/** Total charge weight for a given column length */
export function chargeWeight(
  explosiveDiameterInches: number,
  loadingDensityGcc: number,
  columnLengthFt: number,
): number {
  return poundsPerFoot(explosiveDiameterInches, loadingDensityGcc) * columnLengthFt;
}

// ══════════════════════════════════════════════════════
// WET HOLE CALCULATIONS (DynoNobel page 13)
// ══════════════════════════════════════════════════════

/** Final water height after loading cartridges into a wet hole:
 *  FH = (H₀ × D_B²) / (D_B² - D_E²) */
export function finalWaterHeight(
  originalWaterHeightFt: number,
  boreholeDiameterInches: number,
  explosiveDiameterInches: number,
): number {
  const dB2 = Math.pow(boreholeDiameterInches, 2);
  const dE2 = Math.pow(explosiveDiameterInches, 2);
  if (dB2 <= dE2) return originalWaterHeightFt;
  return (originalWaterHeightFt * dB2) / (dB2 - dE2);
}

/** Number of cartridges needed to load above water line:
 *  N_E = (FH × 12) / L_E */
export function cartridgesToClearWater(
  finalWaterHeightFt: number,
  cartridgeLengthInches: number,
): number {
  if (cartridgeLengthInches <= 0) return 0;
  return Math.ceil((finalWaterHeightFt * 12) / cartridgeLengthInches);
}

// ══════════════════════════════════════════════════════
// TOTAL EXPLOSIVE WEIGHT
// ══════════════════════════════════════════════════════

/** Total explosive weight (sum all products) */
export function totalPoundsShot(products: { quantity: number; weightPerUnit: number }[]): number {
  return products.reduce((sum, p) => sum + p.quantity * p.weightPerUnit, 0);
}

// ══════════════════════════════════════════════════════
// TIME & LABOR CALCULATIONS
// ══════════════════════════════════════════════════════

/** Parse time string (HH:mm) to minutes since midnight */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Straight time calculation */
export function straightTime(timeIn: string, timeOut: string, otHours: number = 0): number {
  const inMin = parseTimeToMinutes(timeIn);
  const outMin = parseTimeToMinutes(timeOut);
  const totalHours = (outMin - inMin) / 60;
  return Math.max(0, totalHours - otHours);
}

/** Equipment hours used */
export function equipmentHoursUsed(hrsStart: number, hrsEnd: number): number {
  return Math.max(0, hrsEnd - hrsStart);
}

// ══════════════════════════════════════════════════════
// UNIT CONVERSIONS (DynoNobel page 11)
// ══════════════════════════════════════════════════════

export const conversions = {
  length: {
    ftToM: (ft: number) => ft * 0.3048,
    mToFt: (m: number) => m * 3.281,
    inToMM: (inches: number) => inches * 25.4,
    mmToIn: (mm: number) => mm / 25.4,
  },
  mass: {
    lbToKg: (lb: number) => lb * 0.4536,
    kgToLb: (kg: number) => kg * 2.2,
    shortTonToLb: (tons: number) => tons * 2000,
  },
  volume: {
    yd3ToM3: (yd3: number) => yd3 * 0.7646,
    m3ToYd3: (m3: number) => m3 * 1.31,
  },
  density: {
    gccToLbFt3: (gcc: number) => gcc * 62.43,
    lbFt3ToGcc: (lbft3: number) => lbft3 * 0.01602,
  },
  powderFactor: {
    lbYd3ToKgM3: (lbyd3: number) => lbyd3 * 0.593,
    kgM3ToLbYd3: (kgm3: number) => kgm3 * 1.686,
  },
  velocity: {
    inSToMmS: (ins: number) => ins * 25.4,
    mmSToInS: (mms: number) => mms / 25.4,
  },
  temperature: {
    fToC: (f: number) => (f - 32) * 0.556,
    cToF: (c: number) => c * 1.8 + 32,
  },
};
