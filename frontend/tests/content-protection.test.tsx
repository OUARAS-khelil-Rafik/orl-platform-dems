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

  it('exempts admin from all restrictions (no class, copy/print allowed)', () => {
    const { unmount } = render(<ContentProtection isAdmin />);

    expect(document.body).not.toHaveClass('content-protection-enabled');

    // Copy and print shortcuts are not blocked for admin
    expect(fireEvent.copy(document)).toBe(true);
    expect(fireEvent.keyDown(window, { key: 'p', ctrlKey: true })).toBe(true);

    unmount();
    expect(document.body).not.toHaveClass('content-protection-enabled');
  });

  it('admin: Ctrl+A and mouse selection are allowed', () => {
    const { unmount } = render(<ContentProtection isAdmin />);

    expect(document.body).not.toHaveClass('content-protection-enabled');

    // Ctrl+A not intercepted for admin
    expect(fireEvent.keyDown(window, { key: 'a', ctrlKey: true })).toBe(true);

    // Mouse selection (selectstart) not intercepted for admin
    const adminSelectStart = new Event('selectstart', { bubbles: true, cancelable: true });
    expect(document.body.dispatchEvent(adminSelectStart)).toBe(true);

    unmount();
  });

  it('non-admin: Ctrl+A and mouse selection are blocked', () => {
    render(<ContentProtection />);

    // Ctrl+A is intercepted for non-admin
    expect(fireEvent.keyDown(window, { key: 'a', ctrlKey: true })).toBe(false);

    // Mouse selection (selectstart) is intercepted outside editable fields
    const selectStartEvent = new Event('selectstart', { bubbles: true, cancelable: true });
    expect(document.body.dispatchEvent(selectStartEvent)).toBe(false);

    expect(screen.getByText('Copie et collage désactivés sur cette plateforme.')).toBeInTheDocument();
  });
});
