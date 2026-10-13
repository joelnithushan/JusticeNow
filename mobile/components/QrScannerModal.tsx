/**
 * JusticeNow (mobile) — QR scanner modal (reference-code tracking).
 *
 * A full-screen camera sheet that scans a JusticeNow case QR code so a reporter
 * can track a case without typing the code by hand. It only ever reads a QR — no
 * photo is captured or stored (see the camera usage string in app.json). The
 * caller receives the raw decoded string and is responsible for validating the
 * JN- format (so this component stays generic and leaks nothing).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../src/theme';

function CloseIcon({ color = '#ffffff' }: { color?: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6 L6 18 M6 6 l12 12" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CameraOffIcon({ color = '#ffffff' }: { color?: string }) {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 2 l20 20 M9.5 4 h5 l1.5 2 h4 a2 2 0 0 1 2 2 v9 M6.5 6 H4 a2 2 0 0 0 -2 2 v10 a2 2 0 0 0 2 2 h14 M9.8 9.8 a4 4 0 0 0 4.4 4.4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function QrScannerModal({
  visible,
  onScanned,
  onClose,
}: {
  visible: boolean;
  onScanned: (data: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  // Guard so a rapidly-repeating scan callback fires our handler only once.
  const handled = useRef(false);
  const [ready, setReady] = useState(false);

  // Ask for camera permission when the sheet opens; reset the one-shot guard.
  useEffect(() => {
    if (visible) {
      handled.current = false;
      setReady(true);
      if (permission && !permission.granted && permission.canAskAgain) {
        requestPermission();
      }
    } else {
      setReady(false);
    }
  }, [visible, permission, requestPermission]);

  const onBarcode = ({ data }: { data: string }) => {
    if (handled.current) return;
    handled.current = true;
    onScanned(data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {ready && permission?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onBarcode}
            />

            {/* Mask overlay to darken area around scan viewfinder */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Top mask */}
              <View style={[styles.maskTop, { height: (insets.top + 70) }]} />

              <View style={styles.maskMiddleRow}>
                {/* Left mask */}
                <View style={styles.maskSide} />

                {/* Clear viewfinder frame with corner brackets */}
                <View style={styles.viewfinder}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>

                {/* Right mask */}
                <View style={styles.maskSide} />
              </View>

              {/* Bottom mask */}
              <View style={styles.maskBottom}>
                <View style={styles.hintBadge}>
                  <Text style={styles.hintText}>{t('status.scanPrompt')}</Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.denied}>
            <CameraOffIcon color={colors.secondary} />
            <Text style={styles.deniedTitle}>{t('status.scanQr')}</Text>
            <Text style={styles.deniedText}>
              {permission && !permission.granted
                ? t('status.cameraDenied')
                : t('common.loading')}
            </Text>
            {permission && !permission.granted ? (
              <Pressable
                onPress={() => Linking.openSettings()}
                style={styles.settingsBtn}
                accessibilityRole="button"
              >
                <Text style={styles.settingsBtnText}>Open Settings</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* Top Header bar with Close Button and Title */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <CloseIcon color="#ffffff" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('status.scanQr')}</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        {/* Bottom Cancel button */}
        <Pressable
          onPress={onClose}
          style={[styles.cancel, { bottom: insets.bottom + 24 }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const FRAME_SIZE = 250;
const CORNER_SIZE = 28;
const CORNER_WIDTH = 3.5;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
  },
  headerRightSpacer: {
    width: 40,
  },
  // Mask layout
  maskTop: {
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  maskMiddleRow: {
    flexDirection: 'row',
    height: FRAME_SIZE,
  },
  maskSide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  maskBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  viewfinder: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    borderRadius: 16,
    position: 'relative',
  },
  // Corner markers
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: colors.secondary, // Bright orange accent for clear visual targeting
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: 16,
  },
  hintBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    maxWidth: '90%',
  },
  hintText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Permission denied state
  denied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#121212',
  },
  deniedTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  deniedText: {
    color: '#b0bec5',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  settingsBtn: {
    backgroundColor: colors.secondary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 16,
  },
  settingsBtnText: {
    color: colors.onSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  cancel: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    zIndex: 10,
  },
  cancelText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
