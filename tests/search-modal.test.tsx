import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchModal } from '@/components/search-modal';

const routerPush = vi.fn();

vi.mock('next/router', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const fixtures = {
  videos: [] as Array<Record<string, unknown>>,
  qcms: [] as Array<Record<string, unknown>>,
  clinicalCases: [] as Array<Record<string, unknown>>,
  openQuestions: [] as Array<Record<string, unknown>>,
  diagrams: [] as Array<Record<string, unknown>>,
};

const makeDocs = (rows: Array<Record<string, unknown>>) =>
  rows.map((row, idx) => ({
    id: String(row.id ?? `${idx + 1}`),
    data: () => row,
  }));

vi.mock('@/lib/local-data', () => ({
  db: {},
  collection: (_db: unknown, name: string) => ({ name }),
  getDocs: async (source: { name: string }) => {
    const rows =
      source.name === 'videos'
        ? fixtures.videos
        : source.name === 'qcms'
          ? fixtures.qcms
          : source.name === 'clinicalCases'
            ? fixtures.clinicalCases
            : source.name === 'openQuestions'
              ? fixtures.openQuestions
              : source.name === 'diagrams'
                ? fixtures.diagrams
                : [];

    const docs = makeDocs(rows);
    return {
      docs,
      forEach: (cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) => docs.forEach(cb),
    };
  },
}));

describe('SearchModal', () => {
  beforeEach(() => {
    routerPush.mockClear();
    fixtures.videos = [{ id: 'v1', title: 'Spécialité ORL', description: 'Cours de base' }];
    fixtures.qcms = [];
    fixtures.clinicalCases = [];
    fixtures.openQuestions = [];
    fixtures.diagrams = [];
  });

  it('matches accent-insensitive queries', async () => {
    render(<SearchModal isOpen onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Rechercher/i);
    fireEvent.change(input, { target: { value: 'specialite' } });

    await waitFor(() => expect(screen.getByText('Spécialité ORL')).toBeInTheDocument());
  });

  it('shows explicit error when result has no associated videoId', async () => {
    fixtures.qcms = [{ id: 'q1', question: 'Question sans vidéo' }];

    render(<SearchModal isOpen onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Rechercher/i);
    fireEvent.change(input, { target: { value: 'question' } });

    await waitFor(() => expect(screen.getByText('Question sans vidéo')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Question sans vidéo'));

    expect(screen.getByText(/Impossible d'ouvrir ce resultat/i)).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
