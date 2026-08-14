/**
 * Unit tests — case status state machine.
 * Verifies the single canTransition() guard so status rules cannot drift.
 */

import { describe, it, expect } from 'vitest';
import {
  STATUSES,
  STAFF_ROLES,
  transitions,
  canTransition,
} from '../../services/statusTransition.js';

describe('canTransition — permitted moves', () => {
  it('allows every transition declared in the state machine', () => {
    for (const from of Object.keys(transitions)) {
      for (const [to, allowedRoles] of Object.entries(transitions[from])) {
        for (const role of allowedRoles) {
          expect(canTransition(from, to, role)).toBe(true);
        }
      }
    }
  });
});

describe('canTransition — forbidden moves', () => {
  it('rejects any transition not declared in the state machine', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const isDeclared = Boolean(transitions[from] && transitions[from][to]);
        if (!isDeclared) {
          // Use a maximally-privileged role to prove it is the EDGE that is
          // missing, not merely the role.
          expect(canTransition(from, to, 'admin')).toBe(false);
        }
      }
    }
  });

  it('rejects staying in the same status', () => {
    for (const status of STATUSES) {
      expect(canTransition(status, status, 'admin')).toBe(false);
    }
  });

  it('rejects a role that is not a staff role', () => {
    // 'reporter' is not a real role — reporters never authenticate — so no
    // transition may ever be attributed to one.
    expect(STAFF_ROLES).not.toContain('reporter');
    expect(canTransition('received', 'under_review', 'reporter')).toBe(false);
  });
});

describe('canTransition — reopening a closed case', () => {
  it('is allowed for an admin', () => {
    expect(canTransition('closed', 'under_review', 'admin')).toBe(true);
  });

  it('is rejected for a non-admin staff role', () => {
    expect(canTransition('closed', 'under_review', 'officer')).toBe(false);
    expect(canTransition('closed', 'under_review', 'attorney')).toBe(false);
  });
});
