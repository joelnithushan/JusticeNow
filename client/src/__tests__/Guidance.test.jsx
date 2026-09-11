/**
 * Component tests — "Know your rights" guidance pages (JNOW-39).
 *
 * The pages are pure i18n content: no API, no storage, no auth. What matters
 * here is (1) every topic renders with its title and points, (2) an unknown
 * topic id can never render a broken/blank page, and (3) the lawyer-review
 * caveat is always visible, on both the list and detail pages.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Guidance from '../pages/Guidance';
import GuidanceTopic from '../pages/GuidanceTopic';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guidance" element={<Guidance />} />
        <Route path="/guidance/:topicId" element={<GuidanceTopic />} />
        <Route path="*" element={<div>fallback</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Guidance (topic list)', () => {
  it('renders the heading, intro and all three topics', () => {
    renderAt('/guidance');

    expect(
      screen.getByRole('heading', { name: 'Know your rights' }),
    ).toBeInTheDocument();

    // One link per topic, identifiable by its title.
    expect(
      screen.getByRole('link', {
        name: /rights during arrest and detention/i,
      }),
    ).toHaveAttribute('href', '/guidance/arrest_detention');
    expect(
      screen.getByRole('link', {
        name: /protection from discrimination and harassment/i,
      }),
    ).toHaveAttribute('href', '/guidance/discrimination_harassment');
    expect(screen.getByRole('link', { name: /free legal aid/i })).toHaveAttribute(
      'href',
      '/guidance/legal_aid',
    );
  });

  it('always shows the lawyer-review caveat', () => {
    renderAt('/guidance');
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });
});

describe('GuidanceTopic (topic detail)', () => {
  it('renders the topic title and its points', () => {
    renderAt('/guidance/arrest_detention');

    expect(
      screen.getByRole('heading', {
        name: /rights during arrest and detention/i,
      }),
    ).toBeInTheDocument();

    // A known point from en.json, rendered as list content.
    expect(
      screen.getByText(/must be brought before a magistrate within 24 hours/i),
    ).toBeInTheDocument();
  });

  it('always shows the lawyer-review caveat on the detail page too', () => {
    renderAt('/guidance/legal_aid');
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });

  it('redirects an unknown topic id to the topic list', () => {
    renderAt('/guidance/not-a-topic');
    expect(
      screen.getByRole('heading', { name: 'Know your rights' }),
    ).toBeInTheDocument();
  });
});
