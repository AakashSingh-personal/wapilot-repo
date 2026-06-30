import LegalPage, { LegalSection } from '../components/LegalPage.jsx';

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="June 30, 2026"
      intro="This Privacy Policy describes how WAPilot collects, uses, stores, and protects information when you use our website, dashboard, and related services (collectively, the “Service”). By using WAPilot, you agree to the practices described here."
    >
      <LegalSection title="1. Who we are">
        <p>
          WAPilot is a WhatsApp-first CRM and business automation platform that helps businesses manage
          conversations, appointments, campaigns, and payments. For privacy-related requests, contact us at{' '}
          <a href="mailto:support@wapilot.in" className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
            support@wapilot.in
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>We collect information necessary to operate the Service, including:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Account information:</strong> name, email address, business name, role, login credentials,
            and workspace settings.
          </li>
          <li>
            <strong>Customer and contact data you upload:</strong> names, phone numbers, tags, custom fields,
            conversation history, and other CRM data you choose to store in WAPilot.
          </li>
          <li>
            <strong>Communication data:</strong> WhatsApp message content, templates, delivery status, campaign
            records, and related metadata required to send and track messages.
          </li>
          <li>
            <strong>Scheduling data:</strong> appointments, staff availability, calendar sync details, and
            reminder preferences.
          </li>
          <li>
            <strong>Billing and wallet data:</strong> payment references, transaction history, wallet balance,
            invoices, and usage records for communication credits.
          </li>
          <li>
            <strong>Technical and usage data:</strong> IP address, browser type, device information, log files,
            and product usage events used for security, support, and service improvement.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <p>We use collected information to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Provide, operate, and maintain the Service.</li>
          <li>Authenticate users and enforce role-based access within your workspace.</li>
          <li>Send and receive WhatsApp messages, templates, reminders, and notifications on your behalf.</li>
          <li>Process wallet top-ups, usage charges, refunds, and billing records.</li>
          <li>Provide customer support, troubleshoot issues, and respond to your requests.</li>
          <li>Monitor security, prevent abuse, and comply with legal obligations.</li>
          <li>Improve product performance, reliability, and user experience.</li>
        </ul>
        <p>We do not sell your personal data or your customers&apos; personal data.</p>
      </LegalSection>

      <LegalSection title="4. Legal basis and your responsibilities">
        <p>
          Where applicable, we process data to perform our contract with you, pursue legitimate business
          interests such as security and service improvement, and comply with legal requirements.
        </p>
        <p>
          You are responsible for ensuring that you have a lawful basis to collect and process contact data
          uploaded to WAPilot, including obtaining valid consent where required for WhatsApp and marketing
          communications.
        </p>
      </LegalSection>

      <LegalSection title="5. How we share information">
        <p>We may share information only as needed to run the Service, including with:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Service providers:</strong> infrastructure, hosting, messaging, payment, analytics, and
            support vendors that process data on our instructions.
          </li>
          <li>
            <strong>WhatsApp / Meta platforms:</strong> when you connect WhatsApp Business capabilities and
            send or receive messages through approved channels.
          </li>
          <li>
            <strong>Payment processors:</strong> such as Razorpay, to process wallet top-ups and related
            transactions.
          </li>
          <li>
            <strong>Legal and safety requests:</strong> when required by law, court order, or to protect
            rights, safety, and platform integrity.
          </li>
        </ul>
        <p>We require processors to handle data under appropriate confidentiality and security obligations.</p>
      </LegalSection>

      <LegalSection title="6. Data retention">
        <p>
          We retain account, communication, billing, and audit records for as long as your account is active
          and as needed to provide the Service, resolve disputes, enforce agreements, and meet legal,
          tax, and regulatory requirements.
        </p>
        <p>
          When you request deletion, we will remove or anonymize eligible data unless retention is required by
          law or for legitimate business purposes such as fraud prevention and billing reconciliation.
        </p>
      </LegalSection>

      <LegalSection title="7. Security">
        <p>
          We use administrative, technical, and organizational safeguards designed to protect information,
          including access controls, encrypted transport where supported, and monitoring for unauthorized
          activity. No method of transmission or storage is completely secure, and we cannot guarantee absolute
          security.
        </p>
      </LegalSection>

      <LegalSection title="8. Your rights and choices">
        <p>Depending on applicable law, you may have the right to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Access, correct, or update personal information we hold about you.</li>
          <li>Request deletion of eligible personal information.</li>
          <li>Withdraw consent where processing is consent-based.</li>
          <li>Object to or restrict certain processing activities.</li>
          <li>Request a copy of information in a portable format, where applicable.</li>
        </ul>
        <p>
          To exercise these rights, email{' '}
          <a href="mailto:support@wapilot.in" className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
            support@wapilot.in
          </a>{' '}
          from your registered account email. We may need to verify your identity before fulfilling a request.
        </p>
      </LegalSection>

      <LegalSection title="9. International processing">
        <p>
          Your information may be processed in India and in other countries where our service providers
          operate. Where required, we take steps designed to ensure appropriate safeguards for cross-border
          transfers.
        </p>
      </LegalSection>

      <LegalSection title="10. Children">
        <p>
          WAPilot is intended for business use and is not directed to children under 18. We do not knowingly
          collect personal information from children.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we make material changes, we will post the
          updated version on this page and revise the “Last updated” date. Continued use of the Service after
          changes become effective constitutes acceptance of the updated policy.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
