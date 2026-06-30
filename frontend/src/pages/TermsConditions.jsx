import { Link } from 'react-router-dom';
import LegalPage, { LegalSection } from '../components/LegalPage.jsx';

export default function TermsConditions() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="June 30, 2026"
      intro="These Terms of Service (“Terms”) govern access to and use of WAPilot’s website, dashboard, APIs, and related services (collectively, the “Service”). By creating an account or using the Service, you agree to these Terms."
    >
      <LegalSection title="1. Eligibility and account access">
        <p>
          WAPilot is a business platform offered to organizations and authorized users. Access is provided on
          an invite or sales-led onboarding basis unless otherwise stated. You must provide accurate account
          information and keep your credentials secure.
        </p>
        <p>
          You are responsible for all activity under your account and for ensuring that users you add to your
          workspace comply with these Terms.
        </p>
      </LegalSection>

      <LegalSection title="2. The Service">
        <p>WAPilot provides tools for:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>WhatsApp conversation management and inbox workflows.</li>
          <li>Template creation, submission, and campaign sending.</li>
          <li>Contact management, custom fields, and communication history.</li>
          <li>Appointment scheduling, reminders, and staff coordination.</li>
          <li>Wallet-based communication credits and usage tracking.</li>
          <li>Payments, billing records, and related business operations.</li>
        </ul>
        <p>
          Features may change over time. We may add, modify, or discontinue functionality with reasonable
          notice where required.
        </p>
      </LegalSection>

      <LegalSection title="3. Acceptable use">
        <p>You agree not to use WAPilot to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Violate applicable laws, regulations, or third-party rights.</li>
          <li>Send spam, unsolicited messages, or communications without valid consent.</li>
          <li>Upload unlawful, harmful, deceptive, or infringing content.</li>
          <li>Attempt to bypass security, access other accounts, or disrupt the Service.</li>
          <li>Misrepresent your identity or the nature of your communications.</li>
        </ul>
        <p>
          You are solely responsible for the legality of contact lists, message content, templates, and
          business practices conducted through your workspace.
        </p>
      </LegalSection>

      <LegalSection title="4. WhatsApp and third-party platform compliance">
        <p>
          Use of WhatsApp messaging features is subject to WhatsApp Business policies, Meta platform terms,
          template approval rules, and messaging limits imposed by those platforms. WAPilot does not control
          third-party approval decisions, delivery outcomes, or policy enforcement actions taken by Meta or
          WhatsApp.
        </p>
        <p>
          You are responsible for maintaining an approved WhatsApp Business setup, using approved templates
          where required, honoring opt-out requests, and complying with regional messaging rules.
        </p>
      </LegalSection>

      <LegalSection title="5. Wallet, pricing, and payments">
        <p>
          Communication usage is billed through a prepaid wallet model unless otherwise agreed in writing.
          Charges apply per successful message or applicable usage event as shown in the product and on the{' '}
          <Link to="/pricing" className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
            pricing page
          </Link>
          .
        </p>
        <p>
          Wallet top-ups and payments are processed through third-party payment providers. You authorize us
          and our payment partners to charge the payment method you provide for approved transactions.
        </p>
        <p>
          Taxes, fees, and currency conversion costs may apply where relevant. All pricing is subject to
          change with notice where required.
        </p>
      </LegalSection>

      <LegalSection title="6. Refunds">
        <p>
          Refunds, when available, are handled according to our{' '}
          <Link to="/refund-policy" className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
            Refund Policy
          </Link>
          . Amounts already consumed for delivered communications are generally non-refundable.
        </p>
      </LegalSection>

      <LegalSection title="7. Customer data and privacy">
        <p>
          You retain ownership of data you upload or generate in your workspace. You grant WAPilot a limited
          license to host, process, and transmit that data solely to provide and improve the Service.
        </p>
        <p>
          Our handling of personal information is described in our{' '}
          <Link to="/privacy-policy" className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="8. Intellectual property">
        <p>
          WAPilot and its licensors own the Service, software, branding, documentation, and related
          intellectual property. These Terms do not grant you any rights to our trademarks or proprietary
          materials except as needed to use the Service.
        </p>
      </LegalSection>

      <LegalSection title="9. Service availability and disclaimers">
        <p>
          We strive to keep the Service available and reliable, but uninterrupted or error-free operation is
          not guaranteed. The Service is provided on an “as is” and “as available” basis to the fullest
          extent permitted by law.
        </p>
        <p>
          We disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement
          where allowed by applicable law.
        </p>
      </LegalSection>

      <LegalSection title="10. Limitation of liability">
        <p>
          To the maximum extent permitted by law, WAPilot and its affiliates will not be liable for indirect,
          incidental, special, consequential, or punitive damages, or for loss of profits, revenue, data, or
          business opportunities arising from use of the Service.
        </p>
        <p>
          Our total liability for any claim relating to the Service will not exceed the amount you paid to
          WAPilot for the Service in the twelve months before the event giving rise to the claim, except
          where liability cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="11. Suspension and termination">
        <p>
          We may suspend or terminate access if you violate these Terms, create security or legal risk, or fail
          to pay applicable charges. You may stop using the Service at any time.
        </p>
        <p>
          Upon termination, your right to access the Service ends. Provisions that by nature should survive
          termination will continue to apply, including payment obligations, disclaimers, and limitations of
          liability.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Material changes will be posted on this page with an
          updated effective date. Continued use after changes take effect constitutes acceptance of the
          revised Terms.
        </p>
      </LegalSection>

      <LegalSection title="13. Governing law and disputes">
        <p>
          These Terms are governed by the laws of India, without regard to conflict-of-law principles. Courts
          located in India will have exclusive jurisdiction over disputes arising from these Terms or the
          Service, unless applicable law requires otherwise.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
