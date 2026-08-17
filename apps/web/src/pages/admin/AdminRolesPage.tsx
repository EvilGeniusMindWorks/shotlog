// Admin › Roles: the configurable-roles editor. Six built-ins (Admin
// locked); editing a built-in saves an OVERRIDE record (reset = delete it);
// custom roles are new records. Capabilities are human-named bundles from
// @shotlog/shared — the server enforces them at the sync choke point.
import { useMemo, useState } from 'react';
import { Lock, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  BUILT_IN_ROLES,
  BUILT_IN_ROLE_KEYS,
  CAPABILITIES,
  type CapabilityGroup,
  type HomeDashboard,
} from '@shotlog/shared';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import type { RoleDefinitionRecord } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const GROUP_LABELS: Record<CapabilityGroup, string> = {
  records: 'Records they can write',
  workflow: 'Workflow actions',
  management: 'Management',
};

const DASHBOARD_OPTIONS = [
  { value: 'field', label: 'Field dashboard (blaster view)' },
  { value: 'driller', label: 'Driller home' },
  { value: 'mechanic', label: 'Mechanic home' },
  { value: 'office', label: 'Office home' },
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** One editable role row: built-in defaults overlaid with its override
 *  record when present */
interface RoleRow {
  key: string;
  name: string;
  capabilities: string[];
  homeDashboard: HomeDashboard;
  isBuiltIn: boolean;
  /** the roleDefinitions record backing it, when one exists */
  record?: RoleDefinitionRecord;
}

export function AdminRolesPage() {
  const isAdmin = getSessionUser()?.role === 'admin';
  const [selected, setSelected] = useState<string>('supervisor');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const records = useLiveQuery(() => db.roleDefinitions.toArray()) ?? [];
  const userCounts = useLiveQuery(async () => {
    const crew = await db.crewMembers.toArray();
    const m = new Map<string, number>();
    for (const c of crew) {
      const r = (c as { role?: string }).role;
      if (r) m.set(r, (m.get(r) ?? 0) + 1);
    }
    return m;
  });

  const rows = useMemo<RoleRow[]>(() => {
    const byKey = new Map(records.map((r) => [r.key, r]));
    const out: RoleRow[] = BUILT_IN_ROLES.map((b) => {
      const rec = b.key === 'admin' ? undefined : byKey.get(b.key);
      return {
        key: b.key,
        name: rec?.name ?? b.name,
        capabilities: rec ? rec.capabilities : [...b.capabilities],
        homeDashboard: rec?.homeDashboard ?? b.homeDashboard,
        isBuiltIn: true,
        record: rec,
      };
    });
    for (const rec of records) {
      if (BUILT_IN_ROLE_KEYS.has(rec.key)) continue;
      out.push({
        key: rec.key,
        name: rec.name,
        capabilities: rec.capabilities,
        homeDashboard: rec.homeDashboard,
        isBuiltIn: false,
        record: rec,
      });
    }
    return out;
  }, [records]);

  const row = rows.find((r) => r.key === selected) ?? rows[0];

  const save = (r: RoleRow, patch: Partial<RoleDefinitionRecord>) => {
    if (r.record) {
      void db.roleDefinitions.update(r.record.id, { ...patch, updatedAt: nowISO() });
    } else {
      // first edit of a built-in materializes its override record
      const now = nowISO();
      void db.roleDefinitions.add({
        id: generateId(),
        key: r.key,
        name: r.name,
        capabilities: r.capabilities,
        homeDashboard: r.homeDashboard,
        ...patch,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
      });
    }
  };

  const createRole = () => {
    const key = slugify(newName);
    if (!key || rows.some((r) => r.key === key)) return;
    const now = nowISO();
    void db.roleDefinitions
      .add({
        id: generateId(),
        key,
        name: newName.trim(),
        capabilities: [],
        homeDashboard: 'field',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
      })
      .then(() => {
        setSelected(key);
        setCreating(false);
        setNewName('');
      });
  };

  if (!isAdmin) {
    return (
      <p className="text-sm text-gray-500">Only the admin can manage roles.</p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr] items-start">
      {/* role list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-2 pb-3">
          {rows.map((r) => (
            <button
              key={r.key}
              className={
                r.key === row?.key
                  ? 'w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-navy text-white text-sm text-left'
                  : 'w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-left'
              }
              onClick={() => {
                setSelected(r.key);
                setCreating(false);
              }}
            >
              <span className="flex-1 truncate font-medium">{r.name}</span>
              {r.key === 'admin' && <Lock className="h-3.5 w-3.5 opacity-60" />}
              {r.isBuiltIn && r.record && (
                <span className="text-[10px] uppercase tracking-wider opacity-60">edited</span>
              )}
              {!r.isBuiltIn && <Badge variant="secondary">custom</Badge>}
            </button>
          ))}
          {creating ? (
            <div className="p-2 space-y-2">
              <Input
                value={newName}
                placeholder="Role name (e.g. Foreman)"
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={!slugify(newName) || rows.some((r) => r.key === slugify(newName))}
                  onClick={createRole}
                >
                  Create
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1" /> New role
            </Button>
          )}
        </CardContent>
      </Card>

      {/* editor */}
      {row && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {row.name}
              {row.key === 'admin' && (
                <Badge variant="secondary">
                  <Lock className="h-3 w-3 mr-1 inline" />
                  protected
                </Badge>
              )}
              <span className="text-xs font-normal text-gray-400">
                {userCounts?.get(row.key) ?? 0} people
              </span>
            </CardTitle>
            <div className="flex gap-2">
              {row.isBuiltIn && row.record && (
                <Button
                  size="sm"
                  variant="outline"
                  title="Back to the stock bundle"
                  onClick={() => void db.roleDefinitions.delete(row.record!.id)}
                >
                  <RotateCcw className="h-4 w-4 mr-1" /> Reset to default
                </Button>
              )}
              {!row.isBuiltIn && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (
                      confirm(
                        `Delete the ${row.name} role? People still assigned to it lose all permissions until reassigned.`,
                      )
                    ) {
                      void db.roleDefinitions.delete(row.record!.id);
                      setSelected('supervisor');
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-gray-400" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {row.key === 'admin' ? (
              <p className="text-sm text-gray-500">
                Admin always holds every capability — it can't be edited or deleted, so the
                company can never lock itself out.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Display name</Label>
                    <Input
                      value={row.name}
                      onChange={(e) => save(row, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Home dashboard</Label>
                    <Select
                      value={row.homeDashboard}
                      onChange={(e) =>
                        save(row, { homeDashboard: e.target.value as HomeDashboard })
                      }
                      options={DASHBOARD_OPTIONS}
                    />
                  </div>
                </div>
                {(Object.keys(GROUP_LABELS) as CapabilityGroup[]).map((group) => (
                  <div key={group}>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      {GROUP_LABELS[group]}
                    </p>
                    <div className="space-y-1.5">
                      {CAPABILITIES.filter((c) => c.group === group).map((cap) => (
                        <label
                          key={cap.key}
                          className="flex items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={row.capabilities.includes(cap.key)}
                            onChange={(e) =>
                              save(row, {
                                capabilities: e.target.checked
                                  ? [...row.capabilities, cap.key]
                                  : row.capabilities.filter((k) => k !== cap.key),
                              })
                            }
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{cap.label}</span>
                            <span className="block text-xs text-gray-500">{cap.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400">
                  Changes apply company-wide as devices sync. The server enforces these
                  bundles on every write — hiding a button here is convenience, not the lock.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
