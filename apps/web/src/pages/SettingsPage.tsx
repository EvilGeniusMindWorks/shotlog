import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '@/db';
import { generateId, nowISO } from '@/lib/utils';
import type { CrewMember, Equipment } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChipSelect } from '@/components/ui/chip-select';
import { SyncCard } from '@/components/forms/SyncCard';
import { TeamCard } from '@/components/forms/TeamCard';

const EQUIPMENT_CATEGORIES = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'equip_drill', label: 'Drill / Equipment' },
  { value: 'mats_seismo', label: 'Mats / Seismo' },
];

export function SettingsPage() {
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>
      <SyncCard />
      <TeamCard />
      <CrewCard />
      <EquipmentCard />
    </div>
  );
}

function CrewCard() {
  const crew = useLiveQuery(() => db.crewMembers.filter((c) => c.isActive).toArray()) ?? [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const addMember = async () => {
    if (!name.trim()) return;
    const now = nowISO();
    await db.crewMembers.add({
      id: generateId(),
      name: name.trim(),
      licenseNumber: '',
      licenseState: '',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    } satisfies CrewMember);
    setName('');
    setAdding(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Crew Roster</CardTitle>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Crew Member
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {crew.length === 0 && !adding && (
          <p className="text-sm text-gray-400 text-center py-2">
            Crew members auto-populate the Work Force list on every new Daily Report.
          </p>
        )}
        {crew.map((member) => (
          <div key={member.id} className="flex items-center gap-3 border border-gray-200 rounded-lg p-3">
            <div className="h-9 w-9 rounded-full bg-navy-50 text-navy flex items-center justify-center text-sm font-bold shrink-0">
              {member.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <p className="flex-1 text-sm font-medium truncate">{member.name}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => db.crewMembers.update(member.id, { isActive: false, updatedAt: nowISO() })}
            >
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          </div>
        ))}
        {adding && (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMember()}
              placeholder="Name"
            />
            <Button size="sm" disabled={!name.trim()} onClick={addMember}>
              Add
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EquipmentCard() {
  const equipment = useLiveQuery(() => db.equipment.filter((e) => e.isActive).toArray()) ?? [];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    assetNumber: '',
    description: '',
    category: 'vehicle' as Equipment['category'],
  });

  const addItem = async () => {
    if (!form.assetNumber.trim() && !form.description.trim()) return;
    const now = nowISO();
    await db.equipment.add({
      id: generateId(),
      assetNumber: form.assetNumber.trim(),
      description: form.description.trim(),
      category: form.category,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    } satisfies Equipment);
    setForm({ assetNumber: '', description: '', category: 'vehicle' });
    setAdding(false);
  };

  const byCategory = EQUIPMENT_CATEGORIES.map((cat) => ({
    ...cat,
    items: equipment.filter((e) => e.category === cat.value),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Equipment</CardTitle>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Equipment
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {equipment.length === 0 && !adding && (
          <p className="text-sm text-gray-400 text-center py-2">
            Equipment auto-populates the Equipment list on every new Daily Report.
          </p>
        )}
        {byCategory.map(
          (cat) =>
            cat.items.length > 0 && (
              <div key={cat.value}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  {cat.label}s
                </p>
                <div className="space-y-2">
                  {cat.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 border border-gray-200 rounded-lg p-3"
                    >
                      <span className="font-mono text-sm text-navy shrink-0">{item.assetNumber}</span>
                      <p className="flex-1 text-sm truncate">{item.description}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          db.equipment.update(item.id, { isActive: false, updatedAt: nowISO() })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-gray-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ),
        )}
        {adding && (
          <div className="border border-navy rounded-lg p-3 space-y-2">
            <div>
              <Label className="text-xs">Category</Label>
              <ChipSelect
                className="mt-1"
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v as Equipment['category'] })}
                options={EQUIPMENT_CATEGORIES}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Asset # / ID</Label>
                <Input
                  value={form.assetNumber}
                  onChange={(e) => setForm({ ...form, assetNumber: e.target.value })}
                  placeholder="T-12"
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Drill rig"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!form.assetNumber.trim() && !form.description.trim()}
                onClick={addItem}
              >
                Add
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
