import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PricingPage from '@/pages/pricing';

const replaceMock = vi.fn();

vi.mock('next/router', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    pathname: '/pricing',
    asPath: '/pricing',
  }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        return ({ children, ...props }: { children?: React.ReactNode }) =>
          React.createElement(tag, props, children);
      },
    },
  ),
}));

let mockAuth = {
  profile: null as null | Record<string, unknown>,
  loading: false,
};

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => mockAuth,
}));

describe('PricingPage for VIP Plus', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    mockAuth = { profile: null, loading: false };
  });

  it('does not display the pricing page for vip_plus users', async () => {
    mockAuth = {
      loading: false,
      profile: {
        uid: 'vip-1',
        role: 'vip_plus',
        email: 'vip@test.local',
        subscriptionApprovalStatus: 'approved',
        subscriptionEndDate: '2099-01-01T00:00:00.000Z',
      },
    };

    const { container } = render(<PricingPage />);

    // Page content is not rendered.
    expect(screen.queryByText('Investissez dans votre réussite')).not.toBeInTheDocument();
    expect(screen.queryByText('VIP Plus')).not.toBeInTheDocument();
    expect(screen.queryByText(/DZD/)).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/tarif/i);

    // And no pricing amounts are displayed.
    expect(screen.queryByText('15 000')).not.toBeInTheDocument();
    expect(screen.queryByText(/150 000 DZD/)).not.toBeInTheDocument();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('renders pricing page for non vip_plus users', () => {
    mockAuth = {
      loading: false,
      profile: { uid: 'u1', role: 'user', email: 'user@test.local' },
    };

    render(<PricingPage />);

    expect(screen.getByText('Investissez dans votre réussite')).toBeInTheDocument();
    expect(screen.getByText('VIP Plus')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
