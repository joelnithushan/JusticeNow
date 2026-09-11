/**
 * JusticeNow (mobile) — Language switcher (English / Tamil / Sinhala).
 *
 * A compact chip that opens a small DROPDOWN anchored directly under it (not a
 * full bottom sheet — that read as a heavy, primary action for a 3-item pick).
 * Each language is labelled in its own script so a user can find theirs even
 * when the app is showing one they cannot read.
 *
 * The choice is applied with i18n.changeLanguage() and persisted via
 * saveLanguage() so the next launch opens in the same language.
 */

import React, { useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../src/theme';
import { saveLanguage } from '../src/storage';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'si', label: 'සිංහල' },
];

const SCREEN_W = Dimensions.get('window').width;

function GlobeIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.7} />
      <Path d="M3 12 h18" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path
        d="M12 3 c4.2 3.2 4.2 14.8 0 18 c-4.2 -3.2 -4.2 -14.8 0 -18"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronDown({ color, size = 16, open = false }: { color: string; size?: number; open?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
      <Path d="M6 9 l6 6 l6 -6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CheckIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 13 l4 4 l10 -11" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function LanguageSwitcher({ onDark = false }: { onDark?: boolean }) {
  const { t, i18n } = useTranslation();
  const chipRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  // Anchor coordinates for the dropdown, measured from the chip on open.
  const [anchor, setAnchor] = useState<{ top: number; right: number }>({ top: 0, right: 16 });

  const fg = onDark ? '#ffffff' : colors.muted;

  const activeCode = LANGUAGES.find((l) => i18n.language?.startsWith(l.code))?.code ?? 'en';
  const activeLabel = LANGUAGES.find((l) => l.code === activeCode)?.label ?? 'English';

  // Measure the chip in the window, then open the dropdown just below it,
  // right-aligned to the chip's right edge.
  const openMenu = () => {
    chipRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ top: y + height + 6, right: Math.max(8, SCREEN_W - (x + width)) });
      setOpen(true);
    });
  };

  const choose = (code: string) => {
    i18n.changeLanguage(code);
    saveLanguage(code); // remember the choice for next launch
    setOpen(false);
  };

  return (
    <View style={[styles.row, onDark && styles.rowOnDark]}>
      <Pressable
        ref={chipRef}
        style={[styles.chip, onDark && styles.chipOnDark]}
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel={`${t('preferences.language.label')}: ${activeLabel}`}
      >
        <GlobeIcon color={fg} />
        <Text style={[styles.chipText, onDark && styles.chipTextOnDark]}>{activeLabel}</Text>
        <ChevronDown color={fg} open={open} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Transparent backdrop: taps anywhere outside the menu dismiss it. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.menu, { top: anchor.top, right: anchor.right }]}>
          {LANGUAGES.map(({ code, label }, i) => {
            const active = code === activeCode;
            return (
              <Pressable
                key={code}
                style={[styles.option, i > 0 && styles.optionDivider]}
                onPress={() => choose(code)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
                {active ? <CheckIcon color={colors.primary} /> : <View style={styles.checkSpacer} />}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Right-aligned so it reads as a small utility control, not a primary action.
  row: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  rowOnDark: { marginBottom: 0 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipOnDark: {
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  chipTextOnDark: { color: '#ffffff' },

  // Invisible full-screen catcher so an outside tap closes the dropdown.
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // The dropdown card, absolutely positioned under the chip.
  menu: {
    position: 'absolute',
    minWidth: 180,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    // Soft elevation so it reads as a floating menu.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionDivider: { borderTopWidth: 1, borderTopColor: colors.primaryTint },
  optionText: { fontSize: 15, color: colors.text },
  optionTextActive: { fontWeight: '700', color: colors.primary },
  checkSpacer: { width: 18, height: 18 },
});
