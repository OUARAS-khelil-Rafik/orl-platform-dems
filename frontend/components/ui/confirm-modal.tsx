'use client';

import { useEffect } from 'react';
import { Trash2, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Supprimer tout',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  isConfirming = false,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'rgba(0, 0, 0, 0.35)' }}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-2xl transition-all"
        style={{ backdropFilter: 'blur(12px)' }}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 text-red-600 mt-0.5">
              <Trash2 className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-[var(--app-text)] mb-2">{title}</h2>
              <p className="text-sm text-[color-mix(in_oklab,var(--app-text)_75%,var(--app-muted)_25%)] leading-relaxed">
                {message}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="flex-shrink-0 ml-4 text-[var(--app-muted)] hover:text-[var(--app-text)] transition-opacity focus:outline-none"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={onCancel}
              disabled={isConfirming}
              className="flex-1 rounded-xl px-4 py-2.5 font-medium text-[var(--app-text)] border border-[var(--app-border)] bg-[var(--app-surface-alt)] hover:bg-[var(--app-surface-2)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={isConfirming}
              className="flex-1 rounded-xl px-4 py-2.5 font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isConfirming ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Suppression…
                </span>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
