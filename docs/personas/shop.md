# Shop (Mechanic)

Status: **DRAFT — awaiting Matthew**
Real people: Baystate mechanic(s)

## Who they are

Keeps the fleet running. Lives in the repair queue, not in job paperwork.
The field feeds them defects (checklists, tickets); they sign machines
back to life.

## Their day

Open the repair queue → work tickets → resolve with notes → keep hour
meters honest → put machines in/out of service → flag dead iron for
retirement (supervisor/admin approves).

## Jobs to be done

1. ✅ Repair queue home (1.0 screens — todo-style done right)
2. ✅ Resolve/reopen tickets (capability-gated to shop+supervision)
3. ✅ Checklist defects flow into tickets automatically
4. ✅ Equipment registry: add/edit; retire is supervisor/admin
5. ✅ Hour meters written by the field roles running the machines
6. 🟡 Equipment history: detail page is 4.8 screens of inline history
7. ❌ **Preventive maintenance**: hour-interval services (250h/500h…) with
   due-soon warnings — the meters to drive it are already captured
8. ❌ Parts/cost on repairs — becomes an input to Owner profitability later

## Screens they touch

Mechanic home (queue) · repair ticket · equipment list + detail ·
checklist review · Admin › Equipment · incident filing

## Never make them…

- dig through job paperwork to find machine problems
- discover a broken rig after it was dispatched

## Design considerations for the screen phase

- PM schedule likely lives on the equipment record (service intervals +
  last-done hours); due-soon surfaces on MechanicHome above the queue
