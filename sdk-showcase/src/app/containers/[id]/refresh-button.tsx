'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/features';

interface RefreshButtonProps {
  containerId: string;
}

export function RefreshButton({ containerId }: RefreshButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRefresh() {
    setLoading(true);

    try {
      const response = await fetch(`/api/containers/${containerId}/refresh`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Refresh failed');
      }

      // Refresh the page to show updated data
      router.refresh();
    } catch (error) {
      console.error('Refresh error:', error);
      alert(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleRefresh} disabled={loading}>
      {loading ? 'Refreshing...' : '🔄 Refresh Data'}
    </Button>
  );
}
