'use client';

import Image from 'next/image';
import { FileText, Image as ImageIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { type SupportChatAttachment } from '@/lib/utils/support-chat-attachments';

type SupportChatAttachmentProps = {
  attachment: SupportChatAttachment;
  onRemove?: () => void;
};

export function SupportChatAttachmentCard({ attachment, onRemove }: SupportChatAttachmentProps) {
  const isImage = attachment.kind === 'image';
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isPreviewOpen]);

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPreviewOpen]);

  const closePreview = () => {
    setIsPreviewOpen(false);
  };

  if (isImage) {
    return (
      <>
        <div className="overflow-hidden rounded-xl border border-(--app-border) bg-(--app-surface) shadow-sm">
          <div className="relative aspect-[4/3] w-full min-w-[14rem] max-w-full bg-[color-mix(in_oklab,var(--app-surface-alt)_72%,white_28%)]">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="group relative block h-full w-full text-left"
              aria-label={`Ouvrir l'aperçu de ${attachment.name}`}
              title="Cliquer pour agrandir"
            >
              <Image
                src={attachment.url}
                alt={attachment.name}
                fill
                sizes="(max-width: 640px) 100vw, 280px"
                className="object-cover"
                unoptimized
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

              <div className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                Cliquer pour agrandir
              </div>
            </button>

            {onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/75"
                aria-label="Retirer la piece jointe"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--app-accent)_16%,var(--app-surface)_84%)] text-(--app-accent)">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-(--app-text)">Photo</p>
              <p className="truncate text-sm text-(--app-muted)" title={attachment.name}>
                {attachment.name}
              </p>
            </div>
          </div>
        </div>

        {isPreviewOpen && typeof document !== 'undefined'
          ? createPortal(
              <div
                className="fixed inset-0 z-[120] bg-black/35 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-label={`Aperçu de ${attachment.name}`}
                onClick={closePreview}
              >
                <div
                  className="relative flex h-full w-full items-center justify-center p-4"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={closePreview}
                    className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70"
                    aria-label="Fermer l'aperçu"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <div className="relative h-full w-full">
                    <Image
                      src={attachment.url}
                      alt={attachment.name}
                      fill
                      sizes="100vw"
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-(--app-border) bg-(--app-surface) px-3 py-2 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--app-accent)_16%,var(--app-surface)_84%)] text-(--app-accent)">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--app-text)">PDF</p>
        <p className="truncate text-sm text-(--app-muted)" title={attachment.name}>
          {attachment.name}
        </p>
      </div>
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-(--app-border) px-3 py-1.5 text-xs font-semibold text-(--app-text) transition hover:bg-(--app-surface-2)"
      >
        Ouvrir
      </a>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--app-border) text-(--app-muted) transition hover:bg-(--app-surface-2) hover:text-(--app-text)"
          aria-label="Retirer la piece jointe"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
