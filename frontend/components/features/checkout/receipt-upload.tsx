'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText, Upload, X } from 'lucide-react';

const ACCEPT = 'image/*,application/pdf';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];

interface ReceiptUploadProps {
  /** Fichier sélectionné (contrôlé). */
  value: File | null;
  onChange: (file: File | null) => void;
  /** Erreur de validation remontée au parent. */
  onError?: (message: string | null) => void;
  /** Pourcentage d'upload (0–100). */
  progress?: number;
  /** Upload en cours (désactive les interactions). */
  processing?: boolean;
  /** Taille max en Mo. */
  maxSizeMB?: number;
  disabled?: boolean;
}

function isSupportedType(file: File): boolean {
  return ALLOWED_TYPES.includes(file.type) || file.type.startsWith('image/');
}

/**
 * Zone d'upload du reçu de paiement : clic + glisser-déposer, validation,
 * aperçu image, retrait, progression. Thème clair/sombre. Accessible.
 */
export function ReceiptUpload({
  value,
  onChange,
  onError,
  progress = 0,
  processing = false,
  maxSizeMB = 10,
  disabled = false,
}: ReceiptUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Génère / révoque l'URL d'aperçu à partir du fichier contrôlé.
  const preview = useMemo(() => {
    if (value && value.type.startsWith('image/')) return URL.createObjectURL(value);
    return null;
  }, [value]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const selectFile = useCallback(
    (file: File | null) => {
      if (disabled || processing) return;
      if (!file) {
        setLocalError(null);
        onError?.(null);
        onChange(null);
        return;
      }
      if (!isSupportedType(file)) {
        const msg = 'Format non supporté. Joignez une image (JPG, PNG, WEBP) ou un PDF.';
        setLocalError(msg);
        onError?.(msg);
        return;
      }
      const maxSize = maxSizeMB * 1024 * 1024;
      if (file.size > maxSize) {
        const msg = `Fichier trop volumineux (max ${maxSizeMB} Mo).`;
        setLocalError(msg);
        onError?.(msg);
        return;
      }
      setLocalError(null);
      onError?.(null);
      onChange(file);
    },
    [disabled, processing, maxSizeMB, onChange, onError],
  );

  const busy = disabled || processing;

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          selectFile(e.target.files?.[0] ?? null);
          // Permet de re-sélectionner le même fichier.
          e.target.value = '';
        }}
      />

      {!value ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy) return;
            selectFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={[
            'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]',
            busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          ].join(' ')}
          style={{
            borderColor: dragging
              ? 'var(--app-accent)'
              : 'color-mix(in oklab, var(--app-border) 78%, transparent)',
            background: dragging
              ? 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)'
              : 'color-mix(in oklab, var(--app-surface-2) 40%, var(--app-surface) 60%)',
          }}
        >
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              background: 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)',
              color: 'var(--app-accent)',
            }}
          >
            <Upload className="h-6 w-6" aria-hidden />
          </span>
          <span className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>
            {dragging ? 'Déposez le reçu ici' : 'Cliquez ou glissez votre reçu'}
          </span>
          <span className="text-xs" style={{ color: 'var(--app-muted)' }}>
            JPG, PNG, WEBP ou PDF · max {maxSizeMB} Mo
          </span>
        </button>
      ) : (
        <div
          className="rounded-2xl border p-3"
          style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border"
              style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface-2)' }}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Aperçu du reçu" className="h-full w-full object-cover" />
              ) : (
                <FileText className="h-6 w-6" style={{ color: 'var(--app-muted)' }} aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" style={{ color: 'var(--app-text)' }}>
                {value.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--app-muted)' }}>
                {(value.size / 1024 / 1024).toFixed(2)} Mo · {value.type || 'fichier'}
              </p>
              {processing ? (
                <div className="mt-2 w-full">
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full"
                    style={{ background: 'var(--app-surface-2)' }}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, background: 'var(--app-accent)' }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] font-medium" style={{ color: 'var(--app-accent)' }}>
                    {progress}% uploadé
                  </p>
                </div>
              ) : null}
            </div>
            {!processing ? (
              <button
                type="button"
                onClick={() => selectFile(null)}
                className="rounded-xl border p-2 transition-colors hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
                style={{
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-muted)',
                  background: 'var(--app-surface)',
                }}
                aria-label="Retirer le reçu"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
          {!processing ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-3 w-full rounded-xl border py-2 text-xs font-bold transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
              style={{
                borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)',
                color: 'var(--app-accent)',
                background: 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)',
              }}
            >
              Changer de fichier
            </button>
          ) : null}
        </div>
      )}

      {localError ? (
        <p
          role="alert"
          className="mt-2 flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--app-danger)' }}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {localError}
        </p>
      ) : null}
    </div>
  );
}
