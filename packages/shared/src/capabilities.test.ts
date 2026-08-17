// The load-bearing guarantee of the capability layer: with NO role
// definitions present, every permission decision matches the legacy
// role matrix EXACTLY — op for op, transition for transition. If a
// capability regrouping ever drifts from permissions.ts, this fails.
import { describe, expect, it } from 'vitest';
import {
  BLAST_DAY_STATUS_TRANSITIONS,
  DRILL_LOG_STATUS_TRANSITIONS,
  ROLES,
  TABLE_PERMISSIONS,
  canEditAcceptedDrillLog,
  canEditApproved,
  canPerformOp,
  canTransitionDrillLog,
  canTransitionRecordStatus,
  canTransitionStatus,
  type WriteOp,
} from './permissions';
import {
  BUILT_IN_ROLES,
  buildRoleDefsLookup,
  canEditAcceptedDrillLogAs,
  canEditApprovedAs,
  canPerformOpAs,
  canTransitionDrillLogAs,
  canTransitionRecordStatusAs,
  canTransitionStatusAs,
  capabilitiesFor,
  hasCapability,
  homeDashboardFor,
  isValidRoleKey,
} from './capabilities';

const OPS: WriteOp[] = ['PUT', 'PATCH', 'DELETE'];

describe('built-in bundles match the legacy matrix (no definitions)', () => {
  it('table writes: every table × op × role', () => {
    for (const table of Object.keys(TABLE_PERMISSIONS)) {
      for (const op of OPS) {
        for (const role of ROLES) {
          expect(
            canPerformOpAs(table, op, role),
            `${table} ${op} ${role}`,
          ).toBe(canPerformOp(table, op, role));
        }
      }
    }
  });

  it('unknown tables deny everyone, admin included', () => {
    expect(canPerformOpAs('nope', 'PUT', 'admin')).toBe(false);
  });

  it('blast-day transitions', () => {
    const statuses = ['draft', 'submitted', 'approved'];
    for (const from of statuses)
      for (const to of statuses)
        for (const role of ROLES)
          expect(
            canTransitionStatusAs(from, to, role),
            `day ${from}→${to} ${role}`,
          ).toBe(canTransitionStatus(from, to, role));
    // sanity: matrices cover every legacy edge
    expect(Object.keys(BLAST_DAY_STATUS_TRANSITIONS).sort()).toEqual(['approved', 'draft', 'submitted']);
  });

  it('drill-log transitions', () => {
    const statuses = ['open', 'complete', 'accepted'];
    for (const from of statuses)
      for (const to of statuses)
        for (const role of ROLES)
          expect(
            canTransitionDrillLogAs(from, to, role),
            `drillLog ${from}→${to} ${role}`,
          ).toBe(canTransitionDrillLog(from, to, role));
    expect(Object.keys(DRILL_LOG_STATUS_TRANSITIONS).sort()).toEqual(['accepted', 'complete', 'open']);
  });

  it('sensitive record-status transitions', () => {
    const cases: [string, string[]][] = [
      ['repairTickets', ['open', 'resolved']],
      ['incidents', ['open', 'office_review', 'closed']],
      ['equipment', ['active', 'in_shop', 'retired']],
      ['drillPlans', ['open', 'complete']],
    ];
    for (const [table, statuses] of cases)
      for (const from of statuses)
        for (const to of statuses)
          for (const role of ROLES)
            expect(
              canTransitionRecordStatusAs(table, from, to, role),
              `${table} ${from}→${to} ${role}`,
            ).toBe(canTransitionRecordStatus(table, from, to, role));
  });

  it('lock overrides', () => {
    for (const role of ROLES) {
      expect(canEditApprovedAs(role), `approved ${role}`).toBe(canEditApproved(role));
      expect(canEditAcceptedDrillLogAs(role), `accepted ${role}`).toBe(canEditAcceptedDrillLog(role));
    }
  });

  it('home dashboards mirror today’s routing', () => {
    expect(homeDashboardFor('driller')).toBe('driller');
    expect(homeDashboardFor('mechanic')).toBe('mechanic');
    expect(homeDashboardFor('admin')).toBe('office');
    expect(homeDashboardFor('office')).toBe('office');
    expect(homeDashboardFor('blaster')).toBe('field');
    expect(homeDashboardFor('supervisor')).toBe('field');
  });
});

describe('definitions override and custom roles', () => {
  const defs = buildRoleDefsLookup([
    // blaster loses incident filing
    { key: 'blaster', name: 'Blaster', capabilities: ['author_field_reports', 'author_blast_records'], homeDashboard: 'field' },
    // a custom foreman role
    { key: 'foreman', name: 'Foreman', capabilities: ['author_field_reports', 'approve_days', 'view_admin_area'], homeDashboard: 'field' },
    // junk that must not take effect
    { key: 'admin', name: 'Sneaky', capabilities: [], homeDashboard: 'field' },
    { key: 'ghost', capabilities: ['not_a_capability'] },
  ]);

  it('an edited built-in follows its definition', () => {
    expect(canPerformOpAs('incidents', 'PUT', 'blaster', defs)).toBe(false);
    expect(canPerformOpAs('blastLogs', 'PUT', 'blaster', defs)).toBe(true);
    expect(canTransitionStatusAs('draft', 'submitted', 'blaster', defs)).toBe(false); // submit_days revoked
  });

  it('custom roles work end to end', () => {
    expect(canPerformOpAs('dailyReports', 'PUT', 'foreman', defs)).toBe(true);
    expect(canPerformOpAs('blastLogs', 'PUT', 'foreman', defs)).toBe(false);
    expect(canTransitionStatusAs('submitted', 'approved', 'foreman', defs)).toBe(true);
    expect(canEditApprovedAs('foreman', defs)).toBe(true);
    expect(hasCapability('foreman', 'view_admin_area', defs)).toBe(true);
    expect(isValidRoleKey('foreman', defs)).toBe(true);
    expect(isValidRoleKey('nobody', defs)).toBe(false);
  });

  it('admin is protected: definitions cannot touch it', () => {
    expect(defs.has('admin')).toBe(false);
    expect(canPerformOpAs('companySettings', 'PUT', 'admin', defs)).toBe(true);
    expect(capabilitiesFor('admin', defs).size).toBeGreaterThan(10);
  });

  it('unknown capabilities are dropped, unknown roles hold nothing', () => {
    expect(capabilitiesFor('ghost', defs).size).toBe(0);
    expect(canPerformOpAs('blastDays', 'PUT', 'ghost', defs)).toBe(false);
    expect(capabilitiesFor('never-heard-of-it').size).toBe(0);
  });

  it('custom roles cannot reach capability-less admin grants', () => {
    const god = buildRoleDefsLookup([
      { key: 'super', name: 'S', capabilities: BUILT_IN_ROLES.flatMap((r) => [...r.capabilities]), homeDashboard: 'office' },
    ]);
    // submissions PATCH/DELETE and roleDefinitions writes have no granting capability
    expect(canPerformOpAs('submissions', 'PATCH', 'super', god)).toBe(false);
    expect(canPerformOpAs('submissions', 'DELETE', 'super', god)).toBe(false);
    expect(canPerformOpAs('roleDefinitions', 'PUT', 'super', god)).toBe(false);
    expect(canPerformOpAs('roleDefinitions', 'PUT', 'admin', god)).toBe(true);
  });
});
