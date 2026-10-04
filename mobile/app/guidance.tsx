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
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useTranslation } from 'react-i18next';

import ReporterTopBar from '../components/ReporterTopBar';
import SelectField, { type Option } from '../components/SelectField';
import { fetchLegalGuidance } from '../src/api/client';
import type { LegalGuidance, Lawyer, LegalBasis, LegalProvision, Organisation } from '../src/api/client';
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

// The three languages the guidance can be re-generated + read aloud in. Labelled
// in their own script (matching LanguageSwitcher) so a user finds theirs easily.
const GUIDANCE_LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'si', label: 'සිංහල' },
];

// Empty legal-basis shape, reused for reset + missing-field fallback.
const EMPTY_LEGAL_BASIS: LegalBasis = { provisions: [], outlook: { helps: [], hurts: [] } };

export default function Guidance() {
  const { t, i18n } = useTranslation();
  const { district: savedDistrict } = usePreferences();

  // SAFETY: the scenario a user types + the legal guidance can be sensitive;
  // block screenshots / screen recording while this screen is open.
  usePreventScreenCapture();

  const [scenario, setScenario] = useState('');
  const [district, setDistrict] = useState<string | null>(savedDistrict ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<LegalGuidance | null>(null);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  // Real, source-cited lawyers for this case (from server web search). May be
  // empty if web search found nothing verifiable — the UI handles that.
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  // Real, source-cited legal provisions (Act/section/penalty) + a non-predictive
  // outlook for this case, from server web search. Empty if none verifiable.
  const [legalBasis, setLegalBasis] = useState<LegalBasis>({
    provisions: [],
    outlook: { helps: [], hurts: [] },
  });
  // Whether the guidance is currently being read aloud (expo-speech).
  const [speaking, setSpeaking] = useState(false);
  // The language the CURRENT guidance text is in — drives both the active toggle
  // chip and the read-aloud voice. Defaults to the app language.
  const [guidanceLang, setGuidanceLang] = useState<string>(i18n.language);
  // True while re-generating the guidance in a newly picked language.
  const [switchingLang, setSwitchingLang] = useState<string | null>(null);

  const districtOptions: Option[] = DISTRICTS.map((d) => ({ value: d, label: t(`districts.${d}`, d) }));

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
  const buildSpokenGuidance = (g: LegalGuidance, lb: LegalBasis): string => {
    // Read the grounded provisions aloud too (Act, section, summary, penalty) —
    // source URLs are on-screen tap targets, not spoken.
    const provisionsSpoken = lb.provisions.length
      ? `${t('guidance.legalBasisTitle')}. ` +
        lb.provisions
          .map((p) => [p.law, p.section, p.summary, p.penalty].filter(Boolean).join('. '))
          .join('. ')
      : '';
    return [
      `${t('guidance.categoryTitle')}: ${t(`caseTypes.${g.category}`)}. ${g.summary}`,
      g.how_handled.length ? `${t('guidance.handledTitle')}. ${g.how_handled.join('. ')}` : '',
      g.applicable_laws.length ? `${t('guidance.lawsTitle')}. ${g.applicable_laws.join('. ')}` : '',
      provisionsSpoken,
      g.steps.length ? `${t('guidance.stepsTitle')}. ${g.steps.join('. ')}` : '',
      g.approximate_fees ? `${t('guidance.feesTitle')}. ${g.approximate_fees}` : '',
      g.safety_note ? `${t('guidance.safetyTitle')}. ${g.safety_note}` : '',
    ]
      .filter(Boolean)
      .join('. ');
  };

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
    Speech.speak(buildSpokenGuidance(guidance, legalBasis), {
      // Read in the language the guidance TEXT is actually in (set by the toggle),
      // not the app language — otherwise a Tamil voice would read English text.
      language: SPEECH_LOCALES[guidanceLang] ?? 'en-US',
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  // Re-generate the SAME scenario's guidance in another language, then it can be
  // read aloud in that language. No-op if it's already the current language or a
  // switch is in flight. Stops any read-aloud first.
  const switchLanguage = async (lang: string) => {
    if (lang === guidanceLang || switchingLang || loading) return;
    Speech.stop();
    setSpeaking(false);
    setSwitchingLang(lang);
    setError(null);
    try {
      const res = await fetchLegalGuidance(scenario.trim(), district ?? undefined, lang);
      setGuidance(res.data.data.guidance);
      setOrgs(res.data.data.organisations || []);
      setLawyers(res.data.data.lawyers || []);
      setLegalBasis(res.data.data.legal_basis || EMPTY_LEGAL_BASIS);
      setGuidanceLang(lang);
    } catch (err) {
      let message = t('guidance.failed');
      if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
        message = err.response.data.message;
      }
      setError(message);
    } finally {
      setSwitchingLang(null);
    }
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
    setLawyers([]);
    setLegalBasis(EMPTY_LEGAL_BASIS);
    // Stop any read-aloud from a previous result before generating a new one.
    Speech.stop();
    setSpeaking(false);
    try {
      const res = await fetchLegalGuidance(scenario.trim(), district ?? undefined, i18n.language);
      setGuidance(res.data.data.guidance);
      setOrgs(res.data.data.organisations || []);
      setLawyers(res.data.data.lawyers || []);
      setLegalBasis(res.data.data.legal_basis || EMPTY_LEGAL_BASIS);
      setGuidanceLang(i18n.language); // the result is in the app language
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
    setLawyers([]);
    setLegalBasis(EMPTY_LEGAL_BASIS);
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

            {/* Language toggle: re-generate + read the guidance in English/Tamil/
                Sinhala. The active chip marks the language the text is currently in. */}
            <Text style={local.audioLangLabel}>{t('guidance.audioLanguage')}</Text>
            <View style={local.langRow}>
              {GUIDANCE_LANGS.map(({ code, label }) => {
                const active = guidanceLang === code;
                const busy = switchingLang === code;
                return (
                  <Pressable
                    key={code}
                    onPress={() => switchLanguage(code)}
                    disabled={switchingLang !== null || loading}
                    style={[local.langChip, active && local.langChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: switchingLang !== null }}
                    accessibilityLabel={label}
                  >
                    {busy ? (
                      <ActivityIndicator color={active ? colors.primaryText : colors.primary} size="small" />
                    ) : (
                      <Text style={[local.langChipText, active && local.langChipTextActive]}>
                        {label}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Read-aloud: reads the whole guidance in the chosen language, for
                low-literacy users or hands-free listening. Fully on-device. */}
            <Pressable
              onPress={toggleSpeak}
              disabled={switchingLang !== null}
              style={[local.listenBtn, switchingLang !== null && theme.btnDisabled]}
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
              <SheetRow label={t('guidance.categoryTitle')} icon="🔎" first>
                <Text style={local.category}>{t(`caseTypes.${guidance.category}`)}</Text>
                {guidance.summary ? <Text style={local.summary}>{guidance.summary}</Text> : null}
              </SheetRow>

              {guidance.how_handled.length > 0 ? (
                <SheetRow label={t('guidance.handledTitle')} icon="⚖️">
                  {guidance.how_handled.map((h, i) => (
                    <Bullet key={i} text={h} />
                  ))}
                </SheetRow>
              ) : null}

              {guidance.applicable_laws.length > 0 ? (
                <SheetRow label={t('guidance.lawsTitle')} icon="📜">
                  {guidance.applicable_laws.map((law, i) => (
                    <Bullet key={i} text={law} />
                  ))}
                </SheetRow>
              ) : null}

              {/* Real, source-cited legal provisions (Act/section/penalty) found
                  via web search. Every card carries a source link; the server
                  drops anything un-cited, so nothing here is AI-invented. */}
              {legalBasis.provisions.length > 0 ? (
                <SheetRow label={t('guidance.legalBasisTitle')} icon="📖">
                  <Text style={local.lawyersIntro}>{t('guidance.legalBasisIntro')}</Text>
                  {legalBasis.provisions.map((p, i) => (
                    <ProvisionCard key={`${p.source_url}-${i}`} provision={p} />
                  ))}
                  {legalBasis.outlook.helps.length > 0 || legalBasis.outlook.hurts.length > 0 ? (
                    <View style={local.outlookBox}>
                      <Text style={local.outlookTitle}>{t('guidance.outlookTitle')}</Text>
                      {legalBasis.outlook.helps.map((h, i) => (
                        <Text key={`h${i}`} style={local.outlookHelp}>{`✅ ${h}`}</Text>
                      ))}
                      {legalBasis.outlook.hurts.map((h, i) => (
                        <Text key={`x${i}`} style={local.outlookHurt}>{`⚠️ ${h}`}</Text>
                      ))}
                      <Text style={local.outlookNote}>{t('guidance.outlookNote')}</Text>
                    </View>
                  ) : null}
                  <Text style={local.lawyersDisclaimer}>{t('guidance.legalBasisDisclaimer')}</Text>
                </SheetRow>
              ) : null}

              {guidance.steps.length > 0 ? (
                <SheetRow label={t('guidance.stepsTitle')} icon="🧭">
                  {guidance.steps.map((step, i) => (
                    <NumberedStep key={i} n={i + 1} text={step} />
                  ))}
                </SheetRow>
              ) : null}

              {guidance.approximate_fees ? (
                <SheetRow label={t('guidance.feesTitle')} icon="💰">
                  <Text style={local.bodyText}>{guidance.approximate_fees}</Text>
                  <Text style={local.feesNote}>{t('guidance.feesNote')}</Text>
                </SheetRow>
              ) : null}

              {/* Real, source-cited lawyers for this case (found via web search;
                  never AI-invented — the server drops any without a source). */}
              <SheetRow label={t('guidance.lawyersTitle')} icon="👤">
                {lawyers.length > 0 ? (
                  <>
                    <Text style={local.lawyersIntro}>{t('guidance.lawyersIntro')}</Text>
                    {lawyers.map((l, i) => (
                      <LawyerCard key={`${l.source_url}-${i}`} lawyer={l} />
                    ))}
                    <Text style={local.lawyersDisclaimer}>{t('guidance.lawyersDisclaimer')}</Text>
                  </>
                ) : (
                  <Text style={local.noOrgs}>{t('guidance.noLawyers')}</Text>
                )}
              </SheetRow>

              {/* Real legal help from our own vetted directory. */}
              <SheetRow label={t('guidance.helpTitle')} icon="🏛️" last>
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

// One labelled row of the guidance sheet: a tinted header bar (with a small
// leading icon, so the sheet reads as sections at a glance rather than a wall of
// text) + its content.
function SheetRow({
  label,
  icon,
  children,
  first,
  last,
}: {
  label: string;
  icon?: string;
  children: React.ReactNode;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[local.row, !last && local.rowDivider]}>
      <View style={[local.rowLabelBar, first && local.rowLabelFirst]}>
        {icon ? <Text style={local.rowLabelIcon}>{icon}</Text> : null}
        <Text style={local.rowLabel}>{label}</Text>
      </View>
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

// A single REAL lawyer/firm, rendered as a visual card (chips + badges + tap
// actions) rather than a paragraph, so the list scans quickly. Every field the
// server sent is real and source-cited; empty fields are simply not shown.
// Defensive normalisers — the server already cleans these, but scraped contact
// details can be dirty (a list of numbers, an obfuscated "[email protected]"
// placeholder, a scheme-less domain), so we guard again before building a URL:
// a scheme-less website would otherwise resolve to a bundle file:// path.
function dialPhone(raw: string): string | null {
  const first = raw.split(/[,;/]|\bor\b/i)[0] ?? '';
  const digits = first.replace(/[^\d+]/g, '');
  return /\d{6,}/.test(digits) ? digits : null;
}
function validEmail(raw: string): string | null {
  const e = raw.trim();
  return !/[[\]\s]/.test(e) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}
function webUrl(raw: string): string | null {
  let u = raw.trim();
  if (!u || /[[\]\s]/.test(u)) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, '')}`;
  return /^https?:\/\/[^/]+\.[^/]/i.test(u) ? u : null;
}

function LawyerCard({ lawyer }: { lawyer: Lawyer }) {
  const { t } = useTranslation();
  const open = (url: string) => Linking.openURL(url).catch(() => undefined);
  const phone = dialPhone(lawyer.phone);
  const email = validEmail(lawyer.email);
  const website = webUrl(lawyer.website);

  return (
    <View style={local.lawyerCard}>
      {/* Avatar-ish initial + name/specialisation header. */}
      <View style={local.lawyerHead}>
        <View style={local.lawyerAvatar}>
          <Text style={local.lawyerAvatarText}>
            {(lawyer.name.trim()[0] || '?').toUpperCase()}
          </Text>
        </View>
        <View style={local.lawyerHeadText}>
          <Text style={local.lawyerName}>{lawyer.name}</Text>
          {lawyer.organisation ? (
            <Text style={local.lawyerOrg}>{lawyer.organisation}</Text>
          ) : null}
        </View>
      </View>

      {/* Chips: specialisation, district, experience. */}
      <View style={local.chipRow}>
        {lawyer.specialisation ? (
          <View style={[local.chip, local.chipAccent]}>
            <Text style={[local.chipText, local.chipAccentText]}>{lawyer.specialisation}</Text>
          </View>
        ) : null}
        {lawyer.district ? (
          <View style={local.chip}>
            <Text style={local.chipText}>📍 {lawyer.district}</Text>
          </View>
        ) : null}
        {lawyer.experience ? (
          <View style={local.chip}>
            <Text style={local.chipText}>🎓 {lawyer.experience}</Text>
          </View>
        ) : null}
      </View>

      {/* Fee — highlighted so it stands out from the rest. */}
      {lawyer.approx_fee ? (
        <View style={local.feeBox}>
          <Text style={local.feeIcon}>💰</Text>
          <Text style={local.feeText}>{lawyer.approx_fee}</Text>
        </View>
      ) : null}

      {/* Tap actions — only shown when a usable, well-formed detail exists. */}
      <View style={local.lawyerActions}>
        {phone ? (
          <Pressable
            onPress={() => open(`tel:${phone}`)}
            style={local.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={`${t('guidance.callLawyer')} ${lawyer.name}`}
          >
            <Text style={local.actionBtnText}>📞 {t('guidance.callLawyer')}</Text>
          </Pressable>
        ) : null}
        {email ? (
          <Pressable
            onPress={() => open(`mailto:${email}`)}
            style={local.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={`${t('guidance.emailLawyer')} ${lawyer.name}`}
          >
            <Text style={local.actionBtnText}>✉️ {t('guidance.emailLawyer')}</Text>
          </Pressable>
        ) : null}
        {website ? (
          <Pressable
            onPress={() => open(website)}
            style={local.actionBtn}
            accessibilityRole="button"
          >
            <Text style={local.actionBtnText}>🌐 {t('guidance.websiteLawyer')}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Source link — proves the entry is real, not AI-invented. */}
      <Pressable
        onPress={() => open(lawyer.source_url)}
        accessibilityRole="link"
        style={local.sourceRow}
      >
        <Text style={local.sourceText} numberOfLines={1}>
          🔗 {t('guidance.viewSource')}
        </Text>
      </Pressable>
    </View>
  );
}

// A single source-cited legal provision: Act + section header, plain summary,
// a highlighted penalty, and the required source link (proves it is real).
function ProvisionCard({ provision }: { provision: LegalProvision }) {
  const { t } = useTranslation();
  const open = (url: string) => Linking.openURL(url).catch(() => undefined);
  return (
    <View style={local.lawyerCard}>
      <View style={local.provisionHead}>
        <Text style={local.provisionLaw}>{provision.law}</Text>
        {provision.section ? (
          <View style={[local.chip, local.chipAccent]}>
            <Text style={[local.chipText, local.chipAccentText]}>{provision.section}</Text>
          </View>
        ) : null}
      </View>
      <Text style={local.bodyText}>{provision.summary}</Text>
      {provision.penalty ? (
        <View style={local.penaltyBox}>
          <Text style={local.penaltyLabel}>{t('guidance.penaltyLabel')}</Text>
          <Text style={local.penaltyText}>{provision.penalty}</Text>
        </View>
      ) : null}
      <Pressable
        onPress={() => open(provision.source_url)}
        accessibilityRole="link"
        style={local.sourceRow}
      >
        <Text style={local.sourceText} numberOfLines={1}>
          🔗 {t('guidance.viewSource')}
        </Text>
      </Pressable>
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

  // Language toggle (EN / TA / SI) for the guidance text + read-aloud.
  audioLangLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 8,
  },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  langChip: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  langChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langChipText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  langChipTextActive: { color: colors.primaryText },

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
  rowLabelBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryTint,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  rowLabelIcon: { fontSize: 15 },
  rowLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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

  // Lawyers section (real, source-cited results from web search).
  lawyersIntro: { fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: 12 },
  lawyersDisclaimer: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
    lineHeight: 17,
    marginTop: 2,
    marginBottom: 4,
  },
  lawyerCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.background,
  },
  lawyerHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lawyerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lawyerAvatarText: { color: colors.primaryText, fontSize: 18, fontWeight: '800' },
  lawyerHeadText: { flex: 1 },
  lawyerName: { fontSize: 16, fontWeight: '700', color: colors.text },
  lawyerOrg: { fontSize: 13, color: colors.muted, marginTop: 2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.secondaryTint,
  },
  chipText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  chipAccent: { backgroundColor: colors.primaryTint },
  chipAccentText: { color: colors.primary },

  feeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.secondaryTint,
  },
  feeIcon: { fontSize: 16 },
  feeText: { flex: 1, fontSize: 14, color: colors.secondaryOnLight, fontWeight: '600', lineHeight: 19 },

  lawyerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  actionBtnText: { fontSize: 13, color: colors.primary, fontWeight: '700' },

  sourceRow: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  sourceText: { fontSize: 12, color: colors.muted, fontWeight: '600' },

  // Legal-basis provision card.
  provisionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  provisionLaw: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.primary, lineHeight: 20 },
  penaltyBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
  },
  penaltyLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  penaltyText: { fontSize: 14, color: colors.text, lineHeight: 19, fontWeight: '600' },

  // Non-predictive outlook (factors that help/hurt this kind of case).
  outlookBox: {
    marginTop: 4,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outlookTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 8 },
  outlookHelp: { fontSize: 14, color: colors.text, lineHeight: 21 },
  outlookHurt: { fontSize: 14, color: colors.text, lineHeight: 21 },
  outlookNote: { fontSize: 12, color: colors.muted, fontStyle: 'italic', marginTop: 8, lineHeight: 17 },

  againBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  againText: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
