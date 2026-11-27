'use client';

import { Building2, FileText } from 'lucide-react';
import { CopyButton } from './copy-button';
import type { PaymentMethod } from './payment-method-picker';

/** Coordonnées de règlement (comptes de l'administrateur). */
export const BANK_DETAILS = {
  baridimob: {
    rip: '00799999002821592660',
  },
  ccp: {
    name: 'OUARAS Khelil Rafik',
    account: '0028215926',
    key: '60',
  },
} as const;

interface BankDetailsProps {
  method: PaymentMethod;
  /** Montant formaté à afficher, ex. « 15 000 DZD ». */
  amountLabel: string;
}

function Row({
  label,
  value,
  mono = false,
  copyLabel,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyLabel?: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
    >
      <span
        className="text-[11px] font-bold uppercase tracking-wide shrink-0"
        style={{ color: 'var(--app-muted)' }}
      >
        {label}
      </span>
      <span
        className={`flex items-center gap-2 text-sm font-bold ${mono ? 'font-mono' : ''}`}
        style={{ color: 'var(--app-text)' }}
      >
        <span className="break-all text-right">{value}</span>
        <CopyButton value={value} label={copyLabel ?? label} />
      </span>
    </div>
  );
}

/**
 * Encart « informations de virement » adapté à la méthode choisie.
 * Thème clair/sombre via les tokens `--app-*`.
 */
export function BankDetails({ method, amountLabel }: BankDetailsProps) {
  if (method === 'baridimob') {
    const warning = 'var(--app-warning)';
    return (
      <div
        className="rounded-2xl border p-4"
        style={{
          background: 'color-mix(in oklab, var(--app-warning) 9%, var(--app-surface) 91%)',
          borderColor: 'color-mix(in oklab, var(--app-warning) 26%, var(--app-border) 74%)',
        }}
      >
        <p
          className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"
          style={{ color: warning }}
        >
          <Building2 className="h-4 w-4" aria-hidden /> BaridiMob — Virement
        </p>
        <div className="space-y-2">
          <Row label="RIP" value={BANK_DETAILS.baridimob.rip} mono copyLabel="le RIP" />
          <div
            className="flex items-center justify-between rounded-xl border px-3 py-2.5"
            style={{
              background: 'color-mix(in oklab, var(--app-warning) 8%, var(--app-surface) 92%)',
              borderColor: 'color-mix(in oklab, var(--app-warning) 22%, var(--app-border) 78%)',
            }}
          >
            <span
              className="text-[11px] font-bold uppercase tracking-wide"
              style={{ color: 'var(--app-muted)' }}
            >
              Montant
            </span>
            <span className="text-sm font-bold" style={{ color: warning }}>
              {amountLabel}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--app-muted)' }}>
          Effectuez le virement via l&apos;app BaridiMob puis joignez le reçu. Validation manuelle sous 24h.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: 'color-mix(in oklab, var(--app-surface-2) 55%, var(--app-surface) 45%)',
        borderColor: 'var(--app-border)',
      }}
    >
      <p
        className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"
        style={{ color: 'var(--app-accent)' }}
      >
        <FileText className="h-4 w-4" aria-hidden /> CCP — Virement
      </p>
      <div className="space-y-2">
        <Row label="Nom" value={BANK_DETAILS.ccp.name} copyLabel="le nom" />
        <Row label="N° Compte" value={BANK_DETAILS.ccp.account} mono copyLabel="le numéro de compte" />
        <Row label="Clé" value={BANK_DETAILS.ccp.key} mono copyLabel="la clé" />
        <div
          className="flex items-center justify-between rounded-xl border px-3 py-2.5"
          style={{
            background: 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)',
            borderColor: 'color-mix(in oklab, var(--app-accent) 18%, var(--app-border) 82%)',
          }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-wide"
            style={{ color: 'var(--app-muted)' }}
          >
            Montant
          </span>
          <span className="text-sm font-bold" style={{ color: 'var(--app-accent)' }}>
            {amountLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
