import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import Button from '../common/Button';
import {
  ListingSuggestion,
  improveListing,
  ImproveListingInput,
} from '../../services/aiAssistantService';

interface AiListingSuggestionsModalProps {
  visible: boolean;
  onClose: () => void;
  /** Current listing values from the form; sent to the AI assistant. */
  input: ImproveListingInput;
  /**
   * Called when the seller confirms their selections with the values to write
   * back (only fields the seller accepted are included).
   */
  onApply: (applied: {
    title?: string;
    description?: string;
    price?: number;
  }) => void;
}

/**
 * AI Listing Assistant — seller-facing suggestions modal.
 *
 * Calls the `improveListing` Cloud Function and renders each suggestion with
 * an accept control. Applying writes back ONLY the fields the seller accepted,
 * so they stay in control of their listing copy. Missing-field chips are
 * informational (they hint what to add, not what to overwrite).
 */
export default function AiListingSuggestionsModal({
  visible,
  onClose,
  input,
  onApply,
}: AiListingSuggestionsModalProps) {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ListingSuggestion | null>(null);

  // Per-suggestion accept state (reject = leave unchecked).
  const [acceptTitle, setAcceptTitle] = useState(true);
  const [acceptDescription, setAcceptDescription] = useState(true);
  const [acceptPrice, setAcceptPrice] = useState(false);

  // Reset when the modal opens. Done via React's render-phase "adjust state
  // when a prop changes" pattern so a re-open starts from a clean slate
  // without setState-in-effect cascades.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setError(null);
      setSuggestion(null);
      setAcceptTitle(true);
      setAcceptDescription(true);
      setAcceptPrice(false);
      setLoading(true);
    }
  }

  // Fetch suggestions each time the modal opens.
  useEffect(() => {
    if (!visible) return;

    let ignore = false;
    improveListing(input)
      .then((result) => {
        if (!ignore) setSuggestion(result);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        console.error('[AI Assistant] improveListing failed:', err);
        setError(friendlyError(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
    // The input snapshot is intentionally taken once per modal open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const canApply = useMemo(
    () =>
      Boolean(
        suggestion &&
          ((acceptTitle && suggestion.suggestedTitle) ||
            (acceptDescription && suggestion.descriptionRewrite))
      ),
    [suggestion, acceptTitle, acceptDescription]
  );

  const handleApply = () => {
    if (!suggestion) return;
    onApply({
      ...(acceptTitle && suggestion.suggestedTitle
        ? { title: suggestion.suggestedTitle }
        : {}),
      ...(acceptDescription && suggestion.descriptionRewrite
        ? { description: suggestion.descriptionRewrite }
        : {}),
      ...(acceptPrice && suggestion.suggestedPriceRange
        ? { price: Math.round((suggestion.suggestedPriceRange.min + suggestion.suggestedPriceRange.max) / 2) }
        : {}),
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
            accessibilityRole="button"
            accessibilityLabel="Close AI suggestions"
          >
            <MaterialCommunityIcons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            AI Listing Assistant
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.md }}>
                Analyzing your listing…
              </Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.centered}>
              <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.error} />
              <Text style={{ color: colors.text, fontSize: fontSize.md, marginTop: spacing.md, textAlign: 'center' }}>
                {error}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.sm, textAlign: 'center' }}>
                Your suggestions will appear here when the assistant is available.
              </Text>
            </View>
          )}

          {!loading && !error && suggestion && (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.md }}>
                Accept the suggestions you want, then tap Apply. Unaccepted suggestions leave your listing untouched.
              </Text>

              {/* Suggested title */}
              <SuggestionCard
                checked={acceptTitle}
                onToggle={() => setAcceptTitle((v) => !v)}
                icon="format-title"
                label="Better title"
                colors={colors}
                fontSize={fontSize}
                spacing={spacing}
                radius={radius}
                shadow={shadow}
              >
                <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                  {suggestion.suggestedTitle}
                </Text>
              </SuggestionCard>

              {/* Description rewrite */}
              <SuggestionCard
                checked={acceptDescription}
                onToggle={() => setAcceptDescription((v) => !v)}
                icon="text-box-check-outline"
                label="Description rewrite"
                colors={colors}
                fontSize={fontSize}
                spacing={spacing}
                radius={radius}
                shadow={shadow}
              >
                <Text style={{ color: colors.text, fontSize: fontSize.sm, lineHeight: 20 }}>
                  {suggestion.descriptionRewrite}
                </Text>
              </SuggestionCard>

              {/* Missing fields — informational chips */}
              {suggestion.missingFields.length > 0 && (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderRadius: radius.lg },
                    shadow.sm,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <MaterialCommunityIcons name="playlist-plus" size={18} color={colors.primary} />
                    <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '700', marginLeft: 6 }}>
                      Worth adding
                    </Text>
                  </View>
                  <View style={styles.chipRow}>
                    {suggestion.missingFields.map((field) => (
                      <View
                        key={field}
                        style={[styles.chip, { backgroundColor: colors.gray100, borderRadius: radius.round }]}
                      >
                        <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>{field}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: spacing.sm }}>
                    Adding these details helps buyers find and trust your listing.
                  </Text>
                </View>
              )}

              {/* Suggested price range */}
              {suggestion.suggestedPriceRange && (
                <SuggestionCard
                  checked={acceptPrice}
                  onToggle={() => setAcceptPrice((v) => !v)}
                  icon="cash-multiple"
                  label={
                    acceptPrice
                      ? 'Suggested price (midpoint applied)'
                      : `Suggested price (${suggestion.priceContext})`
                  }
                  colors={colors}
                  fontSize={fontSize}
                  spacing={spacing}
                  radius={radius}
                  shadow={shadow}
                >
                  <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '700' }}>
                    {formatMoney(suggestion.suggestedPriceRange.min)} – {formatMoney(suggestion.suggestedPriceRange.max)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
                    Applying sets the price to the midpoint.
                  </Text>
                </SuggestionCard>
              )}
            </>
          )}
        </ScrollView>

        {/* Footer */}
        {suggestion && !loading && !error && (
          <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Button
              title="Apply selected"
              onPress={handleApply}
              disabled={!canApply}
              icon={<MaterialCommunityIcons name="check" size={20} color={colors.white} />}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Map callable errors to short, actionable copy. */
function friendlyError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  if (code.includes('resource-exhausted')) {
    return 'Daily AI limit reached (20 suggestions). Try again tomorrow.';
  }
  if (code.includes('unauthenticated')) {
    return 'Please sign in to use the AI assistant.';
  }
  if (code.includes('failed-precondition')) {
    return 'The AI assistant is not configured yet. Please try again later.';
  }
  return 'The AI assistant could not be reached. Please try again.';
}

// ─── Sub-components ────────────────────────────────────────────────────────

interface ThemeSlice {
  colors: ReturnType<typeof useTheme>['colors'];
  fontSize: ReturnType<typeof useTheme>['fontSize'];
  spacing: ReturnType<typeof useTheme>['spacing'];
  radius: ReturnType<typeof useTheme>['radius'];
  shadow: ReturnType<typeof useTheme>['shadow'];
}

function SuggestionCard({
  checked,
  onToggle,
  icon,
  label,
  children,
  colors,
  fontSize,
  spacing,
  radius,
  shadow,
}: ThemeSlice & {
  checked: boolean;
  onToggle: () => void;
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onToggle}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderColor: checked ? colors.primary : 'transparent',
          borderWidth: checked ? 1.5 : 0,
        },
        shadow.sm,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons name={icon as never} size={18} color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '700', marginLeft: 6, flex: 1 }}>
          {label}
        </Text>
        <MaterialCommunityIcons
          name={checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
          size={22}
          color={checked ? colors.primary : colors.gray300}
        />
      </View>
      <View style={{ marginTop: spacing.sm }}>{children}</View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontWeight: '700',
    textAlign: 'center',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  card: {
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  footer: {
    padding: 16,
    borderTopWidth: 0.5,
  },
});
