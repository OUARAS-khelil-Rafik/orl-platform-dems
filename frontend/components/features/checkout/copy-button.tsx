'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps {
  /** Valeur copiée dans le presse-papiers. */
  value: string;
  /** Libellé accessible (sinon déduit). */
  label?: string;
  /** Taille de l'icône. */
  size?: number;
  className?: string;
}

/**
 * Bouton « copier » accessible, autonome, adapté aux thèmes clair/sombre.
 * Affiche une confirmation visuelle + `aria-live` après copie.
 */
export function CopyButton({ value, label, size = 14, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    const text = String(value ?? '');
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback pour contextes non sécurisés.
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silencieux : la copie n'est pas critique */
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copié' : `Copier ${label ?? value}`}
      title={copied ? 'Copié' : 'Copier'}
      className={[
        'inline-flex items-center justify-center rounded-lg border transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]',
        'min-h-[30px] min-w-[30px] p-1.5',
        className,
      ].join(' ')}
      style={{
        background: copied
          ? 'color-mix(in oklab, var(--app-success) 16%, var(--app-surface) 84%)'
          : 'var(--app-surface)',
        borderColor: copied
          ? 'color-mix(in oklab, var(--app-success) 38%, var(--app-border) 62%)'
          : 'var(--app-border)',
        color: copied ? 'var(--app-success)' : 'var(--app-muted)',
      }}
    >
      {copied ? <Check size={size} aria-hidden /> : <Copy size={size} aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copié' : ''}
      </span>
    </button>
  );
}
