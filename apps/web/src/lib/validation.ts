import { distributeByHoles } from '@shotlog/shared';
import type { BlastLog, Shot, ExplosiveUsage, DailyReport } from '@/db/schema';

export interface ValidationError {
  field: string;
  section: string;
  message: string;
}

export function validateBlastLog(
  blastLog: BlastLog,
  shots: Shot[],
  explosiveUsage: ExplosiveUsage | undefined
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!blastLog.blasterName) {
    errors.push({ field: 'blasterName', section: 'Sign-off', message: 'Blaster name is required' });
  }
  if (!blastLog.licenseNumber) {
    errors.push({ field: 'licenseNumber', section: 'Sign-off', message: 'License number is required' });
  }
  if (!blastLog.licenseState) {
    errors.push({ field: 'licenseState', section: 'Sign-off', message: 'License state is required' });
  }

  for (const shot of shots) {
    if (!shot.time) {
      errors.push({ field: `shot-${shot.shotNumber}-time`, section: `Shot #${shot.shotNumber}`, message: 'Blast time is required' });
    }
    if (shot.totals.numHoles === 0) {
      errors.push({ field: `shot-${shot.shotNumber}-holes`, section: `Shot #${shot.shotNumber}`, message: 'Number of holes is required' });
    }
    if (shot.designPlan.closestStructureDistance > 0 && shot.designPlan.maxPoundsPerDelay === 0) {
      errors.push({ field: `shot-${shot.shotNumber}-ppd`, section: `Shot #${shot.shotNumber}`, message: 'Max lbs/delay required when structure distance is set' });
    }
  }

  if (explosiveUsage && explosiveUsage.products.length > 0) {
    for (let i = 0; i < explosiveUsage.products.length; i++) {
      const p = explosiveUsage.products[i];
      if (p.quantity <= 0) {
        errors.push({ field: `product-${i}-qty`, section: 'Explosive Usage', message: `${p.productName}: quantity must be > 0` });
      }
    }
  }

  return errors;
}

export function validateForSubmit(
  blastLog: BlastLog,
  shots: Shot[],
  explosiveUsage: ExplosiveUsage | undefined
): boolean {
  const errors = validateBlastLog(blastLog, shots, explosiveUsage);
  return errors.length === 0;
}

/**
 * Everything that should be flagged before handing this log to a regulator:
 * the base field checks plus signature presence and explosive allocation
 * consistency (overridden per-shot quantities that don't reconcile with the
 * entered total would print a log whose columns don't sum).
 */
export function validateForPrint(
  blastLog: BlastLog,
  shots: Shot[],
  explosiveUsage: ExplosiveUsage | undefined
): ValidationError[] {
  const errors = validateBlastLog(blastLog, shots, explosiveUsage);

  if (!blastLog.signatureImage) {
    errors.push({ field: 'signature', section: 'Sign-off', message: 'Signature is missing' });
  }

  if (explosiveUsage) {
    const holeCounts = shots.map((s) => ({ shotId: s.id, holes: s.totals.numHoles }));
    for (const p of explosiveUsage.products) {
      const { remaining } = distributeByHoles(p.quantity, holeCounts, p.shotAllocations);
      if (remaining !== 0) {
        const kind = remaining < 0 ? 'over-allocated' : 'unallocated';
        errors.push({
          field: `product-${p.productName}-alloc`,
          section: 'Explosive Usage',
          message: `${p.productName}: ${Math.abs(remaining)} ${p.unitType}s ${kind} — per-shot quantities don't match the total`,
        });
      }
    }
  }

  return errors;
}
