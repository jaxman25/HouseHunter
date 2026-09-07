import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { CONTACT_EMAIL, TERMS_EFFECTIVE_DATE } from '../../utils/constants';

interface Section {
  heading: string;
  paragraphs: string[];
}

/**
 * Shared static legal-document layout. Both the auth flow and the signed-in
 * stack can mount these screens, so each document is its own component.
 */
function LegalLayout({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: Section[];
}) {
  const { colors, fontSize, spacing } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: 860, alignSelf: 'center' },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          {title}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 }}
      >
        <Text style={[styles.effective, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
          Effective {updated}
        </Text>

        {sections.map((section) => (
          <View key={section.heading} style={{ marginTop: spacing.xl }}>
            <Text style={[styles.heading, { color: colors.text, fontSize: fontSize.lg }]}>
              {section.heading}
            </Text>
            {section.paragraphs.map((paragraph, i) => (
              <Text
                key={i}
                style={[
                  styles.paragraph,
                  {
                    color: colors.textSecondary,
                    fontSize: fontSize.md,
                    lineHeight: 22,
                    marginTop: i === 0 ? spacing.sm : spacing.md,
                  },
                ]}
              >
                {paragraph}
              </Text>
            ))}
          </View>
        ))}

        <Text
          style={[
            styles.contact,
            {
              color: colors.textSecondary,
              fontSize: fontSize.sm,
              marginTop: spacing.xxl,
            },
          ]}
        >
          Questions? Contact us at {CONTACT_EMAIL}.
        </Text>
      </ScrollView>
    </View>
  );
}

const PRIVACY_SECTIONS: Section[] = [
  {
    heading: 'What we collect',
    paragraphs: [
      'Account information you provide when you register: name, email address, an optional phone number you choose to share with other users, and an optional profile photo.',
      'Content you create: property listings, saved favorites, messages, and notification preferences.',
      'Usage and technical data needed to operate and secure the service: Firebase authentication and database identifiers, and — only when error reporting is enabled with a Sentry DSN — device/app information attached to crash and error reports. This never includes your password, message contents, or financial information.',
      'Local storage on your device: we use local storage (cookies/localStorage on web, AsyncStorage on mobile) to keep you signed in, remember your cookie-consent choice, and cache data you have viewed so the app works offline. We do not use third-party advertising or cross-site tracking cookies.',
    ],
  },
  {
    heading: 'Why we process it',
    paragraphs: [
      'We use the data above solely to provide the service you asked for: to run your account, show listings, connect you with sellers/buyers through messages, secure the platform against abuse, and improve reliability. Our legal bases are performance of the contract with you, your consent (for anything optional), and our legitimate interest in keeping the service secure.',
    ],
  },
  {
    heading: 'What we do not do',
    paragraphs: [
      'We do not sell or rent your personal information to anyone. We share data only with the infrastructure providers needed to run the app (Firebase for authentication, database, storage, and hosting; Sentry for error monitoring) and with other users only as you direct (for example, your public listing profile and your messages).',
      'Maps shown in the app are rendered with a Google Maps embed. When you view a map, your device requests the map tiles directly from Google under Google’s privacy policy; we do not send Google any information about you, only the map location you are viewing. There are no other third-party embeds (no advertising, social, or analytics embeds).',
    ],
  },
  {
    heading: 'Retention',
    paragraphs: [
      'We keep your account data while your account exists. Deleting your account (Settings → Delete Account) removes your profile, your listings and their photos, your notifications, your chat data, and the local cache on your device. Backups may retain encrypted copies briefly; see the incident-response documentation for restore windows.',
    ],
  },
  {
    heading: 'Your rights',
    paragraphs: [
      'Depending on where you live you may have the right to access, correct, export (port), or delete your personal information; to object to or ask us to restrict certain processing; and to withdraw consent you have given. Laws such as the GDPR (in the European Economic Area and the United Kingdom) and the CCPA/CPRA (in California) provide these rights where they apply to you. We do not sell your personal information, and we do not treat you differently for exercising your privacy rights.',
      'You can act on most of these rights yourself in the app: Edit Profile for corrections, notification settings to limit messages, and Delete Account for erasure. For anything else, email ' + CONTACT_EMAIL + '. We respond to verifiable requests within 30 days; if a request is complex or we receive many requests, we may take longer (up to a further 60 days) and will tell you why. If you are not satisfied with our response, you can lodge a complaint with the data-protection authority where you live.',
    ],
  },
  {
    heading: 'Where your data is stored',
    paragraphs: [
      'The infrastructure providers we use to run the service (Firebase for authentication, database, storage, and hosting; Sentry for error monitoring) are operated by Google LLC and its partners and may store and process data on servers in the United States and in other countries where those providers operate.',
      'If you live outside the United States and your local law restricts transferring personal data across borders, we rely on the safeguards those providers offer — such as standard contractual clauses — for data processed in the United States, and the commitments in this policy apply regardless of where your data is stored.',
    ],
  },
  {
    heading: 'Cookies and consent',
    paragraphs: [
      'When you use the web version we ask you to accept or decline non-essential cookies/local storage through the consent banner. Essential storage (keeping you signed in, remembering your choice) is always used because the service cannot function without it. You can change your choice later by clearing site data.',
    ],
  },
  {
    heading: 'Changes',
    paragraphs: [
      'If we change this policy we will update this page and note the effective date. Material changes will be announced in the app before they take effect.',
    ],
  },
];

const TERMS_SECTIONS: Section[] = [
  {
    heading: 'The service',
    paragraphs: [
      'House Hunter is a marketplace that lets users list and find properties and communicate with each other. By creating an account you agree to these Terms of Service. If you are registering on behalf of an organization, you confirm you have authority to bind it.',
    ],
  },
  {
    heading: 'Your account',
    paragraphs: [
      'You are responsible for keeping your login credentials safe and for everything done through your account. You must be at least 18 years old (or the age of majority where you live) and legally able to enter into this agreement to use the service. One person — one account.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: [
      'You agree not to: post false, misleading, fraudulent, or illegal content; impersonate others; attempt to access other users\u2019 accounts or data; scrape, crawl, or automate the service beyond normal use; upload malicious code; or use the service to violate any law. We may remove content or suspend accounts that violate these rules.',
    ],
  },
  {
    heading: 'Listings',
    paragraphs: [
      'You are responsible for the accuracy of listings you post, for the photos you upload (you must own the rights to them), and for honoring offers made through your listings. We are a platform, not a party to any transaction between users, and we do not verify listings or perform background checks.',
    ],
  },
  {
    heading: 'Future paid features',
    paragraphs: [
      'Some features may become paid in the future. Before you are charged for anything, we will show you the price, what you are buying, and a clear, separate confirmation button — we will never charge you without your explicit consent, and you will always be able to cancel a subscription or request a refund as described at the point of purchase.',
    ],
  },
  {
    heading: 'Refunds',
    paragraphs: [
      'There are no paid features today, so there is nothing to pay for or refund while using the free version of House Hunter.',
      'If a paid feature is introduced, the price, billing terms, cancellation process, and refund policy will be shown to you in full before you confirm any purchase. Unless a law where you live gives you a different right, requests for refunds of one-off purchases will be handled as described at the point of purchase, and subscription fees already used (for example, for a partial billing period already consumed) generally will not be refunded unless required by law.',
      'If you believe you were charged in error, contact us at ' + CONTACT_EMAIL + ' and we will investigate. Statutory rights — including any cooling-off or withdrawal rights you have under the law where you live — are never limited by this policy.',
    ],
  },
  {
    heading: 'Intellectual property',
    paragraphs: [
      'The House Hunter app and its content (excluding user content) are owned by us and protected by intellectual-property laws. You keep ownership of content you post and grant us a limited license to host and display it so the service can function.',
    ],
  },
  {
    heading: 'Disclaimers and liability',
    paragraphs: [
      'The service is provided \u201cas is\u201d without warranties of any kind. To the maximum extent permitted by law, we are not liable for indirect or consequential damages, and our total liability for any claim is limited to the amount you paid us in the twelve months before the claim. Nothing in these terms limits liability that cannot be limited by law.',
    ],
  },
  {
    heading: 'Termination',
    paragraphs: [
      'You can stop using the service at any time and delete your account in Settings. We may suspend or terminate accounts that violate these terms or jeopardize other users. Sections that by their nature survive (intellectual property, disclaimers, liability, governing law) continue after termination.',
    ],
  },
  {
    heading: 'Local law',
    paragraphs: [
      'House Hunter is operated from the United States. If the law where you live gives you consumer, privacy, or other protections that cannot be waived by contract, those protections are not limited by these Terms or by our Privacy Policy.',
      'If any part of these Terms is unenforceable under the law where you live, that part will not apply to you and the rest of the Terms remain in effect.',
      'If you access or use the service from outside the United States, you are responsible for complying with the laws that apply to you where you are, and we make no claim that the service is available or lawful in any particular country.',
    ],
  },
  {
    heading: 'Governing law and changes',
    paragraphs: [
      'These Terms and any disputes arising out of them are governed by the laws of the United States, without regard to conflict-of-law rules, and always subject to the mandatory consumer-protection laws of the country or state where you live. We may update these Terms; when we do, the updated version takes effect on the date shown, and for material changes we will ask for your agreement again the next time you sign in.',
    ],
  },
];

export function PrivacyPolicyScreen() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated={TERMS_EFFECTIVE_DATE}
      sections={PRIVACY_SECTIONS}
    />
  );
}

export function TermsOfServiceScreen() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated={TERMS_EFFECTIVE_DATE}
      sections={TERMS_SECTIONS}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '700' },
  effective: { marginBottom: 4 },
  heading: { fontWeight: '700' },
  paragraph: { fontWeight: '400' },
  contact: { textAlign: 'center', fontWeight: '500' },
});
