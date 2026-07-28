import { cn } from '@/lib/utils';

/** Pulse placeholder — shown while local-DB queries hydrate so pages never
 *  flash their "No X yet" empty state before the data has actually answered. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-gray-200 dark:bg-gray-700', className)} />;
}

export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
