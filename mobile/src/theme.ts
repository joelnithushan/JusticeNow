/**
 * JusticeNow (mobile) — Shared colours and styles.
 *
 * Kept in one place so every screen looks consistent and we do not redeclare
 * the same StyleSheet in each file. This is the RN equivalent of the web app's
 * shared CSS classes (page, btn, field-error, etc.).
 */

import { StyleSheet } from 'react-native';

export const colors = {
  primary: '#0b3d5c',
  primaryText: '#ffffff',
  secondary: '#e8eef2',
  text: '#1a1a1a',
  muted: '#5a6b74',
  danger: '#b00020',
  border: '#c3ced4',
  background: '#ffffff',
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
    backgroundColor: colors.secondary,
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
    backgroundColor: colors.secondary,
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
