import { useEffect, useState } from 'react';
import { AlertTriangle, IdCard, Plus, Trash2 } from 'lucide-react';
import {
  getSessionUser,
  refreshSessionUser,
  updateMyLicenses,
  type UserLicense,
} from '@/lib/sync';
import { IconChip, SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EXPIRY_WARNING_DAYS = 90;

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
}

/**
 * The signed-in blaster's personal licenses — one per state, stored on their
 * user account so they follow the login to any device and auto-fill sign-off.
 */
export function MyLicensesCard() {
  const [user, setUser] = useState(getSessionUser());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ state: '', licenseNumber: '', expirationDate: '' });
  const [status, setStatus] = useState<string | null>(null);

  // Pick up server-side changes (e.g. edited on another device)
  useEffect(() => {
    void refreshSessionUser().then((u) => u && setUser(u));
  }, []);

  if (!user) return null;
  const licenses = user.licenses ?? [];

  const save = async (next: UserLicense[]) => {
    setStatus('Saving…');
    try {
      const updated = await updateMyLicenses(next);
      setUser(updated);
      setStatus(null);
    } catch (err) {
      setStatus(
        err instanceof Error && err.message.includes('fetch')
          ? 'Offline — license changes need a connection'
          : err instanceof Error
            ? err.message
            : 'save failed',
      );
    }
  };

  const addLicense = () => {
    if (!form.state || !form.licenseNumber) return;
    // One per state: replace any existing license for that state
    const next = [
      ...licenses.filter((l) => l.state !== form.state),
      { state: form.state, licenseNumber: form.licenseNumber, expirationDate: form.expirationDate },
    ].sort((a, b) => a.state.localeCompare(b.state));
    void save(next);
    setForm({ state: '', licenseNumber: '', expirationDate: '' });
    setAdding(false);
  };

  return (
    <SectionCard
      title="My Licenses"
      icon={<IconChip tint="green"><IdCard className="h-4 w-4" /></IconChip>}
      subtitle={
        licenses.length > 0
          ? `${licenses.map((l) => l.state).join(', ')} · follows your account`
          : 'One per state — auto-fills sign-off by job state'
      }
      complete={licenses.length > 0 ? true : undefined}
      actions={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add License
        </Button>
      }
    >
      {licenses.map((lic) => {
        const days = lic.expirationDate ? daysUntil(lic.expirationDate) : null;
        const expiring = days !== null && days <= EXPIRY_WARNING_DAYS;
        return (
          <div key={lic.state} className="flex items-center gap-3 border border-gray-200 rounded-lg p-3">
            <span className="font-mono font-bold text-navy w-10">{lic.state}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{lic.licenseNumber}</p>
              {lic.expirationDate && (
                <p className={`text-xs ${expiring ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                  {expiring && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                  Expires {lic.expirationDate}
                  {expiring && days !== null && ` (${days} days)`}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void save(licenses.filter((l) => l.state !== lic.state))}
            >
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          </div>
        );
      })}

      {adding && (
        <div className="border border-navy rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">State</Label>
              <Input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
                placeholder="MA"
                maxLength={2}
              />
            </div>
            <div>
              <Label className="text-xs">License #</Label>
              <Input
                value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Expires</Label>
              <Input
                type="date"
                value={form.expirationDate}
                onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
              />
            </div>
          </div>
          {form.state && licenses.some((l) => l.state === form.state) && (
            <p className="text-xs text-safety-orange">
              Replaces your existing {form.state} license (one per state).
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!form.state || !form.licenseNumber} onClick={addLicense}>
              Save
            </Button>
          </div>
        </div>
      )}
      {status && <p className="text-sm text-gray-500">{status}</p>}
    </SectionCard>
  );
}
