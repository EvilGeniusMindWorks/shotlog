// A repair ticket's own screen (Round S9a, 2026-09-09). The persona
// evaluation found the resolve step had vanished with the admin repair queue
// in S8b — `resolveTicket()` had no caller. Three doors lead here: the shop
// worklist row, the machine page's open-ticket history row, and the fleet
// row's repair badge. What was done → Mark resolved; resolving the last open
// out-of-service ticket restores the machine to Active on its own.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Wrench, CheckCircle2 } from 'lucide-react';
import { db, useLiveQuery } from '@/db';
import { resolveTicket, propagateHourMeter } from '@/hooks/useMaintenance';
import { can } from '@/lib/perms';
import { formatDate, nowISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function RepairTicketPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ticket = useLiveQuery(() => (id ? db.repairTickets.get(id) : undefined), [id]);
  const machine = useLiveQuery(() => (ticket ? db.equipment.get(ticket.equipmentId) : undefined), [ticket?.equipmentId]);
  const others = useLiveQuery(
    () => (ticket ? db.repairTickets.filter((t) => t.equipmentId === ticket.equipmentId && t.id !== ticket.id && t.status === 'open').toArray() : []),
    [ticket?.equipmentId, ticket?.id],
  ) ?? [];
  const [note, setNote] = useState('');
  const [meter, setMeter] = useState('');
  const [busy, setBusy] = useState(false);
  const canResolve = can('repairTickets', 'PATCH');

  // A note already saved with "Keep open" comes back into the field
  useEffect(() => {
    if (ticket?.resolutionNote && !note) setNote(ticket.resolutionNote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  if (ticket === undefined) return <div className="p-4 text-sm text-gray-400">Loading…</div>;
  if (ticket === null) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-500">This ticket is not on this device (yet).</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
      </div>
    );
  }
  const open = ticket.status === 'open';
  const meterNow = meter.trim() ? parseFloat(meter) : null;

  const finish = async (resolve: boolean) => {
    setBusy(true);
    try {
      if (resolve) {
        await resolveTicket(ticket, note);
      } else {
        await db.repairTickets.update(ticket.id, { resolutionNote: note.trim() || undefined, updatedAt: nowISO() });
      }
      if (meterNow != null && Number.isFinite(meterNow)) await propagateHourMeter(ticket.equipmentId, meterNow);
      navigate(`/equipment/${ticket.equipmentId}`, { replace: resolve });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-xl" data-ticket-page={ticket.id} data-ticket-status={ticket.status}>
      <button className="text-sm text-gray-500 inline-flex items-center gap-1" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-safety-orange" />
          <h1 className="text-lg font-bold">
            Repair ticket · {machine?.assetNumber ?? '…'}{machine?.description ? ` ${machine.description}` : ''}
          </h1>
          <span
            className={`ml-auto text-[11px] font-bold rounded-full px-2 py-0.5 ${open ? (ticket.outOfService ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700') : 'bg-green-100 text-green-700'}`}
            data-ticket-chip
          >
            {open ? (ticket.outOfService ? 'down' : 'open') : 'resolved'}
          </span>
        </div>
        <p className="text-base">“{ticket.description}”</p>
        <p className="text-sm text-gray-500">
          opened by {ticket.openedByName} from {ticket.sourceType === 'drill_checklist' ? 'the rig checklist' : 'the shop'} · {formatDate(ticket.createdAt.slice(0, 10))}
          {ticket.outOfService && <span className="text-red-700"> · out of service</span>}
        </p>
        {!open && (
          <p className="text-sm text-gray-600" data-ticket-resolved>
            <CheckCircle2 className="inline h-4 w-4 text-green-600 mr-1" />
            Resolved by {ticket.resolvedByName || 'the shop'}{ticket.resolvedAt ? ` · ${formatDate(ticket.resolvedAt.slice(0, 10))}` : ''}
            {ticket.resolutionNote ? ` — “${ticket.resolutionNote}”` : ''}
          </p>
        )}
      </div>

      {open && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div>
            <Label className="text-xs" htmlFor="ticket-done">What was done</Label>
            <Textarea
              id="ticket-done"
              data-ticket-note
              value={note}
              placeholder="e.g. horn relay replaced"
              onChange={(e) => setNote(e.target.value)}
              disabled={!canResolve}
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="ticket-meter">
              Meter now <span className="text-gray-400 font-normal">— optional</span>
            </Label>
            <Input
              id="ticket-meter"
              data-ticket-meter
              type="number"
              inputMode="decimal"
              value={meter}
              placeholder={machine?.hourMeter != null ? String(machine.hourMeter) : ''}
              onChange={(e) => setMeter(e.target.value)}
              disabled={!canResolve}
            />
          </div>
          {canResolve ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void finish(false)} data-ticket-keep>
                Keep open
              </Button>
              <Button disabled={busy || !note.trim()} onClick={() => void finish(true)} data-ticket-resolve>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Mark resolved
              </Button>
            </div>
          ) : (
            <p className="text-xs text-gray-500">The shop, a supervisor or an admin resolves tickets. You can read this one.</p>
          )}
          <p className="text-xs text-gray-400">
            {ticket.outOfService
              ? others.some((t) => t.outOfService)
                ? `${machine?.assetNumber ?? 'The machine'} stays out of service — another ticket still has it down.`
                : `Resolving puts ${machine?.assetNumber ?? 'the machine'} back to Active.`
              : 'The machine stays in service either way.'}
          </p>
        </div>
      )}
    </div>
  );
}
