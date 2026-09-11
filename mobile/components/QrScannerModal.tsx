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
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/theme';

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
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcode}
          />
        ) : (
          <View style={styles.denied}>
            <Text style={styles.deniedText}>
              {permission && !permission.granted
                ? t('status.cameraDenied')
                : t('common.loading')}
            </Text>
          </View>
        )}

        {/* Scan frame + instruction overlay. */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>{t('status.scanPrompt')}</Text>
        </View>

        {/* Cancel button, above the home indicator. */}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  deniedText: { color: '#fff', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 230,
    height: 230,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  hint: {
    marginTop: 24,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  cancel: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  cancelText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
