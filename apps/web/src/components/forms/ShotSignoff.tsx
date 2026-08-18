// Multi-blaster model (a), 2026-08-17: ONE log per day, each SHOT carries
// its responsible blaster + their signature. On single-blaster days the
// log's own sign-off covers everything — this row stays quiet until used.
// The server guards the sign-off: only the responsible blaster signs.
import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { db, useLiveQuery } from '@/db';
import type { Shot } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SignatureField } from '@/components/ui/signature-field';
import { getSessionUser } from '@/lib/session';
import { dataUrlToBlob, nowISO } from '@/lib/utils';

const BLASTER_ROLES = new Set(['blaster', 'supervisor', 'admin']);

export function ShotSignoff({ shot }: { shot: Shot }) {
  const me = getSessionUser();
  const [showSign, setShowSign] = useState(false);
  const roster =
    useLiveQuery(
      () => db.crewMembers.filter((m) => m.isActive && BLASTER_ROLES.has(m.role ?? '')).toArray(),
    ) ?? [];

  const update = (changes: Partial<Shot>) =>
    db.shots.update(shot.id, { ...changes, updatedAt: nowISO() });

  const pick = (crewMemberId: string) => {
    if (!crewMemberId) {
      void update({
        responsibleBlasterUserId: undefined,
        responsibleBlasterName: undefined,
        responsibleLicenseNumber: undefined,
        responsibleLicenseState: undefined,
        signatureImage: null,
        signedAt: undefined,
      });
      return;
    }
    const m = roster.find((x) => x.id === crewMemberId);
    if (!m) return;
    if (
      shot.signatureImage &&
      !confirm(`Changing the responsible blaster clears ${shot.responsibleBlasterName}'s signature. Continue?`)
    )
      return;
    void update({
      responsibleBlasterUserId: m.userId,
      responsibleBlasterName: m.name,
      responsibleLicenseNumber: m.licenseNumber || undefined,
      responsibleLicenseState: m.licenseState || undefined,
      signatureImage: null,
      signedAt: undefined,
    });
  };

  const iAmResponsible = Boolean(
    me && (shot.responsibleBlasterUserId ? shot.responsibleBlasterUserId === me.id : false),
  );
  const selected = roster.find(
    (m) =>
      (shot.responsibleBlasterUserId && m.userId === shot.responsibleBlasterUserId) ||
      (!shot.responsibleBlasterUserId && shot.responsibleBlasterName && m.name === shot.responsibleBlasterName),
  );

  return (
    <div className="border-t border-gray-100 mt-4 pt-3 space-y-2">
      <Label className="text-xs">
        Responsible Blaster
        <span className="text-gray-400 font-normal"> — who runs this shot</span>
      </Label>
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={selected?.id ?? ''}
          onChange={(e) => pick(e.target.value)}
          placeholder="Log's signing blaster"
          options={[
            { value: '', label: 'Log’s signing blaster (default)' },
            ...roster.map((m) => ({ value: m.id, label: m.name })),
          ]}
          className="flex-1 min-w-[180px]"
        />
        {shot.responsibleLicenseNumber && (
          <span className="text-xs text-gray-400 font-mono">
            {shot.responsibleLicenseState} · {shot.responsibleLicenseNumber}
          </span>
        )}
      </div>

      {shot.responsibleBlasterUserId && (
        <div>
          {shot.signatureImage ? (
            <div className="flex items-center gap-2">
              <PenLine className="h-3.5 w-3.5 text-compliant" />
              <span className="text-xs text-gray-500">
                Signed by {shot.responsibleBlasterName}
                {shot.signedAt && ` · ${new Date(shot.signedAt).toLocaleString()}`}
              </span>
              {iAmResponsible && (
                <button
                  className="text-xs text-gray-400 underline underline-offset-2"
                  onClick={() => void update({ signatureImage: null, signedAt: undefined })}
                >
                  clear
                </button>
              )}
            </div>
          ) : iAmResponsible ? (
            <div className="space-y-2">
              {!showSign && (
                <div className="flex gap-2">
                  {me?.signature && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const blob = dataUrlToBlob(me.signature!);
                        if (blob) void update({ signatureImage: blob, signedAt: nowISO() });
                      }}
                    >
                      <PenLine className="h-3.5 w-3.5 mr-1" /> Sign with saved signature
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setShowSign(true)}>
                    Sign
                  </Button>
                </div>
              )}
              {showSign && (
                <SignatureField
                  value={shot.signatureImage ?? null}
                  onChange={(blob) => {
                    void update({ signatureImage: blob, signedAt: blob ? nowISO() : undefined });
                    if (blob) setShowSign(false);
                  }}
                />
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              Awaiting {shot.responsibleBlasterName}’s signature — they sign their own shot.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
