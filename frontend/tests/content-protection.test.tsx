import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentProtection } from '@/components/security/content-protection';

describe('ContentProtection', () => {
  afterEach(() => {
    document.body.classList.remove('content-protection-enabled');
  });

  it('enables and cleans up the global protection class', () => {
    const { unmount } = render(<ContentProtection />);

    expect(document.body).toHaveClass('content-protection-enabled');

    unmount();

    expect(document.body).not.toHaveClass('content-protection-enabled');
  });

  it('blocks copy events globally', () => {
    render(<ContentProtection />);

    expect(fireEvent.copy(document)).toBe(false);
    expect(screen.getByText('Copie et collage désactivés sur cette plateforme.')).toBeInTheDocument();
  });

  it('blocks print shortcuts', () => {
    render(<ContentProtection />);

    expect(fireEvent.keyDown(window, { key: 'p', ctrlKey: true })).toBe(false);
    expect(screen.getByText('Impression désactivée pour protéger le contenu.')).toBeInTheDocument();
  });

  it('keeps paste usable inside form fields', () => {
    render(
      <>
        <ContentProtection />
        <input aria-label="Email" />
      </>
    );

    expect(fireEvent.paste(screen.getByLabelText('Email'))).toBe(true);
  });
});
