'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/features';

interface StopResumeButtonProps {
  shipmentId: string;
  currentStatus: string;
}

export function StopResumeButton({ shipmentId, currentStatus }: StopResumeButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isActive = currentStatus === 'active';

  async function handleClick() {
    setLoading(true);

    try {
      const endpoint = isActive
        ? `/api/shipments/${shipmentId}/stop`
        : `/api/shipments/${shipmentId}/resume`;

      const response = await fetch(endpoint, { method: 'POST' });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Operation failed');
      }

      // Refresh the page to show updated status
      router.refresh();
    } catch (error) {
      console.error('Stop/resume error:', error);
      alert(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleClick}
      variant={isActive ? 'secondary' : 'primary'}
      disabled={loading}
    >
      {loading
        ? 'Processing...'
        : isActive
        ? 'Stop Tracking'
        : 'Resume Tracking'}
    </Button>
  );
}
