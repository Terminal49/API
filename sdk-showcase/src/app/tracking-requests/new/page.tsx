'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import Link from 'next/link';

/**
 * Create Tracking Request Page
 *
 * SDK Methods demonstrated:
 * - client.trackingRequests.inferNumber(number) - Auto-detect number type and carrier
 * - client.trackingRequests.createFromInfer(number, options) - Create from inference result
 * - client.trackingRequests.create(params) - Create with explicit parameters
 */

type Step = 'enter' | 'infer' | 'select' | 'result';

interface Candidate {
  scac: string;
  name: string;
  confidence: number;
}

interface InferenceResult {
  number_type?: string;
  numberType?: string;
  decision?: string;
  candidates?: Candidate[];
  selected?: { scac: string; name: string };
  shipping_line?: {
    decision?: string;
    candidates?: Candidate[];
    selected?: { scac: string; name: string };
  };
  shippingLine?: {
    decision?: string;
    candidates?: Candidate[];
    selected?: { scac: string; name: string };
  };
}

interface CreateResult {
  success: boolean;
  trackingRequest?: any;
  shipment?: any;
  error?: string;
}

export default function NewTrackingRequestPage() {
  const [step, setStep] = useState<Step>('enter');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inferResult, setInferResult] = useState<InferenceResult | null>(null);
  const [selectedScac, setSelectedScac] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  async function handleInfer() {
    if (!trackingNumber.trim()) {
      setError('Please enter a tracking number');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tracking-requests/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: trackingNumber.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to infer tracking number');
      }

      setInferResult(data);

      // Check if we need carrier selection
      const shippingLine = data.shipping_line || data.shippingLine;
      const decision = shippingLine?.decision || data.decision;
      const selected = shippingLine?.selected || data.selected;

      if (decision === 'auto_select' && selected?.scac) {
        setSelectedScac(selected.scac);
      }

      setStep('infer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tracking-requests/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: trackingNumber.trim(),
          scac: selectedScac,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create tracking request');
      }

      setCreateResult(data);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep('enter');
    setTrackingNumber('');
    setInferResult(null);
    setSelectedScac(null);
    setCreateResult(null);
    setError(null);
  }

  const inferCode = `// Step 1: Infer the number type and carrier
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

const inference = await client.trackingRequests.inferNumber('${trackingNumber || 'MSCU1234567'}');
// Returns:
// {
//   number_type: 'container' | 'booking' | 'bill_of_lading',
//   decision: 'auto_select' | 'needs_confirmation',
//   candidates: [{ scac: 'MSCU', name: 'MSC', confidence: 0.95 }, ...],
//   selected: { scac: 'MSCU', name: 'MSC' } // if auto_select
// }`;

  const createCode = `// Step 2: Create tracking request based on inference
${
  selectedScac
    ? `// Using inferred carrier: ${selectedScac}`
    : '// Carrier will be auto-detected or specified'
}
const result = await client.trackingRequests.createFromInfer(
  '${trackingNumber || 'MSCU1234567'}',
  ${selectedScac ? `{ scac: '${selectedScac}' }` : '{}'}
);

// Alternative: Create with explicit parameters
const request = await client.trackingRequests.create({
  request_type: 'container',
  request_number: '${trackingNumber || 'MSCU1234567'}',
  scac: '${selectedScac || 'MSCU'}',
});`;

  const shippingLine = inferResult?.shipping_line || inferResult?.shippingLine;
  const candidates = shippingLine?.candidates || inferResult?.candidates || [];
  const decision = shippingLine?.decision || inferResult?.decision;
  const numberType = inferResult?.number_type || inferResult?.numberType;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Create Tracking Request"
        description="Track a container, booking, or bill of lading"
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[
            { key: 'enter', label: 'Enter Number' },
            { key: 'infer', label: 'Auto-Detect' },
            { key: 'select', label: 'Confirm' },
            { key: 'result', label: 'Complete' },
          ].map((s, index) => {
            const isActive = s.key === step;
            const isPast =
              ['enter', 'infer', 'select', 'result'].indexOf(step) >
              ['enter', 'infer', 'select', 'result'].indexOf(s.key);

            return (
              <div key={s.key} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    isActive
                      ? 'bg-kumo-accent text-white'
                      : isPast
                      ? 'bg-green-500 text-white'
                      : 'bg-kumo-recessed text-kumo-muted'
                  }`}
                >
                  {isPast ? '✓' : index + 1}
                </div>
                <span
                  className={`ml-2 text-sm ${
                    isActive
                      ? 'text-kumo-default font-medium'
                      : 'text-kumo-muted'
                  }`}
                >
                  {s.label}
                </span>
                {index < 3 && (
                  <div
                    className={`w-12 h-0.5 mx-4 ${
                      isPast ? 'bg-green-500' : 'bg-kumo-line'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Step 1: Enter Number */}
        {step === 'enter' && (
          <Card>
            <CardHeader>
              <CardTitle>Enter Tracking Number</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium text-kumo-secondary mb-1">
                    Tracking Number
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value.toUpperCase())}
                    placeholder="MSCU1234567"
                    className="w-full px-4 py-2 rounded-lg bg-kumo-recessed border border-kumo-line focus:border-kumo-focus focus:ring-1 focus:ring-kumo-focus outline-none font-mono text-lg"
                    onKeyDown={(e) => e.key === 'Enter' && handleInfer()}
                  />
                  <p className="text-sm text-kumo-muted mt-1">
                    Container number, booking number, or bill of lading
                  </p>
                </div>
                <Button onClick={handleInfer} disabled={loading}>
                  {loading ? 'Detecting...' : 'Detect & Continue →'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Infer Results */}
        {step === 'infer' && inferResult && (
          <Card>
            <CardHeader>
              <CardTitle>Auto-Detection Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Detected Type */}
                <div className="p-4 rounded-lg bg-kumo-recessed">
                  <p className="text-sm text-kumo-secondary mb-1">Detected Type</p>
                  <p className="text-lg font-medium capitalize">
                    {numberType?.replace('_', ' ') || 'Unknown'}
                  </p>
                </div>

                {/* Carrier Selection */}
                <div>
                  <p className="text-sm font-medium text-kumo-secondary mb-2">
                    {decision === 'auto_select'
                      ? 'Carrier Detected'
                      : 'Select Carrier'}
                  </p>
                  {candidates.length > 0 ? (
                    <div className="space-y-2">
                      {candidates.map((candidate: Candidate) => (
                        <label
                          key={candidate.scac}
                          className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                            selectedScac === candidate.scac
                              ? 'border-kumo-accent bg-blue-50'
                              : 'border-kumo-line hover:bg-kumo-recessed'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="carrier"
                              value={candidate.scac}
                              checked={selectedScac === candidate.scac}
                              onChange={() => setSelectedScac(candidate.scac)}
                              className="w-4 h-4"
                            />
                            <div>
                              <p className="font-medium">{candidate.name}</p>
                              <p className="text-sm text-kumo-muted">
                                SCAC: {candidate.scac}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-sm px-2 py-0.5 rounded ${
                              candidate.confidence >= 0.8
                                ? 'bg-green-100 text-green-800'
                                : candidate.confidence >= 0.5
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {Math.round(candidate.confidence * 100)}% match
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-kumo-muted">
                      No carrier candidates found. Please verify the tracking number.
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setStep('enter')}>
                    ← Back
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={loading || !selectedScac}
                  >
                    {loading ? 'Creating...' : 'Create Tracking Request →'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Result */}
        {step === 'result' && createResult && (
          <Card>
            <CardHeader>
              <CardTitle>
                {createResult.success ? '✅ Tracking Request Created' : '❌ Failed'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {createResult.success ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-green-800 font-medium">
                      Successfully created tracking request for {trackingNumber}
                    </p>
                    {createResult.shipment?.id && (
                      <p className="text-green-700 text-sm mt-1">
                        Shipment ID: {createResult.shipment.id}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    {createResult.shipment?.id && (
                      <Button href={`/shipments/${createResult.shipment.id}`}>
                        View Shipment →
                      </Button>
                    )}
                    {createResult.trackingRequest?.id && (
                      <Button
                        href={`/tracking-requests/${createResult.trackingRequest.id}`}
                        variant="secondary"
                      >
                        View Request
                      </Button>
                    )}
                    <Button variant="secondary" onClick={reset}>
                      Track Another
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-red-800 font-medium">
                      {createResult.error || 'Failed to create tracking request'}
                    </p>
                  </div>
                  <Button onClick={reset}>Try Again</Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* SDK Code Panel */}
        <CodePanel
          title="SDK Code"
          code={step === 'enter' || step === 'infer' ? inferCode : createCode}
          collapsible
        />
      </div>
    </div>
  );
}
