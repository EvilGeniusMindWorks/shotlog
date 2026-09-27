// The brochure and the product page share these words and pictures (Round S25,
// Sep 27 2026). Matthew picked every line on the plan page; the pictures are
// frames of the app photographed from a fictional job in a fictional company
// (Ledgeview Blasting Co., Ridge Road Lot 14, Westford MA) — no real customer,
// crew or site appears. Frames live in public/brochure as WebP.

export type Frame = { kind: 'tablet' | 'phone' | 'map'; file: string; alt: string };
export type Picture =
  | { kind: 'combo'; tablet: Frame; phone: Frame; caption?: string }
  | { kind: 'single'; frame: Frame; caption?: string };

export const CONTACT = {
  email: 'info@evilgenius.io',
  phoneWord: '877-EVIL-PRO',
  phoneDigits: '877-384-5776',
  phoneHref: 'tel:+18773845776',
  site: 'shotlog.evilgenius.io',
  pageUrl: 'https://shotlog.evilgenius.io/brochure',
  pdf: '/brochure/ShotLog-Brochure.pdf',
};

const f = (kind: Frame['kind'], name: string, alt: string): Frame => ({ kind, file: `/brochure/${name}.webp`, alt });

export const HERO = {
  eyebrow: 'ShotLog',
  h: "The blasting company's working day, on one device.",
  p: 'Drill plans, drill logs, the blasting log, the daily report, rig checklists and time cards: entered once, calculated for you, filed as the record.',
  cta: 'Ask for a walkthrough',
  picture: {
    kind: 'combo',
    tablet: f('map', 'design-map-street-el--tablet', 'The site map: the blast pin, a 250 ft ring and five structures with their distances'),
    phone: f('phone', 'day-tiles--phone', 'The work day on a phone, one tile per paper'),
  } as Picture,
};

export const WHY = {
  eyebrow: 'Why',
  h: 'Paper was never the job. The record still is.',
  p: 'A blast day used to end with a stack of paper repeating the same job, crew and product, and the figures an inspector asks for worked out by hand. With ShotLog the day is entered once, every paper is filed from it, and the office has each one the moment it syncs, incident reports included. The paperwork is still there whenever anyone needs it: printed, as a PDF, or on screen.',
  facts: [
    ['Entered once', 'the job, crew, rigs and product flow to every paper'],
    ['Filed from the day', 'the papers are printouts of the record, not the record'],
    ['In the office as it syncs', 'incident reports included'],
    ['There when needed', 'printed, as a PDF, or on screen, years later'],
  ] as [string, string][],
};

export const FLOW = {
  eyebrow: 'The day',
  h: 'One day, start to finish.',
  steps: [
    { short: 'Plan the pattern', title: 'Plan the pattern', text: 'Rows, columns, depth and spacing. Sent to the drillers with the date.', frame: f('phone', 'pattern--phone', 'The drill pattern on a phone') },
    { short: 'Drill it', title: 'Drill it, over days if it takes days', text: 'One drill log for the pattern. Every hole carries its driller, rig and time.', frame: f('phone', 'drill-log--phone', 'The drill log on a phone') },
    { short: 'Make the shot', title: 'Make the shot from what was drilled', text: "The layout becomes the shot's diagram and the totals come from the drilling.", frame: f('phone', 'day-tiles--phone', 'The work day tiles on a phone') },
    { short: 'Time it, map it, check it', title: 'Time it, map it, check it', text: 'Timing, the site map, scaled distance and PPV on one screen.', frame: f('phone', 'design-timing--phone', 'The shot designer in timing mode on a phone') },
    { short: 'Check and sign', title: 'Check and sign', text: 'The app says what is still missing before the signature.', frame: f('phone', 'check-and-sign--phone', 'Check and sign on a phone') },
    { short: 'File this day', title: 'File this day', text: 'Red items must be fixed first. Then the papers are the record.', frame: f('phone', 'file-day--phone', 'File this day on a phone') },
  ],
};

export type Feature = { key: string; eyebrow: string; h: string; p: string; picture: Picture };

export const FEATURES: Feature[] = [
  {
    key: 'map', eyebrow: 'The map', h: 'The site, with the ring.',
    p: 'Pin the blast and the structures, set the blast radius, and the closest structure feeds the compliance card and the printed log. Satellite or street, saved with the shot.',
    picture: { kind: 'single', frame: f('map', 'design-map-street-el--tablet', 'The site map with the blast pin, the 250 ft ring and labelled structures') },
  },
  {
    key: 'designer', eyebrow: 'The shot designer', h: 'Timing you can see.',
    p: 'Tap the first hole and its lead, then wire the rest. Firing times fall out of the tree, the 8 ms rule is checked as you go, and the timing sits on the pattern as it was actually drilled.',
    picture: { kind: 'single', frame: f('tablet', 'design-timing--tablet', 'The shot designer beside the site map on a tablet') },
  },
  {
    key: 'math', eyebrow: 'The math', h: 'Scaled distance, PPV and K, worked as you type.',
    p: "Charge per delay, the closest structure and the site's K factor. The scaled distance and predicted PPV update as the shot is entered and are checked against the USBM RI 8507 and OSM limits. Photograph the seismograph printout and the readings fill themselves, on the device, with no signal.",
    picture: { kind: 'single', frame: f('phone', 'seismo-scan--phone', 'A seismograph printout photographed and read into the reading form'), caption: 'The printout photographed, 17 values read, verified against the tape' },
  },
  {
    key: 'offline', eyebrow: 'Offline', h: 'No signal needed.',
    p: 'Everything works offline on an Android tablet, a phone or a PC. Changes sync when a connection returns, and two people can work the same day without overwriting each other.',
    picture: { kind: 'combo', tablet: f('tablet', 'blast-log--tablet', 'The blasting log on a tablet'), phone: f('phone', 'day-tiles--phone', 'The work day on a phone') },
  },
  {
    key: 'drilling', eyebrow: 'Drilling', h: 'Drillers have their own home.',
    p: 'The pattern is a paper of the job. Drillers continue one log over days, each hole carries its driller and rig, as well as hazard details for the blaster. The pattern turns Drilled by itself upon completion and the blaster accepts it in one tap.',
    picture: { kind: 'combo', tablet: f('tablet', 'pattern--tablet', "The drilled pattern with each driller's initials on a tablet"), phone: f('phone', 'drill-log--phone', 'The drill log on a phone') },
  },
  {
    key: 'records', eyebrow: 'Records', h: 'Filed once. Kept as the record.',
    p: 'A filed copy is write-once. A correction is a new version with the old one kept. Every filing is audited on the server and kept for the retention periods the regulators require.',
    picture: { kind: 'combo', tablet: f('tablet', 'print-blast-log--tablet', 'The printed blasting log on a tablet'), phone: f('phone', 'records--phone', 'My records on a phone') },
  },
  {
    key: 'office', eyebrow: 'The office', h: 'The office sees the whole company.',
    p: 'Who has checked in, what is filed and what needs a decision. Review with send-back notes, approvals, and Records by job, day and pattern.',
    picture: { kind: 'combo', tablet: f('tablet', 'office-home--tablet', "The office home with today's jobs on a tablet"), phone: f('phone', 'office-records--phone', 'Records, the office view, on a phone') },
  },
  {
    key: 'safety', eyebrow: 'Safety', h: 'Safety lives on the job.',
    p: 'A jobsite contact sheet with the fire chief, the police and the nearest hospital, and one-tap directions to the hospital and urgent care. Incident reports open with a Do-now list that dials the right people, keep a call log, and reach the office the moment they sync.',
    picture: { kind: 'combo', tablet: f('tablet', 'contact-sheet--tablet', 'The jobsite contact sheet on a tablet'), phone: f('phone', 'incidents--phone', 'Incidents on a phone') },
  },
];

export const WHO = {
  eyebrow: 'Who uses it',
  h: 'Built for the whole crew.',
  p: 'Blaster, driller, supervisor, mechanic, office and admin. Each opens on what needs them today. Roles are bundles of permissions the company can adjust, and the server enforces every one.',
  roles: ['Blaster', 'Driller', 'Supervisor', 'Mechanic', 'Office', 'Admin'],
  frames: [f('phone', 'home--phone', "The blaster's home"), f('phone', 'driller-home--phone', "The driller's home"), f('phone', 'office-home--phone', 'The office home')],
};

export const RECORD = {
  h: 'Built for the record.',
  p: "ATF explosives records, OSHA and MSHA safety rules, DOT transport rules, Massachusetts 527 CMR and every town's blasting permit rest on these papers. ShotLog treats them as the legal records they are.",
  regs: ['ATF', 'OSHA · MSHA', 'DOT', 'MA 527 CMR', 'USBM RI 8507', 'OSM', 'Town permits'],
};

export const CTA = {
  eyebrow: 'Next step',
  h: 'See it on your own job.',
  p: "Half an hour on a call, or a morning at your site. Bring last week's blasting log.",
};

export const META = {
  title: 'ShotLog — the blasting company’s working day, on one device',
  description: 'Drill plans, drill logs, the blasting log, the daily report, rig checklists and time cards: entered once, calculated for you, filed as the record. Works with no signal.',
};
