/**
 * JusticeNow — Staff route guards (client-side UX only).
 *
 * These redirect the browser for a smoother experience, but they are NOT the
 * security boundary: the SERVER guards every staff endpoint (requireStaff /
 * requireRole('admin')) and is the real authority. A user who bypasses these
 * guards still gets nothing from the API without a valid staff token.
 *
 * PRIVACY: reporters must never even reach these routes with a session, because
 * reporters never authenticate — isAuthenticated is only ever true for staff.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';

/** Requires an authenticated staff session; otherwise → /staff/login. */
export function RequireStaff({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/staff/login" replace />;
  }
  return children;
}

/**
 * Completion gate. After login a staffer whose profile is incomplete
 * (profile_completed === false) is forced to the profile page until they fill
 * it in — every other guarded staff route funnels through here.
 *
 * Deliberate NON-blocks so the staffer can actually escape the gate:
 *  - We never gate /staff/profile itself (that is where they complete it).
 *  - We wait for the profile to load before deciding — while `profile` is null
 *    we render nothing rather than bouncing on incomplete data, so a slow fetch
 *    does not flash a false redirect.
 *  - If the profile failed to load we let them through rather than trapping
 *    them; the page itself surfaces the error.
 *
 * This is UX only; the server re-derives and stores profile_completed on every
 * PATCH, so it is the real authority on completeness.
 */
export function RequireProfile({ children }) {
  const { profile } = useProfile();
  const location = useLocation();

  const onProfilePage = location.pathname === '/staff/profile';

  if (profile && profile.profile_completed === false && !onProfilePage) {
    return <Navigate to="/staff/profile" replace />;
  }
  return children;
}

/**
 * Requires an authenticated ADMIN. Non-authed → /staff/login; authed non-admin
 * → /staff/reports (the default staff landing they are allowed to see).
 */
export function RequireAdmin({ children }) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/staff/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/staff/reports" replace />;
  }
  return children;
}
