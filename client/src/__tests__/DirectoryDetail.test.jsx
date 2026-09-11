/**
 * Component tests — OrganisationDetail page (JNOW-38).
 *
 * OrganisationDetail reads the org object from router location.state
 * (passed by Directory when the user clicks a card). There is no API
 * call inside the component itself, so no vi.mock of the API layer is
 * needed here — the test simply supplies the state via MemoryRouter.
 *
 * Test plan:
 *   1. Happy path — canned org in state:
 *      • org name, district, description all render as text
 *      • case-type chips render via caseTypes.* i18n keys
 *      • contact_phone renders as a tel: link
 *      • contact_email renders as a mailto: link
 *
 *   2. No state (direct navigation / reload) — the component redirects
 *      to /directory; the not-found / redirect destination renders, NOT
 *      the detail content.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import OrganisationDetail from '../pages/OrganisationDetail';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

/** A realistic canned organisation covering every field tested. */
const CANNED_ORG = {
  id: 'org-1',
  name: 'Jaffna Legal Aid Centre',
  district: 'Jaffna',
  description:
    'Free legal representation for harassment and unlawful detention cases in the Northern Province.',
  case_types: ['harassment', 'unlawful_detention'],
  contact_phone: '+94-21-222-1234',
  contact_email: 'help@jaffnalegal.lk',
};

/**
 * Render OrganisationDetail at /directory/org-1, optionally passing
 * location.state. A sibling /directory route acts as the redirect target
 * so we can assert the redirect in the not-found test.
 */
function renderDetail(org = CANNED_ORG) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/directory/org-1', state: { org } }]}
    >
      <Routes>
        {/*
         * The real App nests this under /directory/:id with the org passed
         * via state. We replicate the same structure so useLocation().state
         * resolves correctly without needing useParams at all.
         */}
        <Route path="/directory/:id" element={<OrganisationDetail />} />
        {/* Redirect target — must exist or MemoryRouter throws. */}
        <Route
          path="/directory"
          element={<div>directory-fallback</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** Render the detail page WITHOUT location.state (simulates direct navigation). */
function renderDetailWithoutState() {
  return render(
    <MemoryRouter initialEntries={['/directory/org-1']}>
      <Routes>
        <Route path="/directory/:id" element={<OrganisationDetail />} />
        <Route
          path="/directory"
          element={<div>directory-fallback</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrganisationDetail', () => {
  describe('happy path — org passed via location.state', () => {
    it('renders the organisation name as the page heading', () => {
      renderDetail();
      expect(
        screen.getByRole('heading', { name: CANNED_ORG.name }),
      ).toBeInTheDocument();
    });

    it('renders the district', () => {
      renderDetail();
      expect(screen.getByText(CANNED_ORG.district)).toBeInTheDocument();
    });

    it('renders the description', () => {
      renderDetail();
      expect(screen.getByText(CANNED_ORG.description)).toBeInTheDocument();
    });

    it('renders a chip for each case type (translated via i18n)', () => {
      renderDetail();
      // caseTypes.harassment → "Harassment", caseTypes.unlawful_detention → "Unlawful detention"
      expect(screen.getByText('Harassment')).toBeInTheDocument();
      expect(screen.getByText('Unlawful detention')).toBeInTheDocument();
    });

    it('renders contact_phone as a tel: link', () => {
      renderDetail();
      // Use a literal string match — phone numbers contain '+' and '-' which
      // have special meaning in RegExp, so we find the link by its href attribute
      // and assert it is visible in the document.
      const phoneLink = screen.getByRole('link', {
        name: (_, el) =>
          el.tagName === 'A' &&
          el.getAttribute('href') === `tel:${CANNED_ORG.contact_phone}`,
      });
      expect(phoneLink).toBeInTheDocument();
      expect(phoneLink).toHaveAttribute(
        'href',
        `tel:${CANNED_ORG.contact_phone}`,
      );
    });

    it('renders contact_email as a mailto: link', () => {
      renderDetail();
      const emailLink = screen.getByRole('link', {
        name: new RegExp(CANNED_ORG.contact_email, 'i'),
      });
      expect(emailLink).toHaveAttribute(
        'href',
        `mailto:${CANNED_ORG.contact_email}`,
      );
    });
  });

  describe('not-found / no state — direct navigation or page reload', () => {
    it('redirects to /directory when no org state is present', () => {
      /*
       * The component calls <Navigate to="/directory" replace /> when
       * location.state?.org is undefined. After the redirect, the /directory
       * route renders — we assert on its fallback text rather than any detail
       * content so the test is robust to future copy changes.
       */
      renderDetailWithoutState();

      // Detail content must NOT appear.
      expect(
        screen.queryByRole('heading', { name: CANNED_ORG.name }),
      ).not.toBeInTheDocument();

      // The /directory route (our test fallback) SHOULD appear.
      expect(screen.getByText('directory-fallback')).toBeInTheDocument();
    });
  });
});
