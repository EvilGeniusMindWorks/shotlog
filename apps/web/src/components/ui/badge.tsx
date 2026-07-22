import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-navy text-white',
        secondary: 'border-transparent bg-gray-100 text-gray-800',
        outline: 'text-gray-700',
        draft: 'border-transparent bg-gray-200 text-gray-700',
        submitted: 'border-transparent bg-blue-100 text-blue-800',
        approved: 'border-transparent bg-green-100 text-green-800',
        compliant: 'border-transparent bg-green-100 text-green-800',
        warning: 'border-transparent bg-yellow-100 text-yellow-800',
        violation: 'border-transparent bg-red-100 text-red-800',
        synced: 'border-transparent bg-green-100 text-green-700',
        pending: 'border-transparent bg-yellow-100 text-yellow-700',
        local: 'border-transparent bg-gray-100 text-gray-600',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
