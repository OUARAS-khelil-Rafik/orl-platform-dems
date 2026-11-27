'use client';

import { Building2, CheckCircle2, FileText } from 'lucide-react';

export type PaymentMethod = 'ccp' | 'baridimob';

export const PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  label: string;
  sub: string;
  icon: typeof Building2;
}> = [
  { id: 'baridimob', label: 'BaridiMob', sub: 'RIP instantané', icon: Building2 },
  { id: 'ccp', label: 'CCP', sub: 'Virement Poste', icon: FileText },
];

interface PaymentMethodPickerProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  /** Nom du groupe radio (unique par formulaire). */
  name?: string;
  disabled?: boolean;
}

/**
 * Sélecteur de méthode de paiement (BaridiMob / CCP).
 * Sémantique radio native + styles adaptés clair/sombre + focus visible.
 */
export function PaymentMethodPicker({
  value,
  onChange,
  name = 'payment-method',
  disabled = false,
}: PaymentMethodPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Méthode de paiement"
      className="grid grid-cols-2 gap-2.5"
    >
      {PAYMENT_METHODS.map((m) => {
        const active = value === m.id;
        const Icon = m.icon;
        return (
          <label
            key={m.id}
            className={[
              'relative flex cursor-pointer flex-col gap-1 rounded-2xl border-2 p-3.5 transition-all',
              'focus-within:ring-2 focus-within:ring-[var(--ring-focus)]',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            ].join(' ')}
            style={{
              borderColor: active ? 'var(--app-accent)' : 'var(--app-border)',
              background: active
                ? 'color-mix(in oklab, var(--app-accent) 10%, var(--app-surface) 90%)'
                : 'var(--app-surface)',
              boxShadow: active
                ? '0 8px 22px -16px color-mix(in srgb, var(--app-accent) 55%, transparent)'
                : 'none',
            }}
          >
            <input
              type="radio"
              name={name}
              value={m.id}
              checked={active}
              disabled={disabled}
              onChange={() => onChange(m.id)}
              className="sr-only"
            />
            {active ? (
              <CheckCircle2
                className="absolute right-2.5 top-2.5 h-4 w-4"
                style={{ color: 'var(--app-accent)' }}
                aria-hidden
              />
            ) : null}
            <Icon
              className="h-5 w-5"
              style={{ color: active ? 'var(--app-accent)' : 'var(--app-muted)' }}
              aria-hidden
            />
            <span
              className="text-sm font-bold leading-none"
              style={{ color: 'var(--app-text)' }}
            >
              {m.label}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--app-muted)' }}>
              {m.sub}
            </span>
          </label>
        );
      })}
    </div>
  );
}
