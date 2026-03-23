import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Navbar } from '@/components/layout/navbar';

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

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    profile: {
      uid: 'u1',
      role: 'admin',
      email: 'admin@test.local',
      displayName: 'Admin User',
      photoURL: '',
    },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/components/providers/cart-provider', () => ({
  useCart: () => ({
    itemCount: 0,
  }),
}));

describe('Navbar user menu', () => {
  it('opens then closes on outside click', async () => {
    render(<Navbar />);

    const trigger = screen.getByRole('button', { name: /Dr\. Admin User/i });
    fireEvent.click(trigger);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});
