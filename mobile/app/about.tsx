/**
 * JusticeNow (mobile) — About / How-it-works / Privacy & Safety.
 *
 * A calm, read-only informational screen for reporters explaining what
 * JusticeNow is, how the report → reference-code → status-check flow works, and
 * — most importantly — the anonymity and safety guarantees the whole product is
 * built on.
 *
 * This is a reporter screen, so it wears the shared ReporterTopBar (Back). The
 * global Quick Exit button floats over every screen already (mounted once in
 * the root layout), so we deliberately do NOT add one here.
 *
 * SAFETY / ANONYMITY messaging (see CLAUDE.md — anonymity by construction):
 *  - We restate, in plain language, that no name/phone/email/account exists and
 *    that the reference code is the ONLY link to a case and cannot be recovered.
 *    This is not marketing copy — it sets the reporter's correct mental model so
 *    they write the code down and understand the risk of losing it.
 *  - Nothing on this screen fetches, stores, or logs anything; it is static text
 *    via t() only.
 *
 * All strings go through t(); all styling comes from theme tokens.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import ReporterTopBar from '../components/ReporterTopBar';
import BrandLogo from '../components/BrandLogo';
import { colors, styles as theme } from '../src/theme';

export default function About() {
  const { t } = useTranslation();

  return (
    <View style={local.screen}>
      <ReporterTopBar title={t('about.title')} />

      <ScrollView contentContainerStyle={theme.page}>
        {/* Brand seal on the light surface, echoing onboarding/preferences. */}
        <View style={local.brandRow}>
          <BrandLogo size={64} accessibilityLabel={t('app.title')} />
        </View>

        {/* 1 · What JusticeNow is */}
        <Section title={t('about.whatTitle')}>
          <Text style={theme.paragraph}>{t('about.whatBody')}</Text>
        </Section>

        {/* 2 · How it works — a 3-step ordered list. */}
        <Section title={t('about.howTitle')}>
          <Step index={1} text={t('about.how1')} />
          <Step index={2} text={t('about.how2')} />
          <Step index={3} text={t('about.how3')} />
        </Section>

        {/* 3 · Your anonymity — grouped as a callout card so it reads as a
            promise, not just body text. */}
        <Callout title={t('about.anonTitle')}>
          <Text style={local.calloutBody}>{t('about.anonBody1')}</Text>
          <Text style={[local.calloutBody, local.calloutBodySpaced]}>
            {t('about.anonBody2')}
          </Text>
        </Callout>

        {/* 4 · Staying safe — Quick Exit explainer + where to keep the code. */}
        <Callout title={t('about.safetyTitle')}>
          <Text style={local.calloutBody}>{t('about.safetyBody')}</Text>
        </Callout>

        {/* 5 · SDG 16 footer line (same tone as splash.footer). */}
        <Text style={local.footer}>{t('about.footer')}</Text>
      </ScrollView>
    </View>
  );
}

/** A titled content block. The heading is exposed to screen readers as a header. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={local.section}>
      <Text style={local.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** A numbered step for the "How it works" list. */
function Step({ index, text }: { index: number; text: string }) {
  return (
    <View style={local.step}>
      <View style={local.stepBadge}>
        <Text style={local.stepBadgeText}>{index}</Text>
      </View>
      <Text style={local.stepText}>{text}</Text>
    </View>
  );
}

/** An emphasised callout card for the anonymity / safety promises. */
function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={local.callout}>
      <Text style={local.calloutTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const local = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  brandRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  stepBadgeText: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  callout: {
    backgroundColor: colors.primaryTint,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 8,
  },
  calloutBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  calloutBodySpaced: {
    marginTop: 10,
  },
  footer: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
});
