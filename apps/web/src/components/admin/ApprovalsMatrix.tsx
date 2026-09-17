// S21 — the approval matrix (Matthew, Sep 16 2026: "an approval matrix";
// decision fb4-14-matrix: a matrix, set today so the office approves
// everything). For each kind of paper, which roles approve it — a view over
// the roles' capabilities, so the server enforces exactly what the grid
// shows. Admin is locked (approves everything by code). The last row decides
// whether a day is approved as one or paper by paper.
import { useMemo, useRef } from 'react';
import { BUILT_IN_ROLES, BUILT_IN_ROLE_KEYS } from '@shotlog/shared';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import { MATRIX_ROWS, PAPER_CAP } from '@/lib/approvals';
import type { RoleDefinitionRecord } from '@/db/schema';

interface RoleCol {
  key: string;
  name: string;
  capabilities: string[];
  locked: boolean;
  record?: RoleDefinitionRecord;
  defaults: { name: string; capabilities: readonly string[]; homeDashboard: string } | undefined;
}

const COLUMN_ORDER = ['admin', 'supervisor', 'office', 'blaster'];
const COLUMN_LABEL: Record<string, string> = { blaster: 'Blaster in charge' };

export function ApprovalsMatrix({ settings, online }: { settings: { approvalsDayAsOne?: boolean } | undefined; online: boolean }) {
  const isAdmin = getSessionUser()?.role === 'admin';
  const records = useLiveQuery(() => db.roleDefinitions.toArray()) ?? [];
  const cols = useMemo<RoleCol[]>(() => {
    const byKey = new Map(records.map((r) => [r.key, r]));
    const out: RoleCol[] = COLUMN_ORDER.map((key) => {
      const b = BUILT_IN_ROLES.find((r) => r.key === key)!;
      const rec = key === 'admin' ? undefined : byKey.get(key);
      return { key, name: COLUMN_LABEL[key] ?? b.name, capabilities: rec ? rec.capabilities : [...b.capabilities], locked: key === 'admin', record: rec, defaults: b };
    });
    // custom roles get a column each; driller and mechanic stay off the grid (nobody approves from the rig)
    for (const rec of records) {
      if (BUILT_IN_ROLE_KEYS.has(rec.key)) continue;
      out.push({ key: rec.key, name: rec.name, capabilities: rec.capabilities, locked: false, record: rec, defaults: undefined });
    }
    return out;
  }, [records]);

  // A built-in role's first tick materializes its override record; a second
  // tick before the live query has delivered it must update THAT record, not
  // add a twin (two records for one key = whichever the server reads last wins)
  const materialized = useRef(new Map<string, { id: string; capabilities: string[] }>());
  const toggle = (col: RoleCol, cap: string, on: boolean) => {
    const pending = !col.record ? materialized.current.get(col.key) : undefined;
    const base = pending?.capabilities ?? col.capabilities;
    const caps = on ? [...new Set([...base, cap])] : base.filter((c) => c !== cap);
    const recordId = col.record?.id ?? pending?.id;
    if (recordId) {
      if (pending) materialized.current.set(col.key, { id: recordId, capabilities: caps });
      void db.roleDefinitions.update(recordId, { capabilities: caps, updatedAt: nowISO() });
    } else if (col.defaults) {
      const now = nowISO();
      const id = generateId();
      materialized.current.set(col.key, { id, capabilities: caps });
      void db.roleDefinitions.add({
        id,
        key: col.key,
        name: col.defaults.name,
        capabilities: caps,
        homeDashboard: col.defaults.homeDashboard as RoleDefinitionRecord['homeDashboard'],
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
      });
    }
  };
  const dayAsOne = settings?.approvalsDayAsOne !== false;
  const editable = isAdmin && online;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-approvals-matrix>
      <div>
        <p className="font-medium text-sm">Approvals</p>
        <p className="text-xs text-gray-400">
          For each kind of paper, which roles approve it and send it back. The grid is the roles' own permissions: a tick here is the same as a tick on the Roles page. Admin approves everything.
          {!isAdmin ? ' Only an admin changes it.' : !online ? ' Changes need signal.' : ''}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm min-w-[520px]">
          <thead>
            <tr>
              <th className="text-left text-[10px] font-bold tracking-widest text-gray-400 uppercase pb-1 pr-3">Paper</th>
              {cols.map((c) => (
                <th key={c.key} className="text-[10px] font-bold tracking-widest text-gray-400 uppercase pb-1 px-2 whitespace-nowrap" data-matrix-role={c.key}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_ROWS.map((row) => {
              const cap = PAPER_CAP[row.kind];
              return (
                <tr key={row.kind} className="border-t border-gray-100" data-matrix-row={row.kind}>
                  <td className="py-1.5 pr-3">
                    <p className="font-medium">{row.label}</p>
                    {row.hint && <p className="text-[11px] text-gray-400">{row.hint}</p>}
                  </td>
                  {cols.map((c) => {
                    const on = c.locked || c.capabilities.includes(cap);
                    return (
                      <td key={c.key} className="text-center px-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={on}
                          disabled={c.locked || !editable}
                          onChange={(e) => toggle(c, cap, e.target.checked)}
                          aria-label={`${row.label} · ${c.name}`}
                          data-matrix-cell={`${row.kind}:${c.key}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 flex-wrap text-sm" data-approvals-day-as-one={dayAsOne ? 'yes' : 'no'}>
        <span className="text-xs text-gray-500">A day is approved</span>
        {([['yes', 'as one — Approve the day covers every paper not sent back'], ['no', 'paper by paper — Approve the day waits until each paper is approved']] as const).map(([v, label]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="approvals-day-as-one"
              className="h-4 w-4"
              checked={dayAsOne === (v === 'yes')}
              disabled={!editable || !settings}
              onChange={() => void db.companySettings.update('companySettings-singleton', { approvalsDayAsOne: v === 'yes', updatedAt: nowISO() })}
              data-day-as-one={v}
            />
            {label}
          </label>
        ))}
      </div>
    </section>
  );
}
