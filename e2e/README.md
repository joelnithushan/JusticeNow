# End-to-end tests

Playwright specs that drive the built app in a real browser.

- `reporter-journey.spec.js` — anonymous reporter navigation, language switch, quick exit (submit/lookup pending backend).
- `staff-journey.spec.js` — staff login → case management (pending auth + backend).
- `accessibility.spec.js` — axe-core scan of every public page.

Run them:

```bash
npm run test:e2e      # all Playwright specs (builds + serves the client first)
npm run test:a11y     # accessibility spec only
```

First time only, install the browser binaries:

```bash
npx playwright install --with-deps
```

Tests marked `test.fixme` depend on features not yet built (staff auth, the
anonymous status lookup). They show as **skipped**, not failed, and are the
executable spec for those stories. See [`../TESTING.md`](../TESTING.md) for the
full testing guide.
