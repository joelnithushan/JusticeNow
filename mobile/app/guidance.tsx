/**
 * JusticeNow (mobile) — AI Legal Guidance.
 *
 * A reporter describes a situation in plain language and gets EDUCATIONAL
 * guidance: what kind of case it may be, the Sri Lankan rights/laws that could
 * apply, and how to approach it — plus REAL legal-aid organisations from the
 * directory (filtered by the guidance category + optional district).
 *
 * This is SEPARATE from filing a case: nothing is stored, no report is created.
 * The scenario is sent to the server (which calls the AI) to generate guidance;
 * it is never persisted. We tell the user they don't need to share their name.
 * All strings go through t(); styling from theme tokens.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import axios from 'axios';
import * as Speech from 'expo-speech';
import { useTranslation } from 'react-i18next';

import ReporterTopBar from '../components/ReporterTopBar';
import SelectField, { type Option } from '../components/SelectField';
import { fetchLegalGuidance } from '../src/api/client';
import type { LegalGuidance, Organisation } from '../src/api/client';
import { DISTRICTS } from '../src/constants';
import { usePreferences } from '../src/context/PreferencesContext';
import { colors, styles as theme } from '../src/theme';

const MIN_LEN = 15;

// Map an app language to a speech locale for read-aloud. Sinhala/Tamil voice
// availability varies by device; if a locale voice is missing the platform
// falls back or stays silent — we handle that by disabling on error rather than
// crashing. Keep keys aligned with the i18n language codes.
const SPEECH_LOCALES: Record<string, string> = {
  en: 'en-US',
  ta: 'ta-IN',
  si: 'si-LK',
};

export default function Guidance() {
  const { t, i18n } = useTranslation();
  const { district: savedDistrict } = usePreferences();

  const [scenario, setScenario] = useState('');
  const [district, setDistrict] = useState<string | null>(savedDistrict ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<LegalGuidance | null>(null);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  // Whether the guidance is currently being read aloud (expo-speech).
  const [speaking, setSpeaking] = useState(false);

  const districtOptions: Option[] = DISTRICTS.map((d) => ({ value: d, label: d }));

  // Always stop any in-flight speech when leaving the screen — nothing should
  // keep reading a case aloud after the user navigates away or Quick-Exits.
  useEffect(
    () => () => {
      Speech.stop();
    },
    [],
  );

  // Flatten the structured guidance into one spoken passage, labelled section by
  // section so a listener (e.g. a low-literacy user) can follow it without the
  // screen. Real org contacts are NOT read out — they are on-screen tap targets.
  const buildSpokenGuidance = (g: LegalGuidance): string =>
    [
      `${t('guidance.categoryTitle')}: ${t(`caseTypes.${g.category}`)}. ${g.summary}`,
      g.how_handled.length ? `${t('guidance.handledTitle')}. ${g.how_handled.join('. ')}` : '',
      g.applicable_laws.length ? `${t('guidance.lawsTitle')}. ${g.applicable_laws.join('. ')}` : '',
      g.steps.length ? `${t('guidance.stepsTitle')}. ${g.steps.join('. ')}` : '',
      g.approximate_fees ? `${t('guidance.feesTitle')}. ${g.approximate_fees}` : '',
      g.safety_note ? `${t('guidance.safetyTitle')}. ${g.safety_note}` : '',
    ]
      .filter(Boolean)
      .join('. ');

  // Toggle read-aloud. onDone/onStopped/onError all reset the button so it never
  // sticks on "Stop" if a voice is unavailable (common for si-LK/ta-IN).
  const toggleSpeak = () => {
    if (!guidance) return;
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(buildSpokenGuidance(guidance), {
      language: SPEECH_LOCALES[i18n.language] ?? 'en-US',
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const ask = async () => {
    if (loading) return;
    if (scenario.trim().length < MIN_LEN) {
      setError(t('guidance.tooShort'));
      return;
    }
    setError(null);
    setLoading(true);
    setGuidance(null);
    setOrgs([]);
    // Stop any read-aloud from a previous result before generating a new one.
    Speech.stop();
    setSpeaking(false);
    try {
      const res = await fetchLegalGuidance(scenario.trim(), district ?? undefined);
      setGuidance(res.data.data.guidance);
      setOrgs(res.data.data.organisations || []);
    } catch (err) {
      // Never log err — it can echo the scenario.
      let message = t('guidance.failed');
      if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
        message = err.response.data.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    Speech.stop();
    setSpeaking(false);
    setGuidance(null);
    setOrgs([]);
    setError(null);
    setScenario('');
  };

  return (
    <View style={local.screen}>
      <ReporterTopBar title={t('guidance.title')} />
      <ScrollView contentContainerStyle={local.body} keyboardShouldPersistTaps="handled">
        {!guidance ? (
          <>
            <Text style={local.intro}>{t('guidance.intro')}</Text>
            <View style={local.privacyChip}>
              <Text style={local.privacyText}>{t('guidance.privacy')}</Text>
            </View>

            <Text style={theme.label}>{t('guidance.scenarioLabel')}</Text>
            <TextInput
              style={[theme.input, theme.textarea]}
              value={scenario}
              onChangeText={(v) => {
                setScenario(v);
                if (error) setError(null);
              }}
              placeholder={t('guidance.scenarioPlaceholder')}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={6}
              editable={!loading}
            />
            {/* Voice input: the device keyboard's own dictation (mic key) types
                into this field, so speaking works today with no extra permission
                or native module. Same privacy caveat as the AI — dictation may
                use the platform's cloud speech service, so don't say your name. */}
            <Text style={theme.privacyNoteSmall}>{t('guidance.voiceHint')}</Text>

            <View style={local.selectWrap}>
              <SelectField
                label={t('guidance.districtLabel')}
                placeholder={t('report.districtPlaceholder')}
                value={district}
                options={districtOptions}
                onChange={setDistrict}
                sheetTitle={t('guidance.districtLabel')}
              />
              <Text style={theme.privacyNoteSmall}>{t('guidance.districtHint')}</Text>
            </View>

            {error ? <Text style={theme.fieldError}>{error}</Text> : null}

            <Pressable
              onPress={ask}
              disabled={loading}
              style={[theme.btnPrimary, loading && theme.btnDisabled]}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={theme.btnPrimaryText}>{t('guidance.submit')}</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            {/* Disclaimer first — this is information, not advice. */}
            <View style={local.disclaimer}>
              <Text style={local.disclaimerText}>{t('guidance.disclaimer')}</Text>
            </View>

            {/* Read-aloud: reads the whole guidance in the chosen language, for
                low-literacy users or hands-free listening. Fully on-device. */}
            <Pressable
              onPress={toggleSpeak}
              style={local.listenBtn}
              accessibilityRole="button"
              accessibilityLabel={speaking ? t('guidance.stopListening') : t('guidance.listen')}
              accessibilityState={{ selected: speaking }}
            >
              <Text style={local.listenIcon}>{speaking ? '■' : '▶'}</Text>
              <Text style={local.listenText}>
                {speaking ? t('guidance.stopListening') : t('guidance.listen')}
              </Text>
            </Pressable>

            {/* Structured guidance sheet — clearly categorised rows, not a wall of
                text. Each row: a labelled header + its content. */}
            <View style={local.sheet}>
              <SheetRow label={t('guidance.categoryTitle')} first>
                <Text style={local.category}>{t(`caseTypes.${guidance.category}`)}</Text>
                {guidance.summary ? <Text style={local.summary}>{guidance.summary}</Text> : null}
              </SheetRow>

              {guidance.how_handled.length > 0 ? (
                <SheetRow label={t('guidance.handledTitle')}>
                  {guidance.how_handled.map((h, i) => (
                    <Bullet key={i} text={h} />
                  ))}
                </SheetRow>
              ) : null}

              {guidance.applicable_laws.length > 0 ? (
                <SheetRow label={t('guidance.lawsTitle')}>
                  {guidance.applicable_laws.map((law, i) => (
                    <Bullet key={i} text={law} />
                  ))}
                </SheetRow>
              ) : null}

              {guidance.steps.length > 0 ? (
                <SheetRow label={t('guidance.stepsTitle')}>
                  {guidance.steps.map((step, i) => (
                    <NumberedStep key={i} n={i + 1} text={step} />
                  ))}
                </SheetRow>
              ) : null}

              {guidance.approximate_fees ? (
                <SheetRow label={t('guidance.feesTitle')}>
                  <Text style={local.bodyText}>{guidance.approximate_fees}</Text>
                  <Text style={local.feesNote}>{t('guidance.feesNote')}</Text>
                </SheetRow>
              ) : null}

              {/* Real legal help from the directory (never AI-invented). */}
              <SheetRow label={t('guidance.helpTitle')} last>
                {orgs.length > 0 ? (
                  orgs.map((o) => <OrgCard key={o.id} org={o} />)
                ) : (
                  <Text style={local.noOrgs}>{t('guidance.noOrgs')}</Text>
                )}
                <Link href="/directory" asChild>
                  <Pressable style={theme.btnSecondary} accessibilityRole="button">
                    <Text style={theme.btnSecondaryText}>{t('guidance.viewDirectory')}</Text>
                  </Pressable>
                </Link>
              </SheetRow>
            </View>

            {guidance.safety_note ? (
              <View style={local.safetyBox} accessibilityRole="alert">
                <Text style={local.safetyTitle}>{t('guidance.safetyTitle')}</Text>
                <Text style={local.safetyText}>{guidance.safety_note}</Text>
              </View>
            ) : null}

            <Pressable onPress={reset} style={local.againBtn} accessibilityRole="button">
              <Text style={local.againText}>{t('guidance.again')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// One labelled row of the guidance sheet: a tinted header bar + its content.
function SheetRow({
  label,
  children,
  first,
  last,
}: {
  label: string;
  children: React.ReactNode;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[local.row, !last && local.rowDivider]}>
      <Text style={[local.rowLabel, first && local.rowLabelFirst]}>{label}</Text>
      <View style={local.rowContent}>{children}</View>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={local.bulletRow}>
      <Text style={local.bulletDot}>•</Text>
      <Text style={local.bulletText}>{text}</Text>
    </View>
  );
}

function NumberedStep({ n, text }: { n: number; text: string }) {
  return (
    <View style={local.bulletRow}>
      <View style={local.stepNum}>
        <Text style={local.stepNumText}>{n}</Text>
      </View>
      <Text style={local.bulletText}>{text}</Text>
    </View>
  );
}

function OrgCard({ org }: { org: Organisation }) {
  return (
    <View style={local.orgCard}>
      <Text style={local.orgName}>{org.name}</Text>
      <Text style={local.orgMeta}>{org.district}</Text>
      {org.description ? (
        <Text style={local.orgDesc} numberOfLines={2}>
          {org.description}
        </Text>
      ) : null}
      <View style={local.orgActions}>
        {org.contact_phone ? (
          <Pressable
            onPress={() => Linking.openURL(`tel:${org.contact_phone}`)}
            accessibilityRole="button"
          >
            <Text style={local.orgLink}>{org.contact_phone}</Text>
          </Pressable>
        ) : null}
        {org.contact_email ? (
          <Pressable
            onPress={() => Linking.openURL(`mailto:${org.contact_email}`)}
            accessibilityRole="button"
          >
            <Text style={local.orgLink}>{org.contact_email}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 40 },
  intro: { fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: 14 },
  privacyChip: {
    backgroundColor: colors.primaryTint,
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  privacyText: { fontSize: 13, color: colors.primary, fontWeight: '600', lineHeight: 19 },
  selectWrap: { marginTop: 14, marginBottom: 4 },

  disclaimer: {
    backgroundColor: colors.secondaryTint,
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  disclaimerText: { fontSize: 13, color: colors.secondaryOnLight, fontWeight: '600', lineHeight: 19 },

  // Read-aloud toggle.
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    marginBottom: 18,
  },
  listenIcon: { fontSize: 14, color: colors.primary },
  listenText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  // Structured "sheet": bordered card, each section a labelled row.
  sheet: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 18,
  },
  row: { paddingBottom: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    backgroundColor: colors.primaryTint,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  rowLabelFirst: {},
  rowContent: { paddingHorizontal: 14 },
  category: { fontSize: 18, fontWeight: '700', color: colors.primary },
  summary: { fontSize: 15, color: colors.text, lineHeight: 22, marginTop: 6 },
  bodyText: { fontSize: 15, color: colors.text, lineHeight: 22 },
  feesNote: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 6, fontStyle: 'italic' },

  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  bulletDot: { fontSize: 16, color: colors.primary, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 22 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: colors.primaryText, fontSize: 13, fontWeight: '800' },

  safetyBox: {
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  safetyTitle: { fontSize: 14, fontWeight: '800', color: '#7A1416', marginBottom: 4 },
  safetyText: { fontSize: 14, color: '#7A1416', lineHeight: 20 },

  orgCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  orgName: { fontSize: 15, fontWeight: '700', color: colors.text },
  orgMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  orgDesc: { fontSize: 14, color: colors.text, lineHeight: 20, marginTop: 6 },
  orgActions: { marginTop: 8, gap: 4 },
  orgLink: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  noOrgs: { fontSize: 14, color: colors.muted, marginBottom: 12, lineHeight: 20 },

  againBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  againText: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
