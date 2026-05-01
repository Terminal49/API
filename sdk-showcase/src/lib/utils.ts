import { clsx, type ClassValue } from 'clsx';

/**
 * Utility function to merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Container status display configuration
 */
export const containerStatusConfig: Record<
  string,
  { label: string; color: string; bgColor: string; description: string }
> = {
  new: {
    label: 'New',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    description: 'Tracking started, status unknown',
  },
  on_ship: {
    label: 'On Ship',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    description: 'In transit by vessel',
  },
  available: {
    label: 'Available',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    description: 'Ready for pickup',
  },
  not_available: {
    label: 'Not Available',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    description: 'At port but restricted',
  },
  grounded: {
    label: 'Grounded',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    description: 'Availability unknown',
  },
  awaiting_inland_transfer: {
    label: 'Awaiting Inland',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    description: 'Waiting for rail transfer',
  },
  on_rail: {
    label: 'On Rail',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    description: 'In transit by rail',
  },
  picked_up: {
    label: 'Picked Up',
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
    description: 'Out for delivery',
  },
  off_dock: {
    label: 'Off Dock',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    description: 'At alternative facility',
  },
  delivered: {
    label: 'Delivered',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    description: 'Delivery confirmed',
  },
  empty_returned: {
    label: 'Empty Returned',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    description: 'Container returned',
  },
};

/**
 * Format a date string for display
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format a datetime string for display
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return dateString;
  }
}

/**
 * Calculate days remaining until a date
 */
export function daysUntil(dateString: string | null | undefined): number | null {
  if (!dateString) return null;
  try {
    const targetDate = new Date(dateString);
    const now = new Date();
    const diffTime = targetDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}
