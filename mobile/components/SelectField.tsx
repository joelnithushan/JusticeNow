/**
 * JusticeNow (mobile) — Labelled select field with a modal option list.
 *
 * Matches the reference design's preference rows: a label (with a required "*"),
 * a tappable field showing the current value or a placeholder, and a chevron.
 * Tapping opens a bottom sheet of options. Built on RN's Modal + FlatList rather
 * than the native Picker so it looks identical across iOS/Android/web and can be
 * styled to the brand.
 *
 * Fully keyboard/screen-reader reachable: the field is a button announcing the
 * label and current value; each option is a selectable button.
 */

import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../src/theme';

export type Option = { value: string; label: string };

type Props = {
  label: string;
  required?: boolean;
  placeholder: string;
  value: string | null;
  options: Option[];
  onChange: (value: string) => void;
  /** Title shown at the top of the option sheet. Defaults to the label. */
  sheetTitle?: string;
};

export default function SelectField({
  label,
  required,
  placeholder,
  value,
  options,
  onChange,
  sheetTitle,
}: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      <Pressable
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${selected ? selected.label : placeholder}`}
      >
        <Text
          style={[styles.fieldText, !selected && styles.placeholder]}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>{sheetTitle ?? label}</Text>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item.value === value;
              return (
                <Pressable
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => choose(item.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {item.label}
                  </Text>
                  {active && <Text style={styles.check}>✓</Text>}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 22 },
  label: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 10 },
  required: { color: colors.danger, fontWeight: '700' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  fieldText: { flex: 1, fontSize: 16, color: colors.text },
  placeholder: { color: colors.muted },
  chevron: { fontSize: 24, color: colors.muted, marginLeft: 8 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 16,
    maxHeight: '70%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  list: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  optionActive: { backgroundColor: colors.primaryTint },
  optionText: { fontSize: 16, color: colors.text },
  optionTextActive: { fontWeight: '700', color: colors.primary },
  check: { fontSize: 18, fontWeight: '800', color: colors.primary },
});
