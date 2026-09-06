// Profile completion (S1, Matthew's call: SOFT nag on home, HARD stop only at
// the moment of signing). One source of truth for "what is this person
// missing" so the nag card, the welcome screen, and the signing gate agree.
import { getSessionUser, type SessionUser } from '@/lib/session';
import { myHomeDashboard } from '@/lib/perms';

/** Roles that sign blast logs / shots and therefore need a license on file */
export const LICENSED_ROLES = new Set(['blaster', 'supervisor', 'admin']);

export interface ProfileGaps {
  /** No blasting license on the account (licensed roles only) */
  license: boolean;
  /** No signature on file (everyone who signs: field + driller buckets) */
  signature: boolean;
}

export function profileGaps(user: SessionUser | null = getSessionUser()): ProfileGaps {
  if (!user) return { license: false, signature: false };
  const bucket = myHomeDashboard();
  const signs = bucket === 'field' || bucket === 'driller';
  return {
    license: LICENSED_ROLES.has(user.role) && (user.licenses?.length ?? 0) === 0,
    signature: signs && !user.signature,
  };
}

export function hasProfileGaps(gaps: ProfileGaps = profileGaps()): boolean {
  return gaps.license || gaps.signature;
}

/** The signing hard stop: a licensed role cannot sign without a license */
export function signingBlocked(user: SessionUser | null = getSessionUser()): boolean {
  return Boolean(user && LICENSED_ROLES.has(user.role) && (user.licenses?.length ?? 0) === 0);
}
