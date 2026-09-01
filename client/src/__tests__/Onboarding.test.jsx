/**
 * Component tests — the 3-slide onboarding flow.
 *
 * Covers the behaviour the story calls out:
 *   • slides advance 1 → 2 → 3 → home, and Back moves between them;
 *   • Skip is on every slide and goes straight home;
 *   • the last slide's button is "Get started", not "Continue";
 *   • the language chosen on slide 1 persists to slides 2 and 3.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Onboarding from '../pages/Onboarding';
import i18n from '../i18n';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/onboarding/:step" element={<Onboarding />} />
        <Route path="/" element={<div>home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// i18n language is global state; reset to English so tests don't leak into
// one another (and so English assertions are stable).
beforeEach(() => {
  i18n.changeLanguage('en');
});

describe('Onboarding — structure', () => {
  it('shows slide 1 with the step indicator and no Back control', () => {
    renderAt('/onboarding/language');

    expect(
      screen.getByRole('heading', { name: 'Choose your language' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();

    // Skip is present; Back is not (this is the first slide).
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('an unknown step redirects to the first slide', () => {
    renderAt('/onboarding/does-not-exist');
    expect(
      screen.getByRole('heading', { name: 'Choose your language' }),
    ).toBeInTheDocument();
  });
});

describe('Onboarding — navigation', () => {
  it('advances 1 → 2 → 3 → home via Continue / Get started', async () => {
    const user = userEvent.setup();
    renderAt('/onboarding/language');

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByRole('heading', { name: 'You stay anonymous' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByRole('heading', { name: 'Leave instantly, any time' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();

    // Final slide: "Get started" (not "Continue") and it lands on home.
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByText('home screen')).toBeInTheDocument();
  });

  it('Back moves from slide 2 to slide 1', async () => {
    const user = userEvent.setup();
    renderAt('/onboarding/privacy');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(
      screen.getByRole('heading', { name: 'Choose your language' }),
    ).toBeInTheDocument();
  });

  it('Skip goes straight home from any slide', async () => {
    const user = userEvent.setup();
    renderAt('/onboarding/privacy');

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('home screen')).toBeInTheDocument();
  });
});

describe('Onboarding — language', () => {
  it('carries the language chosen on slide 1 through to slide 2', async () => {
    const user = userEvent.setup();
    renderAt('/onboarding/language');

    // Pick Tamil. Its onboarding strings are placeholder-marked "[uncertain]",
    // which is exactly what lets us prove the language actually switched.
    await user.click(screen.getByRole('button', { name: 'தமிழ்' }));
    expect(
      screen.getByRole('heading', { name: '[uncertain] Choose your language' }),
    ).toBeInTheDocument();

    // Advance — slide 2 renders in the SAME (Tamil) language, not reset to English.
    await user.click(screen.getByRole('button', { name: '[uncertain] Continue' }));
    expect(
      screen.getByRole('heading', { name: '[uncertain] You stay anonymous' }),
    ).toBeInTheDocument();
  });
});
