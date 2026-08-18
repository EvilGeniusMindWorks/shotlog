import { describe, expect, it } from 'vitest';
import {
  APPROVAL_LOCKED_TABLES,
  PARENT_CHAIN,
  ROLES,
  TABLE_PERMISSIONS,
  canEditApproved,
  canPerformOp,
  canTransitionRecordStatus,
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

  it('office is read-only everywhere except incident claim processing', () => {
    for (const table of Object.keys(TABLE_PERMISSIONS)) {
      for (const op of ['PUT', 'PATCH', 'DELETE'] as const) {
        const expected = table === 'incidents' && op === 'PATCH';
        expect(canPerformOp(table, op, 'office'), `${table} ${op}`).toBe(expected);
      }
    }
  });

  it('blaster can write field records but not reference data', () => {
    expect(canPerformOp('blastDays', 'PUT', 'blaster')).toBe(true);
    expect(canPerformOp('shots', 'PATCH', 'blaster')).toBe(true);
    expect(canPerformOp('productCatalog', 'PUT', 'blaster')).toBe(false);
    expect(canPerformOp('companySettings', 'PUT', 'blaster')).toBe(false);
    expect(canPerformOp('crewMembers', 'PUT', 'blaster')).toBe(false);
    // blastDay deletion is registry-level, not blaster
    expect(canPerformOp('blastDays', 'DELETE', 'blaster')).toBe(false);
  });

  it('blaster sets up customers/sites/jobs; archive/delete stays supervisory (2026-08-17)', () => {
    for (const table of ['jobs', 'customers', 'sites']) {
      expect(canPerformOp(table, 'PUT', 'blaster'), table).toBe(true);
      expect(canPerformOp(table, 'PATCH', 'blaster'), table).toBe(true);
      expect(canPerformOp(table, 'DELETE', 'blaster'), table).toBe(false);
      expect(canPerformOp(table, 'PUT', 'driller'), table).toBe(false);
      expect(canPerformOp(table, 'PUT', 'supervisor'), table).toBe(false);
    }
  });

  it('time cards: every field role files; office does not', () => {
    for (const role of ['blaster', 'driller', 'mechanic', 'supervisor', 'admin'] as const) {
      expect(canPerformOp('timeCards', 'PUT', role), role).toBe(true);
      expect(canPerformOp('timeCards', 'PATCH', role), role).toBe(true);
    }
    expect(canPerformOp('timeCards', 'PUT', 'office')).toBe(false);
  });

  it('time card approval is supervisory from every prior status', () => {
    expect(canTransitionRecordStatus('timeCards', 'draft', 'filed', 'driller')).toBe(true);
    expect(canTransitionRecordStatus('timeCards', 'filed', 'draft', 'driller')).toBe(true);
    expect(canTransitionRecordStatus('timeCards', 'filed', 'approved', 'driller')).toBe(false);
    expect(canTransitionRecordStatus('timeCards', 'draft', 'approved', 'blaster')).toBe(false);
    expect(canTransitionRecordStatus('timeCards', 'filed', 'approved', 'supervisor')).toBe(true);
    expect(canTransitionRecordStatus('timeCards', 'approved', 'filed', 'supervisor')).toBe(true);
    expect(canTransitionRecordStatus('timeCards', 'approved', 'draft', 'mechanic')).toBe(false);
  });

  it('hour corrections are append-only: shop writes, nobody edits', () => {
    for (const role of ['mechanic', 'supervisor', 'admin'] as const) {
      expect(canPerformOp('hourCorrections', 'PUT', role), role).toBe(true);
    }
    expect(canPerformOp('hourCorrections', 'PUT', 'driller')).toBe(false);
    expect(canPerformOp('hourCorrections', 'PUT', 'blaster')).toBe(false);
    for (const role of ROLES) {
      expect(canPerformOp('hourCorrections', 'PATCH', role), role).toBe(role === 'admin');
      expect(canPerformOp('hourCorrections', 'DELETE', role), role).toBe(role === 'admin');
    }
  });

  it('driller owns work days + daily reports but never blasting records', () => {
    expect(canPerformOp('blastDays', 'PUT', 'driller')).toBe(true);
    expect(canPerformOp('dailyReports', 'PUT', 'driller')).toBe(true);
    expect(canPerformOp('workForceEntries', 'PATCH', 'driller')).toBe(true);
    expect(canPerformOp('equipmentEntries', 'PUT', 'driller')).toBe(true);
    expect(canPerformOp('blastDays', 'DELETE', 'driller')).toBe(false);
    expect(canPerformOp('blastLogs', 'PUT', 'driller')).toBe(false);
    expect(canPerformOp('shots', 'PUT', 'driller')).toBe(false);
  });

  it('mechanic can maintain the equipment registry and entries', () => {
    expect(canPerformOp('equipment', 'PATCH', 'mechanic')).toBe(true);
    expect(canPerformOp('equipmentEntries', 'PUT', 'mechanic')).toBe(true);
    expect(canPerformOp('dailyReports', 'PUT', 'mechanic')).toBe(false);
    expect(canPerformOp('crewMembers', 'PUT', 'mechanic')).toBe(false);
  });

  it('field roles report equipment readings (PATCH) but cannot add/remove assets', () => {
    expect(canPerformOp('equipment', 'PATCH', 'driller')).toBe(true);
    expect(canPerformOp('equipment', 'PATCH', 'blaster')).toBe(true);
    expect(canPerformOp('equipment', 'PUT', 'driller')).toBe(false);
    expect(canPerformOp('equipment', 'DELETE', 'driller')).toBe(false);
  });

  it('submissions: every field role files, nobody edits, admin deletes', () => {
    for (const role of ['blaster', 'driller', 'mechanic', 'supervisor', 'admin'] as const) {
      expect(canPerformOp('submissions', 'PUT', role), role).toBe(true);
    }
    expect(canPerformOp('submissions', 'PUT', 'office')).toBe(false);
    for (const role of ROLES) {
      expect(canPerformOp('submissions', 'PATCH', role), role).toBe(role === 'admin');
      expect(canPerformOp('submissions', 'DELETE', role), role).toBe(role === 'admin');
    }
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
  it('blaster can submit but not unlock, approve, or reopen', () => {
    expect(canTransitionStatus('draft', 'submitted', 'blaster')).toBe(true);
    // submitting files the office copy — unlocking is supervisory
    expect(canTransitionStatus('submitted', 'draft', 'blaster')).toBe(false);
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
