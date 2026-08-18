// Time cards on the work day — Round 1 first consumer. Everyone files
// their OWN card (mine first, one tap); entering for a NO-LOGIN roster
// person is allowed, attributed, and gently discouraged. Approvers see
// approve/pull-back on each card.
import { useState } from 'react';
import { Clock, PenLine, Plus, Trash2 } from 'lucide-react';
import { db, deleteWithTombstone, useLiveQuery } from '@/db';
import type { BlastDay, TimeCard } from '@/db/schema';
import { straightTime as calcST } from '@shotlog/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SignatureField } from '@/components/ui/signature-field';
import { showToast } from '@/components/ui/undo-toast';
import {
  approveTimeCard,
  canEditCard,
  createTimeCard,
  fileTimeCard,
  myCard,
  pullBackTimeCard,
  unapproveTimeCard,
  useDayTimeCards,
} from '@/hooks/useTimeCards';
import { canEditApprovedDay, hasCap } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { dataUrlToBlob, nowISO } from '@/lib/utils';

export function TimeCardsCard({ blastDay }: { blastDay: BlastDay }) {
  const cards = useDayTimeCards(blastDay.id);
  const roster = useLiveQuery(() => db.crewMembers.filter((m) => m.isActive).toArray()) ?? [];
  const me = getSessionUser();
  const mine = myCard(cards);
  const supervisory = canEditApprovedDay();
  const [addingOther, setAddingOther] = useState(false);

  if (!hasCap('file_time_cards')) return null;

  const filed = cards.filter((c) => c.status !== 'draft').length;

  // Who can still get a card entered from THIS device: no-login roster
  // people (anyone may enter, attributed) + everyone for approvers.
  // People with logins file their own — push toward self-service.
  const withoutCard = roster.filter(
    (m) => !cards.some((c) => c.crewMemberId === m.id || (m.userId && c.userId === m.userId)),
  );
  const enterable = supervisory ? withoutCard : withoutCard.filter((m) => !m.userId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-navy" /> Time Cards
          {cards.length > 0 && (
            <span className="text-xs font-normal text-gray-400">
              {filed}/{cards.length} filed
            </span>
          )}
        </CardTitle>
        {!mine && me && (
          <Button
            size="sm"
            onClick={() => createTimeCard(blastDay, { name: me.name, userId: me.id, crewMemberId: roster.find((m) => m.userId === me.id)?.id })}
          >
            <Plus className="h-4 w-4 mr-1" /> My card
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {cards.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">
            Each crew member files their own card for the day.
          </p>
        )}
        {cards.map((card) => (
          <TimeCardRow key={card.id} card={card} editable={canEditCard(card, roster)} />
        ))}

        {enterable.length > 0 && !addingOther && (
          <button
            className="text-xs text-gray-400 hover:text-navy underline underline-offset-2"
            onClick={() => setAddingOther(true)}
          >
            + Enter a card for someone else
          </button>
        )}
        {addingOther && (
          <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2">
            <Label className="text-xs">Whose card?</Label>
            <Select
              value=""
              onChange={(e) => {
                const m = roster.find((x) => x.id === e.target.value);
                if (!m) return;
                void createTimeCard(blastDay, {
                  name: m.name,
                  crewMemberId: m.id,
                  userId: m.userId,
                });
                setAddingOther(false);
              }}
              placeholder="Pick from roster…"
              options={enterable.map((m) => ({
                value: m.id,
                label: m.role ? `${m.name} · ${m.role}` : m.name,
              }))}
            />
            <p className="text-[11px] text-gray-400">
              {supervisory
                ? 'Entered cards are attributed to you.'
                : 'Only people without a login — everyone with a login files their own.'}
            </p>
            <button
              className="text-xs text-gray-400 underline underline-offset-2"
              onClick={() => setAddingOther(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_BADGE: Record<TimeCard['status'], { label: string; variant: 'draft' | 'warning' | 'compliant' }> = {
  draft: { label: 'Draft', variant: 'draft' },
  filed: { label: 'Filed', variant: 'warning' },
  approved: { label: 'Approved', variant: 'compliant' },
};

export function TimeCardRow({ card, editable }: { card: TimeCard; editable: boolean }) {
  const me = getSessionUser();
  const supervisory = canEditApprovedDay();
  const isMine = Boolean(me && card.userId === me.id);
  const [showSign, setShowSign] = useState(false);

  const update = (changes: Partial<TimeCard>) =>
    db.timeCards.update(card.id, { ...changes, updatedAt: nowISO() });

  const setTimes = (field: 'timeIn' | 'timeOut', value: string) => {
    const timeIn = field === 'timeIn' ? value : card.timeIn;
    const timeOut = field === 'timeOut' ? value : card.timeOut;
    const changes: Partial<TimeCard> = { [field]: value };
    if (timeIn && timeOut) changes.straightTime = calcST(timeIn, timeOut, card.overtime);
    void update(changes);
  };

  const badge = STATUS_BADGE[card.status];
  const enteredForOther = card.enteredByUserId && card.userId !== card.enteredByUserId;

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-sm">
          {card.personName}
          {isMine && <span className="text-gray-400 font-normal"> (me)</span>}
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {enteredForOther && (
          <span className="text-[11px] text-gray-400">entered by {card.enteredByName}</span>
        )}
        <span className="flex-1" />
        {card.signatureImage && <PenLine className="h-3.5 w-3.5 text-compliant" />}
        {editable && card.status === 'draft' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              void deleteWithTombstone('timeCards', card.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-gray-400" />
          </Button>
        )}
      </div>

      {editable ? (
        <div className="grid grid-cols-4 gap-2">
          <div>
            <Label className="text-xs">IN</Label>
            <Input type="time" value={card.timeIn ?? ''} onChange={(e) => setTimes('timeIn', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">OUT</Label>
            <Input type="time" value={card.timeOut ?? ''} onChange={(e) => setTimes('timeOut', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-gray-400">ST</Label>
            <p className="h-10 flex items-center font-mono text-sm bg-gray-50 rounded-md px-3 border border-gray-200">
              {card.straightTime > 0 ? card.straightTime.toFixed(1) : '—'}
            </p>
          </div>
          <div>
            <Label className="text-xs">OT</Label>
            <Input
              type="number"
              step="0.5"
              value={card.overtime || ''}
              onChange={(e) => {
                const ot = parseFloat(e.target.value) || 0;
                const changes: Partial<TimeCard> = { overtime: ot };
                if (card.timeIn && card.timeOut)
                  changes.straightTime = calcST(card.timeIn, card.timeOut, ot);
                void update(changes);
              }}
              placeholder="0"
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 font-mono">
          {card.timeIn && card.timeOut ? `${card.timeIn}–${card.timeOut} · ` : ''}
          ST {card.straightTime.toFixed(1)}
          {card.overtime > 0 && ` · OT ${card.overtime.toFixed(1)}`}
        </p>
      )}

      {/* Signature + file — signing is personal: only on your own card */}
      {editable && isMine && card.status === 'draft' && (
        <div className="space-y-2">
          {!card.signatureImage && !showSign && (
            <div className="flex gap-2">
              {me?.signature && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = dataUrlToBlob(me.signature!);
                    if (blob) void update({ signatureImage: blob });
                  }}
                >
                  <PenLine className="h-3.5 w-3.5 mr-1" /> Use saved signature
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowSign(true)}>
                Sign
              </Button>
            </div>
          )}
          {(showSign || card.signatureImage) && (
            <SignatureField
              value={card.signatureImage}
              onChange={(blob) => {
                void update({ signatureImage: blob });
                if (blob) setShowSign(false);
              }}
            />
          )}
        </div>
      )}

      <div className="flex gap-2">
        {editable && card.status === 'draft' && (card.straightTime > 0 || card.overtime > 0) && (
          <Button
            size="sm"
            variant="safety"
            onClick={() => {
              void fileTimeCard(card);
              showToast(`Filed ${card.personName}'s time card`);
            }}
          >
            File card
          </Button>
        )}
        {card.status === 'filed' && (isMine || supervisory) && (
          <Button size="sm" variant="outline" onClick={() => void pullBackTimeCard(card)}>
            Pull back
          </Button>
        )}
        {supervisory && card.status === 'filed' && (
          <Button size="sm" onClick={() => void approveTimeCard(card)}>
            Approve
          </Button>
        )}
        {supervisory && card.status === 'approved' && (
          <Button size="sm" variant="outline" onClick={() => void unapproveTimeCard(card)}>
            Unapprove
          </Button>
        )}
      </div>
    </div>
  );
}
