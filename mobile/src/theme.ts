/**
 * JusticeNow (mobile) — Shared colours and styles.
 *
 * Kept in one place so every screen looks consistent and we do not redeclare
 * the same StyleSheet in each file. This is the RN equivalent of the web app's
 * shared CSS classes (page, btn, field-error, etc.).
 */

import { StyleSheet } from 'react-native';

export const colors = {
  // ── 30% blue — primary (app bar, primary buttons, active/selected, headings) ──
  primary: '#0A3559',
  primaryPressed: '#0A3559',
  // Light blue fill: info panels, selected rows, badges, disabled surfaces.
  // (This is the former neutral "secondary" #e8eef2 slot, now the blue tint.)
  primaryTint: '#E7F0F8',
  primaryText: '#ffffff',

  // ── 10% orange — secondary. At most ONE solid-orange element per screen. ──
  // HARD RULE: text on solid #F18501 MUST be `onSecondary` (#3D2200); white/light
  // text on it fails WCAG AA (2.6:1). Never use #F18501 as text/icon on light —
  // use `secondaryOnLight` (#7A4A00). Orange is NEVER used in the safety path.
  secondary: '#F18501',
  secondaryPressed: '#D07500',
  secondaryTint: '#FDF0DE',
  onSecondary: '#3D2200',
  secondaryOnLight: '#7A4A00',

  // ── 60% neutral — unchanged ──
  text: '#1a1a1a',
  muted: '#5a6b74',
  border: '#c3ced4',
  background: '#ffffff',

  // ── Error / safety — unchanged. Orange must never appear here. ──
  danger: '#b00020',

  // Brand gradient (app bar / headers — part of the 30% blue). Blue only, using
  // the listed hexes primary → primary-pressed (no new colours introduced).
  gradientTop: '#0A3559',
  gradientBottom: '#0A3559',
};

export const styles = StyleSheet.create({
  // Screen container. Screens usually wrap this in a ScrollView.
  page: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 56, // leave room for the floating Quick Exit button
    backgroundColor: colors.background,
  },
  h1: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: colors.muted,
    marginBottom: 16,
  },
  paragraph: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 12,
  },
  privacyNote: {
    fontSize: 14,
    color: colors.primary,
    backgroundColor: colors.primaryTint,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  privacyNoteSmall: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    marginTop: 12,
  },
  optional: {
    fontWeight: '400',
    color: colors.muted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  textarea: {
    minHeight: 120,
    textAlignVertical: 'top', // Android: start text at the top
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  fieldError: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 4,
  },
  // Buttons
  btnPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  btnPrimaryText: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: colors.primaryTint,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  btnSecondaryText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  // Orange secondary CTA — for the ONE permitted secondary action per screen
  // (e.g. "Track my case", "Find legal help"). Never a primary action; never in
  // the safety path. Text MUST be on-secondary (#3D2200) — white on orange fails AA.
  btnAccent: {
    backgroundColor: colors.secondary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  btnAccentText: {
    color: colors.onSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  btnLink: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  btnLinkText: {
    color: colors.primary,
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
