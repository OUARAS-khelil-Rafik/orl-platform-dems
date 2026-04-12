import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoPage from '@/pages/video-detail';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', {
    alt: '',
    ...props,
  }),
}));

const routerPush = vi.fn();

vi.mock('next/router', () => ({
  useRouter: () => ({
    query: { id: 'video-1' },
    isReady: true,
    push: routerPush,
  }),
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    profile: { uid: 'u1', role: 'vip_plus', email: 'user@test.local' },
    loading: false,
  }),
}));

vi.mock('@/components/providers/cart-provider', () => ({
  useCart: () => ({
    addItem: vi.fn(),
    items: [],
  }),
}));

vi.mock('@/lib/security/access-control', () => ({
  canAccessVideo: () => true,
}));

const fixtures = {
  video: {
    id: 'video-1',
    title: 'Video Test',
    description: 'Description test',
    url: 'https://example.test/video.mp4',
    subspecialty: 'otologie',
    section: 'anatomie',
    isFreeDemo: true,
    price: 0,
    packId: 'otologie',
  },
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

vi.mock('@/lib/data/local-data', () => ({
  db: {},
  doc: (_db: unknown, _coll: string, id: string) => ({ id }),
  getDoc: async (_docRef: { id: string }) => ({
    id: fixtures.video.id,
    exists: () => true,
    data: () => fixtures.video,
  }),
  collection: (_db: unknown, name: string) => ({ name }),
  where: (fieldPath: string, operator: string, value: string) => ({ fieldPath, operator, value }),
  query: (collectionRef: { name: string }) => ({ collection: collectionRef.name }),
  getDocs: async (source: { collection?: string; name?: string }) => {
    const coll = source.collection ?? source.name;
    const data =
      coll === 'qcms'
        ? fixtures.qcms
        : coll === 'clinicalCases'
          ? fixtures.clinicalCases
          : coll === 'openQuestions'
            ? fixtures.openQuestions
            : coll === 'diagrams'
              ? fixtures.diagrams
              : [];

    const docs = makeDocs(data);
    return {
      docs,
      forEach: (cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) => docs.forEach(cb),
    };
  },
  addDoc: vi.fn(),
}));

describe('Video detail page', () => {
  beforeEach(() => {
    fixtures.qcms = [];
    fixtures.clinicalCases = [
      {
        id: 'case-1',
        videoId: 'video-1',
        description: 'Cas de test',
        questions: [],
      },
    ];
    fixtures.openQuestions = [
      {
        id: 'open-1',
        videoId: 'video-1',
        question: 'Question ouverte test',
        answer: 'Reponse ouverte test',
      },
    ];
    fixtures.diagrams = [];
  });

  it('navigates between tabs including Questions Ouvertes', async () => {
    render(<VideoPage />);

    await waitFor(() => expect(screen.getByText('Video Test')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Questions Ouvertes/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: /Questions Ouvertes/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Afficher la réponse/i })).toBeInTheDocument();
  });

  it('validates a single-choice QCM correctly', async () => {
    fixtures.qcms = [
      {
        id: 'qcm-single',
        videoId: 'video-1',
        question: 'Question single',
        mode: 'single',
        options: ['Option A', 'Option B', 'Option C', 'Option D', 'Option E'],
        correctOptionIndexes: [1],
      },
    ];

    render(<VideoPage />);

    await waitFor(() => expect(screen.getByText('Video Test')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^QCM$/i }));
    await waitFor(() => expect(screen.getByText('Option B')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Option B').closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: /Valider/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Recommencer/i })).toBeInTheDocument());
  });

  it('validates a multiple-choice QCM correctly', async () => {
    fixtures.qcms = [
      {
        id: 'qcm-multiple',
        videoId: 'video-1',
        question: 'Question multiple',
        mode: 'multiple',
        options: ['Option A', 'Option B', 'Option C', 'Option D', 'Option E'],
        correctOptionIndexes: [0, 2],
      },
    ];

    render(<VideoPage />);

    await waitFor(() => expect(screen.getByText('Video Test')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^QCM$/i }));
    await waitFor(() => expect(screen.getByText('Option A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Option A').closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByText('Option C').closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: /Valider/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Recommencer/i })).toBeInTheDocument());
  });

  it('shows configuration error when QCM has no valid correct answers', async () => {
    fixtures.qcms = [
      {
        id: 'qcm-invalid-correct',
        videoId: 'video-1',
        question: 'Question invalide',
        mode: 'single',
        options: ['Option A', 'Option B'],
        correctOptionIndexes: [],
      },
    ];

    render(<VideoPage />);

    await waitFor(() => expect(screen.getByText('Video Test')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^QCM$/i }));

    await waitFor(() =>
      expect(screen.getByText(/Ce QCM est mal configure: aucune bonne reponse valide n'est definie/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Valider/i })).toBeDisabled();
  });

  it('shows unavailable options message when QCM options are missing', async () => {
    fixtures.qcms = [
      {
        id: 'qcm-invalid-options',
        videoId: 'video-1',
        question: 'Question sans options',
        mode: 'single',
        correctOptionIndexes: [0],
      },
    ];

    render(<VideoPage />);

    await waitFor(() => expect(screen.getByText('Video Test')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^QCM$/i }));

    await waitFor(() => expect(screen.getByText(/Les options de ce QCM sont indisponibles/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Valider/i })).toBeDisabled();
  });
});
