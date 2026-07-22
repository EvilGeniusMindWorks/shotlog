import { describe, it, expect } from 'vitest';
import {
  scaledDistance,
  predictedPPV,
  derivedKFactor,
  maxChargeWeight,
  minSafeDistance,
  usbmRI8507Limit,
  osmPPVLimit,
  checkCompliance,
  osmSDThreshold,
  totalSqFt,
  avgDrillDepth,
  cubicYardsPerFoot,
  totalYardsShot,
  powderFactor,
  powderFactorAssessment,
  poundsPerFoot,
  kilogramsPerMeter,
  chargeWeight,
  finalWaterHeight,
  cartridgesToClearWater,
  totalPoundsShot,
  parseTimeToMinutes,
  straightTime,
  equipmentHoursUsed,
  conversions,
} from './calculations';

// ══════════════════════════════════════════════════════
// CORE BLAST DESIGN CALCULATIONS
// ══════════════════════════════════════════════════════

describe('scaledDistance', () => {
  it('calculates SD = D / √W', () => {
    // 100 ft, 25 lbs → SD = 100/5 = 20
    expect(scaledDistance(100, 25)).toBe(20);
  });

  it('returns Infinity for zero charge weight', () => {
    expect(scaledDistance(100, 0)).toBe(Infinity);
  });

  it('returns Infinity for negative charge weight', () => {
    expect(scaledDistance(100, -5)).toBe(Infinity);
  });

  it('handles zero distance', () => {
    expect(scaledDistance(0, 25)).toBe(0);
  });

  it('handles very large values', () => {
    const result = scaledDistance(10000, 1);
    expect(result).toBe(10000);
  });

  it('handles fractional values', () => {
    expect(scaledDistance(500, 16)).toBeCloseTo(125, 5);
  });
});

describe('predictedPPV', () => {
  it('calculates PPV = K × SD^(-1.6)', () => {
    const result = predictedPPV(180, 50);
    const expected = 180 * Math.pow(50, -1.6);
    expect(result).toBeCloseTo(expected, 10);
  });

  it('returns Infinity for zero SD', () => {
    expect(predictedPPV(180, 0)).toBe(Infinity);
  });

  it('returns Infinity for negative SD', () => {
    expect(predictedPPV(180, -1)).toBe(Infinity);
  });

  it('higher K produces higher PPV', () => {
    const ppv1 = predictedPPV(100, 50);
    const ppv2 = predictedPPV(200, 50);
    expect(ppv2).toBeGreaterThan(ppv1);
  });

  it('higher SD produces lower PPV', () => {
    const ppv1 = predictedPPV(180, 30);
    const ppv2 = predictedPPV(180, 60);
    expect(ppv2).toBeLessThan(ppv1);
  });
});

describe('derivedKFactor', () => {
  it('calculates K = PPV × SD^1.6', () => {
    const result = derivedKFactor(0.5, 50);
    const expected = 0.5 * Math.pow(50, 1.6);
    expect(result).toBeCloseTo(expected, 10);
  });

  it('round-trips with predictedPPV', () => {
    const k = 180;
    const sd = 50;
    const ppv = predictedPPV(k, sd);
    const derivedK = derivedKFactor(ppv, sd);
    expect(derivedK).toBeCloseTo(k, 8);
  });

  it('handles zero PPV', () => {
    expect(derivedKFactor(0, 50)).toBe(0);
  });

  it('handles zero SD', () => {
    expect(derivedKFactor(0.5, 0)).toBe(0);
  });
});

describe('maxChargeWeight', () => {
  it('calculates W = (D / SD)²', () => {
    // D=500, SD=50 → W = (500/50)² = 100
    expect(maxChargeWeight(500, 50)).toBe(100);
  });

  it('returns Infinity for zero target SD', () => {
    expect(maxChargeWeight(500, 0)).toBe(Infinity);
  });

  it('handles zero distance', () => {
    expect(maxChargeWeight(0, 50)).toBe(0);
  });

  it('handles large distances', () => {
    const result = maxChargeWeight(5000, 50);
    expect(result).toBe(10000);
  });
});

describe('minSafeDistance', () => {
  it('calculates D = SD × √W', () => {
    // SD=50, W=100 → D = 50 × 10 = 500
    expect(minSafeDistance(100, 50)).toBe(500);
  });

  it('handles zero charge weight', () => {
    expect(minSafeDistance(0, 50)).toBe(0);
  });

  it('handles zero SD', () => {
    expect(minSafeDistance(100, 0)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════
// COMPLIANCE CHECKS
// ══════════════════════════════════════════════════════

describe('usbmRI8507Limit', () => {
  it('returns 0.5 at 1 Hz', () => {
    expect(usbmRI8507Limit(1)).toBe(0.5);
  });

  it('returns 0.5 at exactly 4 Hz', () => {
    expect(usbmRI8507Limit(4)).toBe(0.5);
  });

  it('interpolates between 4-12 Hz', () => {
    // At 8 Hz: 0.5 + (8-4)*(0.5/8) = 0.5 + 0.25 = 0.75
    expect(usbmRI8507Limit(8)).toBeCloseTo(0.75, 10);
  });

  it('returns 1.0 at exactly 12 Hz', () => {
    expect(usbmRI8507Limit(12)).toBeCloseTo(1.0, 10);
  });

  it('interpolates between 12-30 Hz', () => {
    // At 21 Hz: 1.0 + (21-12)*(1.0/18) = 1.0 + 0.5 = 1.5
    expect(usbmRI8507Limit(21)).toBeCloseTo(1.5, 10);
  });

  it('returns 2.0 at exactly 30 Hz', () => {
    expect(usbmRI8507Limit(30)).toBeCloseTo(2.0, 10);
  });

  it('returns 2.0 above 30 Hz', () => {
    expect(usbmRI8507Limit(50)).toBe(2.0);
    expect(usbmRI8507Limit(100)).toBe(2.0);
  });

  it('returns 0.5 for very low frequencies', () => {
    expect(usbmRI8507Limit(0.1)).toBe(0.5);
  });

  it('returns 0.5 for negative frequencies', () => {
    expect(usbmRI8507Limit(-1)).toBe(0.5);
  });

  it('handles boundary just above 4 Hz', () => {
    const limit = usbmRI8507Limit(4.001);
    expect(limit).toBeGreaterThan(0.5);
    expect(limit).toBeLessThan(0.501);
  });

  it('handles boundary just below 12 Hz', () => {
    const limit = usbmRI8507Limit(11.999);
    expect(limit).toBeLessThan(1.0);
    expect(limit).toBeGreaterThan(0.999);
  });

  it('handles boundary just above 30 Hz', () => {
    expect(usbmRI8507Limit(30.001)).toBe(2.0);
  });
});

describe('osmPPVLimit', () => {
  it('returns 1.25 for distances ≤ 300 ft', () => {
    expect(osmPPVLimit(100)).toBe(1.25);
    expect(osmPPVLimit(300)).toBe(1.25);
  });

  it('returns 1.00 for distances 301–5000 ft', () => {
    expect(osmPPVLimit(301)).toBe(1.00);
    expect(osmPPVLimit(5000)).toBe(1.00);
  });

  it('returns 0.75 for distances > 5000 ft', () => {
    expect(osmPPVLimit(5001)).toBe(0.75);
    expect(osmPPVLimit(10000)).toBe(0.75);
  });

  it('handles zero distance', () => {
    expect(osmPPVLimit(0)).toBe(1.25);
  });

  it('handles negative distance', () => {
    expect(osmPPVLimit(-100)).toBe(1.25);
  });

  it('handles boundary at exactly 300', () => {
    expect(osmPPVLimit(300)).toBe(1.25);
  });

  it('handles boundary at exactly 5000', () => {
    expect(osmPPVLimit(5000)).toBe(1.00);
  });
});

describe('checkCompliance', () => {
  it('returns compliant for low PPV', () => {
    const result = checkCompliance(0.1, 10, 500);
    expect(result.usbm.status).toBe('compliant');
    expect(result.osm.status).toBe('compliant');
    expect(result.overall).toBe('compliant');
  });

  it('returns violation for high PPV at low frequency', () => {
    // USBM limit at 3 Hz = 0.5
    const result = checkCompliance(0.6, 3, 200);
    expect(result.usbm.status).toBe('violation');
  });

  it('returns warning at 80% of limit', () => {
    // USBM limit at 50Hz = 2.0, 80% = 1.6
    const result = checkCompliance(1.7, 50, 200);
    expect(result.usbm.status).toBe('warning');
  });

  it('returns compliant just below 80% threshold', () => {
    // OSM limit at 200 ft = 1.25, 80% = 1.0
    const result = checkCompliance(0.99, 50, 200);
    expect(result.osm.status).toBe('compliant');
  });

  it('returns violation at exactly the limit + epsilon', () => {
    const result = checkCompliance(1.2501, 50, 200);
    expect(result.osm.status).toBe('violation');
  });

  it('overall is the most restrictive', () => {
    // USBM compliant but OSM violation
    const result = checkCompliance(1.1, 50, 5001);
    // USBM limit at 50Hz = 2.0 → compliant (1.1 < 1.6)
    // OSM limit at 5001ft = 0.75 → violation (1.1 > 0.75)
    expect(result.usbm.status).toBe('compliant');
    expect(result.osm.status).toBe('violation');
    expect(result.overall).toBe('violation');
  });

  it('includes actual and limit values', () => {
    const result = checkCompliance(0.5, 8, 200);
    expect(result.usbm.actual).toBe(0.5);
    expect(result.usbm.limit).toBeCloseTo(0.75, 5);
    expect(result.osm.actual).toBe(0.5);
    expect(result.osm.limit).toBe(1.25);
  });
});

describe('osmSDThreshold', () => {
  it('uses SD=50 for distances ≤ 300 ft', () => {
    const result = osmSDThreshold(200);
    expect(result.sd).toBe(50);
    expect(result.maxPoundsPerDelay).toBeCloseTo(16, 5);
  });

  it('uses SD=55 for distances 301–5000 ft', () => {
    const result = osmSDThreshold(550);
    expect(result.sd).toBe(55);
    expect(result.maxPoundsPerDelay).toBeCloseTo(100, 5);
  });

  it('uses SD=65 for distances > 5000 ft', () => {
    const result = osmSDThreshold(6500);
    expect(result.sd).toBe(65);
    expect(result.maxPoundsPerDelay).toBeCloseTo(10000, 5);
  });

  it('boundary at 300 ft', () => {
    const result = osmSDThreshold(300);
    expect(result.sd).toBe(50);
    expect(result.maxPoundsPerDelay).toBeCloseTo(36, 5);
  });

  it('boundary at 5000 ft', () => {
    const result = osmSDThreshold(5000);
    expect(result.sd).toBe(55);
  });

  it('boundary at 5001 ft', () => {
    const result = osmSDThreshold(5001);
    expect(result.sd).toBe(65);
  });
});

// ══════════════════════════════════════════════════════
// PATTERN & VOLUME CALCULATIONS
// ══════════════════════════════════════════════════════

describe('totalSqFt', () => {
  it('calculates burden × spacing × numHoles', () => {
    expect(totalSqFt(8, 10, 20)).toBe(1600);
  });

  it('returns 0 when numHoles is 0', () => {
    expect(totalSqFt(8, 10, 0)).toBe(0);
  });

  it('handles zero burden', () => {
    expect(totalSqFt(0, 10, 20)).toBe(0);
  });

  it('handles very large patterns', () => {
    expect(totalSqFt(12, 14, 500)).toBe(84000);
  });
});

describe('avgDrillDepth', () => {
  it('calculates totalFootage / numHoles', () => {
    expect(avgDrillDepth(400, 20)).toBe(20);
  });

  it('returns 0 for zero holes', () => {
    expect(avgDrillDepth(400, 0)).toBe(0);
  });

  it('returns 0 for negative holes', () => {
    expect(avgDrillDepth(400, -5)).toBe(0);
  });

  it('handles zero footage', () => {
    expect(avgDrillDepth(0, 20)).toBe(0);
  });
});

describe('cubicYardsPerFoot', () => {
  it('calculates (burden × spacing) / 27', () => {
    // 9 × 9 / 27 = 3
    expect(cubicYardsPerFoot(9, 9)).toBe(3);
  });

  it('handles zero values', () => {
    expect(cubicYardsPerFoot(0, 10)).toBe(0);
  });

  it('handles non-integer result', () => {
    expect(cubicYardsPerFoot(8, 10)).toBeCloseTo(2.963, 2);
  });
});

describe('totalYardsShot', () => {
  it('calculates correctly', () => {
    // 9 × 9 = 81 sqft, 81/27 = 3 yd³/ft, × 200ft = 600 yd³
    expect(totalYardsShot(9, 9, 200)).toBeCloseTo(600, 5);
  });

  it('handles zero drill footage', () => {
    expect(totalYardsShot(9, 9, 0)).toBe(0);
  });
});

describe('powderFactor', () => {
  it('calculates lbs/yd³', () => {
    expect(powderFactor(600, 600)).toBe(1);
  });

  it('returns 0 for zero yards', () => {
    expect(powderFactor(100, 0)).toBe(0);
  });

  it('returns 0 for negative yards', () => {
    expect(powderFactor(100, -10)).toBe(0);
  });
});

describe('powderFactorAssessment', () => {
  it('returns very light for < 0.3', () => {
    expect(powderFactorAssessment(0.2)).toContain('Very light');
  });

  it('returns light for 0.3-0.8', () => {
    expect(powderFactorAssessment(0.5)).toContain('Light');
  });

  it('returns normal for 0.8-1.5', () => {
    expect(powderFactorAssessment(1.0)).toContain('Normal');
  });

  it('returns heavy for 1.5-3.0', () => {
    expect(powderFactorAssessment(2.0)).toContain('Heavy');
  });

  it('returns very heavy for > 3.0', () => {
    expect(powderFactorAssessment(4.0)).toContain('Very heavy');
  });

  it('boundary at 0.3', () => {
    expect(powderFactorAssessment(0.3)).toContain('Light');
  });

  it('boundary at 0.8', () => {
    expect(powderFactorAssessment(0.8)).toContain('Normal');
  });

  it('boundary at 1.5', () => {
    expect(powderFactorAssessment(1.5)).toContain('Heavy');
  });

  it('boundary at 3.0', () => {
    expect(powderFactorAssessment(3.0)).toContain('Very heavy');
  });
});

// ══════════════════════════════════════════════════════
// LOADING DENSITY CALCULATIONS
// ══════════════════════════════════════════════════════

describe('poundsPerFoot', () => {
  it('calculates 0.3405 × D² × ρ', () => {
    // 2.5" diameter, 1.22 g/cc → 0.3405 × 6.25 × 1.22 ≈ 2.597
    const result = poundsPerFoot(2.5, 1.22);
    expect(result).toBeCloseTo(2.5956, 2);
  });

  it('handles zero diameter', () => {
    expect(poundsPerFoot(0, 1.22)).toBe(0);
  });

  it('handles zero density', () => {
    expect(poundsPerFoot(2.5, 0)).toBe(0);
  });

  it('handles large diameter', () => {
    const result = poundsPerFoot(6, 1.5);
    expect(result).toBeCloseTo(0.3405 * 36 * 1.5, 2);
  });
});

describe('kilogramsPerMeter', () => {
  it('calculates 0.0007854 × D² × ρ', () => {
    // 63.5 mm diameter, 1.22 g/cc
    const result = kilogramsPerMeter(63.5, 1.22);
    expect(result).toBeCloseTo(0.0007854 * 4032.25 * 1.22, 2);
  });

  it('handles zero values', () => {
    expect(kilogramsPerMeter(0, 1.22)).toBe(0);
    expect(kilogramsPerMeter(63.5, 0)).toBe(0);
  });
});

describe('chargeWeight', () => {
  it('calculates poundsPerFoot × columnLength', () => {
    const ppf = poundsPerFoot(2.5, 1.22);
    const result = chargeWeight(2.5, 1.22, 10);
    expect(result).toBeCloseTo(ppf * 10, 5);
  });

  it('handles zero column length', () => {
    expect(chargeWeight(2.5, 1.22, 0)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════
// WET HOLE CALCULATIONS
// ══════════════════════════════════════════════════════

describe('finalWaterHeight', () => {
  it('calculates FH = (H₀ × D_B²) / (D_B² - D_E²)', () => {
    // 5 ft water, 4" borehole, 2.5" explosive
    // FH = (5 × 16) / (16 - 6.25) = 80 / 9.75 ≈ 8.205
    const result = finalWaterHeight(5, 4, 2.5);
    expect(result).toBeCloseTo(8.2051, 2);
  });

  it('returns original height when explosive equals borehole diameter', () => {
    expect(finalWaterHeight(5, 4, 4)).toBe(5);
  });

  it('returns original height when explosive wider than borehole', () => {
    expect(finalWaterHeight(5, 4, 5)).toBe(5);
  });

  it('handles zero water height', () => {
    expect(finalWaterHeight(0, 4, 2.5)).toBe(0);
  });

  it('handles very small gap between borehole and explosive', () => {
    const result = finalWaterHeight(5, 4, 3.9);
    expect(result).toBeGreaterThan(5);
  });
});

describe('cartridgesToClearWater', () => {
  it('calculates N_E = ceil((FH × 12) / L_E)', () => {
    // 8.2 ft final water height, 16" cartridges
    // (8.2 × 12) / 16 = 98.4 / 16 = 6.15 → ceil = 7
    expect(cartridgesToClearWater(8.2, 16)).toBe(7);
  });

  it('returns 0 for zero cartridge length', () => {
    expect(cartridgesToClearWater(5, 0)).toBe(0);
  });

  it('returns 0 for negative cartridge length', () => {
    expect(cartridgesToClearWater(5, -8)).toBe(0);
  });

  it('rounds up to nearest whole cartridge', () => {
    // 1 ft = 12 inches, 16" cartridge → 12/16 = 0.75 → ceil = 1
    expect(cartridgesToClearWater(1, 16)).toBe(1);
  });

  it('handles exact division', () => {
    // 2 ft = 24 inches, 8" cartridge → 24/8 = 3 exactly
    expect(cartridgesToClearWater(2, 8)).toBe(3);
  });

  it('handles zero water height', () => {
    expect(cartridgesToClearWater(0, 16)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════
// TOTAL POUNDS SHOT
// ══════════════════════════════════════════════════════

describe('totalPoundsShot', () => {
  it('sums quantity × weightPerUnit for all products', () => {
    const products = [
      { quantity: 30, weightPerUnit: 3.3334 },
      { quantity: 4, weightPerUnit: 50 },
      { quantity: 30, weightPerUnit: 0.5 },
    ];
    // 100.002 + 200 + 15 = 315.002
    expect(totalPoundsShot(products)).toBeCloseTo(315.002, 2);
  });

  it('returns 0 for empty array', () => {
    expect(totalPoundsShot([])).toBe(0);
  });

  it('handles single product', () => {
    expect(totalPoundsShot([{ quantity: 10, weightPerUnit: 2.5 }])).toBe(25);
  });

  it('handles zero quantity', () => {
    expect(totalPoundsShot([{ quantity: 0, weightPerUnit: 50 }])).toBe(0);
  });
});

// ══════════════════════════════════════════════════════
// TIME & LABOR CALCULATIONS
// ══════════════════════════════════════════════════════

describe('parseTimeToMinutes', () => {
  it('parses HH:mm to minutes', () => {
    expect(parseTimeToMinutes('06:30')).toBe(390);
  });

  it('handles midnight', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
  });

  it('handles end of day', () => {
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });

  it('handles noon', () => {
    expect(parseTimeToMinutes('12:00')).toBe(720);
  });
});

describe('straightTime', () => {
  it('calculates total hours minus OT', () => {
    // 6:00 to 16:00 = 10 hours, minus 2 OT = 8 ST
    expect(straightTime('06:00', '16:00', 2)).toBe(8);
  });

  it('returns total hours when no OT', () => {
    expect(straightTime('07:00', '15:30')).toBe(8.5);
  });

  it('returns 0 when OT exceeds total', () => {
    expect(straightTime('07:00', '09:00', 5)).toBe(0);
  });

  it('handles same in/out time', () => {
    expect(straightTime('08:00', '08:00')).toBe(0);
  });
});

describe('equipmentHoursUsed', () => {
  it('calculates hrsEnd - hrsStart', () => {
    expect(equipmentHoursUsed(1234.5, 1242.3)).toBeCloseTo(7.8, 5);
  });

  it('returns 0 when start equals end', () => {
    expect(equipmentHoursUsed(100, 100)).toBe(0);
  });

  it('returns 0 when end is less than start', () => {
    expect(equipmentHoursUsed(100, 90)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════
// UNIT CONVERSIONS
// ══════════════════════════════════════════════════════

describe('conversions', () => {
  describe('length', () => {
    it('converts ft to m', () => {
      expect(conversions.length.ftToM(1)).toBeCloseTo(0.3048, 4);
    });
    it('converts m to ft', () => {
      expect(conversions.length.mToFt(1)).toBeCloseTo(3.281, 3);
    });
    it('converts in to mm', () => {
      expect(conversions.length.inToMM(1)).toBeCloseTo(25.4, 1);
    });
    it('converts mm to in', () => {
      expect(conversions.length.mmToIn(25.4)).toBeCloseTo(1, 5);
    });
    it('handles zero', () => {
      expect(conversions.length.ftToM(0)).toBe(0);
    });
  });

  describe('mass', () => {
    it('converts lb to kg', () => {
      expect(conversions.mass.lbToKg(1)).toBeCloseTo(0.4536, 4);
    });
    it('converts kg to lb', () => {
      expect(conversions.mass.kgToLb(1)).toBeCloseTo(2.2, 1);
    });
    it('converts short tons to lb', () => {
      expect(conversions.mass.shortTonToLb(1)).toBe(2000);
    });
  });

  describe('volume', () => {
    it('converts yd³ to m³', () => {
      expect(conversions.volume.yd3ToM3(1)).toBeCloseTo(0.7646, 4);
    });
    it('converts m³ to yd³', () => {
      expect(conversions.volume.m3ToYd3(1)).toBeCloseTo(1.31, 2);
    });
  });

  describe('density', () => {
    it('converts g/cc to lb/ft³', () => {
      expect(conversions.density.gccToLbFt3(1)).toBeCloseTo(62.43, 2);
    });
    it('converts lb/ft³ to g/cc', () => {
      expect(conversions.density.lbFt3ToGcc(62.43)).toBeCloseTo(1, 1);
    });
  });

  describe('powderFactor', () => {
    it('converts lb/yd³ to kg/m³', () => {
      expect(conversions.powderFactor.lbYd3ToKgM3(1)).toBeCloseTo(0.593, 3);
    });
    it('converts kg/m³ to lb/yd³', () => {
      expect(conversions.powderFactor.kgM3ToLbYd3(1)).toBeCloseTo(1.686, 3);
    });
  });

  describe('velocity', () => {
    it('converts in/s to mm/s', () => {
      expect(conversions.velocity.inSToMmS(1)).toBeCloseTo(25.4, 1);
    });
    it('converts mm/s to in/s', () => {
      expect(conversions.velocity.mmSToInS(25.4)).toBeCloseTo(1, 5);
    });
  });

  describe('temperature', () => {
    it('converts F to C', () => {
      expect(conversions.temperature.fToC(32)).toBeCloseTo(0, 1);
      expect(conversions.temperature.fToC(212)).toBeCloseTo(100, 0);
    });
    it('converts C to F', () => {
      expect(conversions.temperature.cToF(0)).toBeCloseTo(32, 1);
      expect(conversions.temperature.cToF(100)).toBeCloseTo(212, 0);
    });
  });
});
