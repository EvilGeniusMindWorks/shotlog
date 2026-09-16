// Which paper a feedback report is about (Round S18, Matthew: "I want to
// accept feedback directly against the PDF outputs"). A print screen or the
// Records preview names the paper it is showing while it is on screen; the
// composer picks the name up when it opens, and the admin feedback page can
// open the same screen or the same filed copy. A screen picture of a filed
// PDF comes out blank (the browser's own viewer draws it), so the reference
// is what makes those reports usable.
import { useEffect } from 'react';

export interface FeedbackPaper {
  /** as a person reads it: "Blasting log · Route 3 Widening · Mon, Sep 15 · print" */
  label: string;
  kind?: string;
  /** the filed copy (Records preview) */
  submissionId?: string;
  /** the live record behind a print screen */
  recordId?: string;
}

let current: FeedbackPaper | null = null;

export function setFeedbackPaper(paper: FeedbackPaper | null): void {
  current = paper;
}

export function getFeedbackPaper(): FeedbackPaper | null {
  return current;
}

/** Name the paper while this component is on screen; cleared when it leaves */
export function useFeedbackPaper(paper: FeedbackPaper | null | undefined): void {
  const label = paper?.label ?? '';
  const kind = paper?.kind ?? '';
  const submissionId = paper?.submissionId ?? '';
  const recordId = paper?.recordId ?? '';
  useEffect(() => {
    if (!label) return;
    setFeedbackPaper({
      label,
      ...(kind ? { kind } : {}),
      ...(submissionId ? { submissionId } : {}),
      ...(recordId ? { recordId } : {}),
    });
    return () => setFeedbackPaper(null);
  }, [label, kind, submissionId, recordId]);
}
