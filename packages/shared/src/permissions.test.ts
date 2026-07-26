import { describe, expect, it } from 'vitest';
import {
  APPROVAL_LOCKED_TABLES,
  PARENT_CHAIN,
  ROLES,
  TABLE_PERMISSIONS,
  canEditApproved,
  canPerformOp,
  canTransitionStatus,
} from './permissions';

describe('table permissions', () => {
  it('admin can write everything defined', () => {
    for (const table of Object.keys(TABLE_PERMISSIONS)) {
      expect(canPerformOp(table, 'PUT', 'admin'), table).toBe(true);
      expect(canPerformOp(table, 'PATCH', 'admin'), table).toBe(true);
      expect(canPerformOp(table, 'DELETE', 'admin'), table).toBe(true);
    }
  });

  it('office is read-only everywhere', () => {
    for (const table of Object.keys(TABLE_PERMISSIONS)) {
      for (const op of ['PUT', 'PATCH', 'DELETE'] as const) {
        expect(canPerformOp(table, op, 'office'), `${table} ${op}`).toBe(false);
      }
    }
  });

  it('blaster can write field records but not reference data', () => {
    expect(canPerformOp('blastDays', 'PUT', 'blaster')).toBe(true);
    expect(canPerformOp('shots', 'PATCH', 'blaster')).toBe(true);
    expect(canPerformOp('productCatalog', 'PUT', 'blaster')).toBe(false);
    expect(canPerformOp('jobs', 'PATCH', 'blaster')).toBe(false);
    expect(canPerformOp('companySettings', 'PUT', 'blaster')).toBe(false);
    expect(canPerformOp('crewMembers', 'PUT', 'blaster')).toBe(false);
    // blastDay deletion is registry-level, not blaster
    expect(canPerformOp('blastDays', 'DELETE', 'blaster')).toBe(false);
  });

  it('driller works in the daily-report family only', () => {
    expect(canPerformOp('dailyReports', 'PUT', 'driller')).toBe(true);
    expect(canPerformOp('workForceEntries', 'PATCH', 'driller')).toBe(true);
    expect(canPerformOp('equipmentEntries', 'PUT', 'driller')).toBe(true);
    expect(canPerformOp('blastLogs', 'PUT', 'driller')).toBe(false);
    expect(canPerformOp('shots', 'PUT', 'driller')).toBe(false);
  });

  it('mechanic can maintain the equipment registry and entries', () => {
    expect(canPerformOp('equipment', 'PATCH', 'mechanic')).toBe(true);
    expect(canPerformOp('equipmentEntries', 'PUT', 'mechanic')).toBe(true);
    expect(canPerformOp('dailyReports', 'PUT', 'mechanic')).toBe(false);
    expect(canPerformOp('crewMembers', 'PUT', 'mechanic')).toBe(false);
  });

  it('unknown tables are denied for every role', () => {
    for (const role of ROLES) {
      expect(canPerformOp('records', 'PUT', role)).toBe(false);
      expect(canPerformOp('users', 'DELETE', role)).toBe(false);
      expect(canPerformOp('', 'PATCH', role)).toBe(false);
    }
  });
});

describe('blast day status transitions', () => {
  it('blaster can submit and withdraw but never approve', () => {
    expect(canTransitionStatus('draft', 'submitted', 'blaster')).toBe(true);
    expect(canTransitionStatus('submitted', 'draft', 'blaster')).toBe(true);
    expect(canTransitionStatus('submitted', 'approved', 'blaster')).toBe(false);
    expect(canTransitionStatus('approved', 'submitted', 'blaster')).toBe(false);
  });

  it('supervisor can approve and reopen', () => {
    expect(canTransitionStatus('submitted', 'approved', 'supervisor')).toBe(true);
    expect(canTransitionStatus('approved', 'submitted', 'supervisor')).toBe(true);
  });

  it('no skipping draft straight to approved', () => {
    for (const role of ROLES) {
      expect(canTransitionStatus('draft', 'approved', role)).toBe(false);
    }
  });

  it('same-status writes are not transitions', () => {
    expect(canTransitionStatus('approved', 'approved', 'office')).toBe(true);
  });
});

describe('approval lock metadata', () => {
  it('every locked table has a resolvable parent chain ending at blastDays', () => {
    for (const table of APPROVAL_LOCKED_TABLES) {
      let current = table;
      let hops = 0;
      while (current !== 'blastDays') {
        const link = PARENT_CHAIN[current];
        expect(link, `${table} chain broken at ${current}`).toBeDefined();
        current = link.parentTable;
        expect(++hops).toBeLessThan(5);
      }
    }
  });

  it('only supervisor and admin may edit approved records', () => {
    expect(canEditApproved('admin')).toBe(true);
    expect(canEditApproved('supervisor')).toBe(true);
    expect(canEditApproved('blaster')).toBe(false);
    expect(canEditApproved('driller')).toBe(false);
    expect(canEditApproved('office')).toBe(false);
  });
});
