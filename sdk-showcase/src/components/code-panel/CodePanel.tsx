'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CodePanelProps {
  title?: string;
  code: string;
  language?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function CodePanel({
  title = 'SDK Code',
  code,
  language = 'typescript',
  collapsible = true,
  defaultExpanded = false,
}: CodePanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const toggleExpand = () => {
    if (collapsible) {
      setExpanded(!expanded);
    }
  };

  return (
    <div className="border border-kumo-line rounded-lg overflow-hidden bg-kumo-base">
      {/* Header */}
      <div
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 text-xs',
          collapsible && 'cursor-pointer hover:bg-kumo-recessed transition-colors'
        )}
      >
        <div
          className="flex items-center gap-2 flex-1"
          onClick={toggleExpand}
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={(e) => {
            if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              toggleExpand();
            }
          }}
        >
          {collapsible && (
            <svg
              className={cn(
                'w-3 h-3 text-kumo-muted transition-transform',
                expanded && 'rotate-90'
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          <span className="font-medium text-kumo-secondary">{title}</span>
          <span className="px-1.5 py-0.5 rounded bg-kumo-recessed text-kumo-muted">
            {language}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="px-2 py-1 rounded text-kumo-muted hover:text-kumo-default hover:bg-kumo-recessed transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Code Block */}
      {(!collapsible || expanded) && (
        <div className="border-t border-kumo-line bg-slate-50 dark:bg-slate-900/50">
          <pre className="code-panel p-3 overflow-x-auto text-xs leading-relaxed">
            <code className="text-slate-700 dark:text-slate-300 font-mono whitespace-pre">
              {code.trim()}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}
