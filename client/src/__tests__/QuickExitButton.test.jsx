/**
 * Tests — Quick Exit button (survivor-safety control).
 *
 * Covers the three things that matter for safety:
 *   1. it appears on reporter screens but NOT on the splash or staff screens;
 *   2. tapping it wipes in-progress form state (via the Quick Exit context);
 *   3. tapping it lands on the neutral /exit screen with no confirmation.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import QuickExitButton from '../components/QuickExitButton';
import { QuickExitProvider, useQuickExit } from '../context/QuickExitContext';

// Shows the current path so we can assert navigation happened.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderAt(initialPath) {
  return render(
    <QuickExitProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <QuickExitButton />
        <Routes>
          <Route path="/exit" element={<div>neutral cover</div>} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QuickExitProvider>,
  );
}

const exitName = { name: /leave this app now/i };

describe('QuickExitButton visibility', () => {
  it('is shown on a reporter screen', () => {
    renderAt('/report');
    expect(screen.getByRole('button', exitName)).toBeInTheDocument();
  });

  it('is hidden on the splash screen', () => {
    renderAt('/');
    expect(screen.queryByRole('button', exitName)).not.toBeInTheDocument();
  });

  it('is hidden on staff screens (different threat model)', () => {
    renderAt('/staff/reports');
    expect(screen.queryByRole('button', exitName)).not.toBeInTheDocument();
  });
});

describe('QuickExitButton behaviour', () => {
  it('navigates to the neutral screen with no confirmation dialog', async () => {
    const user = userEvent.setup();
    renderAt('/report');

    await user.click(screen.getByRole('button', exitName));

    // Straight to the neutral cover — never a confirm prompt in between.
    expect(screen.getByText('neutral cover')).toBeInTheDocument();
  });

  it('runs every registered reset when exiting (form data is discarded)', async () => {
    const user = userEvent.setup();
    let wasCleared = false;

    // A stand-in page that registers a reset, exactly as the report form does.
    function FakeForm() {
      const { registerClear } = useQuickExit();
      React.useEffect(
        () =>
          registerClear(() => {
            wasCleared = true;
          }),
        [registerClear],
      );
      return null;
    }

    render(
      <QuickExitProvider>
        <MemoryRouter initialEntries={['/report']}>
          <FakeForm />
          <QuickExitButton />
          <Routes>
            <Route path="/exit" element={<div>neutral cover</div>} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QuickExitProvider>,
    );

    await user.click(screen.getByRole('button', exitName));

    expect(wasCleared).toBe(true);
    expect(screen.getByText('neutral cover')).toBeInTheDocument();
  });
});
