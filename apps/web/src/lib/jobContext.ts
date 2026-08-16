// THE resolution point for the Customer → Site → Job hierarchy. Every
// consumer that needs "the job's customer / address / state / K factor /
// contacts" goes through here: linked Site/Customer records win, and
// un-backfilled legacy jobs fall back to the fields still on the job.
// Writers NEVER write the legacy fields — only sites/customers records.
import { useLiveQuery, db } from '@/db';
import { generateId, nowISO } from '@/lib/utils';
import type { Customer, Job, JobContact, KFactorHistoryEntry, Site } from '@/db/schema';

export interface JobContext {
  job: Job;
  customer?: Customer;
  site?: Site;
  customerName: string;
  siteName: string;
  address: string;
  city: string;
  state: string;
  kFactor: number;
  kFactorHistory: KFactorHistoryEntry[];
  localRegName?: string;
  localPPVLimit?: number;
  contacts: JobContact[];
  contactNotes?: string;
}

export function resolveJobContext(
  job: Job,
  site?: Site,
  customer?: Customer,
): JobContext {
  return {
    job,
    customer,
    site,
    customerName: customer?.name ?? job.customer ?? '',
    siteName: site?.name ?? [job.address, job.city].filter(Boolean).join(', '),
    address: site?.address ?? job.address ?? '',
    city: site?.city ?? job.city ?? '',
    state: site?.state ?? job.state ?? '',
    kFactor: site?.kFactor ?? job.kFactor ?? 180,
    kFactorHistory: site?.kFactorHistory ?? job.kFactorHistory ?? [],
    localRegName: site?.localRegName ?? job.localRegName,
    localPPVLimit: site?.localPPVLimit ?? job.localPPVLimit,
    contacts: site?.contacts ?? job.contacts ?? [],
    contactNotes: site?.contactNotes ?? job.contactNotes,
  };
}

export async function getJobContext(
  jobId: string | undefined | null,
): Promise<JobContext | undefined> {
  if (!jobId) return undefined;
  const job = await db.jobs.get(jobId);
  if (!job) return undefined;
  const site = job.siteId ? await db.sites.get(job.siteId) : undefined;
  const customer = job.customerId ? await db.customers.get(job.customerId) : undefined;
  return resolveJobContext(job, site, customer);
}

/** Live version for components (re-renders on job/site/customer changes) */
export function useJobContext(jobId: string | undefined | null): JobContext | undefined {
  return useLiveQuery(() => getJobContext(jobId), [jobId]);
}

/**
 * A Job with its legacy display fields OVERLAID from the hierarchy —
 * lets the many readers of `job.customer/address/city/state/kFactor`
 * (PDF builders, print pages, pickers) stay shape-compatible while the
 * linked Site/Customer are the source of truth.
 */
export function overlayJob(job: Job, site?: Site, customer?: Customer): Job {
  if (!site && !customer) return job;
  return {
    ...job,
    customer: customer?.name ?? job.customer,
    address: site?.address ?? job.address,
    city: site?.city ?? job.city,
    state: site?.state ?? job.state,
    kFactor: site?.kFactor ?? job.kFactor,
    kFactorHistory: site?.kFactorHistory ?? job.kFactorHistory,
    localRegName: site?.localRegName ?? job.localRegName,
    localPPVLimit: site?.localPPVLimit ?? job.localPPVLimit,
    contacts: site?.contacts ?? job.contacts,
    contactNotes: site?.contactNotes ?? job.contactNotes,
  };
}

export async function getJobView(jobId: string | undefined | null): Promise<Job | undefined> {
  if (!jobId) return undefined;
  const job = await db.jobs.get(jobId);
  if (!job) return undefined;
  const site = job.siteId ? await db.sites.get(job.siteId) : undefined;
  const customer = job.customerId ? await db.customers.get(job.customerId) : undefined;
  return overlayJob(job, site, customer);
}

/** Batch overlay for lists/pickers — loads customers+sites once. */
export async function getJobViews(jobs: Job[]): Promise<Job[]> {
  if (jobs.every((j) => !j.siteId && !j.customerId)) return jobs;
  const sites = new Map((await db.sites.toArray()).map((s) => [s.id, s]));
  const customers = new Map((await db.customers.toArray()).map((c) => [c.id, c]));
  return jobs.map((j) =>
    overlayJob(j, j.siteId ? sites.get(j.siteId) : undefined, j.customerId ? customers.get(j.customerId) : undefined),
  );
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Direct customer creation (Customers screen) — dedupes by name. */
export async function createCustomer(data: {
  name: string;
  phone?: string;
  billingAddress?: string;
  notes?: string;
}): Promise<string> {
  const existing = (await db.customers.toArray()).find(
    (c) => norm(c.name) === norm(data.name),
  );
  if (existing) return existing.id;
  const now = nowISO();
  const id = generateId();
  await db.customers.add({
    id,
    name: data.name.trim(),
    ...(data.phone?.trim() ? { phone: data.phone.trim() } : {}),
    ...(data.billingAddress?.trim() ? { billingAddress: data.billingAddress.trim() } : {}),
    ...(data.notes?.trim() ? { notes: data.notes.trim() } : {}),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  });
  return id;
}

/** Direct site creation (Customer screen) — dedupes by address+city. */
export async function createSite(
  customerId: string,
  data: {
    name?: string;
    address: string;
    city: string;
    state: string;
    kFactor?: number;
    localRegName?: string;
    localPPVLimit?: number;
  },
): Promise<string> {
  const key = norm(data.address || data.name || '');
  const existing = (await db.sites.where('customerId').equals(customerId).toArray()).find(
    (s) => norm(s.address || s.name) === key && norm(s.city) === norm(data.city),
  );
  if (existing) return existing.id;
  const now = nowISO();
  const id = generateId();
  await db.sites.add({
    id,
    customerId,
    name: data.name?.trim() || [data.address, data.city].filter(Boolean).join(', ') || 'Site',
    address: data.address.trim(),
    city: data.city.trim(),
    state: data.state.trim().toUpperCase(),
    kFactor: data.kFactor ?? 180,
    kFactorHistory: [],
    ...(data.localRegName?.trim() ? { localRegName: data.localRegName.trim() } : {}),
    ...(data.localPPVLimit ? { localPPVLimit: data.localPPVLimit } : {}),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  });
  return id;
}

/**
 * Quick-create structure: match-or-create the Customer (by normalized
 * name) and the Site (by normalized address under that customer, falling
 * back to the site label). Returns ids to stamp on the job. Used by the
 * one-form job create AND the server-side backfill mirrors this logic.
 */
export async function ensureCustomerAndSite(input: {
  customerName: string;
  address: string;
  city: string;
  state: string;
  siteName?: string;
  kFactor?: number;
}): Promise<{ customerId: string; siteId: string }> {
  const now = nowISO();
  const customers = await db.customers.toArray();
  let customer = customers.find((c) => norm(c.name) === norm(input.customerName));
  if (!customer) {
    customer = {
      id: generateId(),
      name: input.customerName.trim(),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    };
    await db.customers.add(customer);
  }
  const siteKey = norm(input.address || input.siteName || input.customerName);
  const sites = await db.sites.where('customerId').equals(customer.id).toArray();
  let site = sites.find(
    (s) => norm(s.address || s.name) === siteKey && norm(s.city) === norm(input.city),
  );
  if (!site) {
    site = {
      id: generateId(),
      customerId: customer.id,
      name: input.siteName?.trim() || [input.address, input.city].filter(Boolean).join(', ') || input.customerName.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state.trim().toUpperCase(),
      kFactor: input.kFactor ?? 180,
      kFactorHistory: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    };
    await db.sites.add(site);
  }
  return { customerId: customer.id, siteId: site.id };
}
