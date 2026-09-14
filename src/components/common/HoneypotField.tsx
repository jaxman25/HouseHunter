/**
 * Honeypot anti-bot field.
 *
 * A visually hidden form field that real users never see or fill in, but
 * bots that parse the DOM and fill in all fields will complete. When the
 * field has a value, the form should silently reject the submission.
 *
 * The field is hidden using multiple layers:
 *   1. `aria-hidden="true"` so screen readers skip it
 *   2. `tabIndex={-1}` so keyboard users can't tab to it
 *   3. Absolutely positioned off-screen with zero dimensions
 *   4. opacity: 0 and pointer-events: none as fallback
 *
 * Usage:
 *   <HoneypotField value={honeypot} onChange={setHoneypot} />
 *   // In submit handler:
 *   if (honeypot) return; // Bot detected — silently discard
 */

import React from 'react';
import { TextInput, StyleSheet, View } from 'react-native';

interface HoneypotFieldProps {
  value: string;
  onChangeText: (text: string) => void;
}

export default function HoneypotField({
  value,
  onChangeText,
}: HoneypotFieldProps) {
  return (
    <View style={styles.container} accessibilityElementsHidden importantForAccessibility="no">
      {/* Real label — visible to screen readers for accessibility, but the
          field itself is hidden from the visual layout. */}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        accessible={false}
        aria-hidden={true}
        tabIndex={-1}
      />
    </View>
  );
}

/**
 * Check if a form was submitted too quickly (bot-like behavior).
 * Returns true if the elapsed time is suspiciously short.
 *
 * @param formMountedAt - Timestamp when the form was first rendered
 * @param minSeconds - Minimum acceptable time in seconds (default: 2)
 */
export function isFormSubmittedTooFast(
  formMountedAt: number,
  minSeconds: number = 2
): boolean {
  const elapsed = Date.now() - formMountedAt;
  return elapsed < minSeconds * 1000;
}

const styles = StyleSheet.create({
  container: {
    // Absolutely positioned off-screen, zero dimensions, invisible.
    position: 'absolute',
    top: -9999,
    left: -9999,
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  input: {
    width: 0,
    height: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    opacity: 0,
  },
});
