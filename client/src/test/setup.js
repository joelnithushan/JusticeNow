/**
 * Vitest setup for client component tests.
 * - adds jest-dom matchers (toBeInTheDocument, etc.)
 * - initialises i18n so t('key') returns real English strings in tests
 * - unmounts React trees between tests to keep them isolated
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '../i18n';

afterEach(() => {
  cleanup();
});
