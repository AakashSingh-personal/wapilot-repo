export const LEGAL_SLUGS = ['privacy-policy', 'terms-of-service', 'refund-policy'];

export const LEGAL_SLUG_LABELS = {
  'privacy-policy': 'Privacy Policy',
  'terms-of-service': 'Terms of Service',
  'refund-policy': 'Refund Policy',
};

export const DEFAULT_LEGAL_DOCUMENTS = [
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    intro:
      'This Privacy Policy describes how Vartalap collects, uses, stores, and protects information when you use our website, dashboard, and related services (collectively, the "Service"). By using Vartalap, you agree to the practices described here.',
    sections: [
      {
        title: '1. Who we are',
        paragraphs: [
          'Vartalap is a WhatsApp-first CRM and business automation platform that helps businesses manage conversations, appointments, campaigns, and payments. For privacy-related requests, contact us at [support@vartalap.in](mailto:support@vartalap.in).',
        ],
      },
      {
        title: '2. Information we collect',
        paragraphs: ['We collect information necessary to operate the Service, including:'],
        listItems: [
          '**Account information:** name, email address, business name, role, login credentials, and workspace settings.',
          '**Customer and contact data you upload:** names, phone numbers, tags, custom fields, conversation history, and other CRM data you choose to store in Vartalap.',
          '**Communication data:** WhatsApp message content, templates, delivery status, campaign records, and related metadata required to send and track messages.',
          '**Scheduling data:** appointments, staff availability, calendar sync details, and reminder preferences.',
          '**Billing and wallet data:** payment references, transaction history, wallet balance, invoices, and usage records for communication credits.',
          '**Technical and usage data:** IP address, browser type, device information, log files, and product usage events used for security, support, and service improvement.',
        ],
      },
      {
        title: '3. How we use information',
        paragraphs: ['We use collected information to:'],
        listItems: [
          'Provide, operate, and maintain the Service.',
          'Authenticate users and enforce role-based access within your workspace.',
          'Send and receive WhatsApp messages, templates, reminders, and notifications on your behalf.',
          'Process wallet top-ups, usage charges, refunds, and billing records.',
          'Provide customer support, troubleshoot issues, and respond to your requests.',
          'Monitor security, prevent abuse, and comply with legal obligations.',
          'Improve product performance, reliability, and user experience.',
        ],
        trailingParagraphs: [
          'We do not sell your personal data or your customers\' personal data.',
        ],
      },
      {
        title: '4. Legal basis and your responsibilities',
        paragraphs: [
          'Where applicable, we process data to perform our contract with you, pursue legitimate business interests such as security and service improvement, and comply with legal requirements.',
          'You are responsible for ensuring that you have a lawful basis to collect and process contact data uploaded to Vartalap, including obtaining valid consent where required for WhatsApp and marketing communications.',
        ],
      },
      {
        title: '5. How we share information',
        paragraphs: ['We may share information only as needed to run the Service, including with:'],
        listItems: [
          '**Service providers:** infrastructure, hosting, messaging, payment, analytics, and support vendors that process data on our instructions.',
          '**WhatsApp / Meta platforms:** when you connect WhatsApp Business capabilities and send or receive messages through approved channels.',
          '**Payment processors:** such as Razorpay, to process wallet top-ups and related transactions.',
          '**Legal and safety requests:** when required by law, court order, or to protect rights, safety, and platform integrity.',
        ],
        trailingParagraphs: [
          'We require processors to handle data under appropriate confidentiality and security obligations.',
        ],
      },
      {
        title: '6. Data retention',
        paragraphs: [
          'We retain account, communication, billing, and audit records for as long as your account is active and as needed to provide the Service, resolve disputes, enforce agreements, and meet legal, tax, and regulatory requirements.',
          'When you request deletion, we will remove or anonymize eligible data unless retention is required by law or for legitimate business purposes such as fraud prevention and billing reconciliation.',
        ],
      },
      {
        title: '7. Security',
        paragraphs: [
          'We use administrative, technical, and organizational safeguards designed to protect information, including access controls, encrypted transport where supported, and monitoring for unauthorized activity. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
        ],
      },
      {
        title: '8. Your rights and choices',
        paragraphs: ['Depending on applicable law, you may have the right to:'],
        listItems: [
          'Access, correct, or update personal information we hold about you.',
          'Request deletion of eligible personal information.',
          'Withdraw consent where processing is consent-based.',
          'Object to or restrict certain processing activities.',
          'Request a copy of information in a portable format, where applicable.',
        ],
        trailingParagraphs: [
          'To exercise these rights, email [support@vartalap.in](mailto:support@vartalap.in) from your registered account email. We may need to verify your identity before fulfilling a request.',
        ],
      },
      {
        title: '9. International processing',
        paragraphs: [
          'Your information may be processed in India and in other countries where our service providers operate. Where required, we take steps designed to ensure appropriate safeguards for cross-border transfers.',
        ],
      },
      {
        title: '10. Children',
        paragraphs: [
          'Vartalap is intended for business use and is not directed to children under 18. We do not knowingly collect personal information from children.',
        ],
      },
      {
        title: '11. Changes to this policy',
        paragraphs: [
          'We may update this Privacy Policy from time to time. When we make material changes, we will post the updated version on this page and revise the "Last updated" date. Continued use of the Service after changes become effective constitutes acceptance of the updated policy.',
        ],
      },
    ],
    published: true,
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    intro:
      'These Terms of Service ("Terms") govern access to and use of Vartalap\'s website, dashboard, APIs, and related services (collectively, the "Service"). By creating an account or using the Service, you agree to these Terms.',
    sections: [
      {
        title: '1. Eligibility and account access',
        paragraphs: [
          'Vartalap is a business platform offered to organizations and authorized users. Access is provided on an invite or sales-led onboarding basis unless otherwise stated. You must provide accurate account information and keep your credentials secure.',
          'You are responsible for all activity under your account and for ensuring that users you add to your workspace comply with these Terms.',
        ],
      },
      {
        title: '2. The Service',
        paragraphs: ['Vartalap provides tools for:'],
        listItems: [
          'WhatsApp conversation management and inbox workflows.',
          'Template creation, submission, and campaign sending.',
          'Contact management, custom fields, and communication history.',
          'Appointment scheduling, reminders, and staff coordination.',
          'Wallet-based communication credits and usage tracking.',
          'Payments, billing records, and related business operations.',
        ],
        trailingParagraphs: [
          'Features may change over time. We may add, modify, or discontinue functionality with reasonable notice where required.',
        ],
      },
      {
        title: '3. Acceptable use',
        paragraphs: ['You agree not to use Vartalap to:'],
        listItems: [
          'Violate applicable laws, regulations, or third-party rights.',
          'Send spam, unsolicited messages, or communications without valid consent.',
          'Upload unlawful, harmful, deceptive, or infringing content.',
          'Attempt to bypass security, access other accounts, or disrupt the Service.',
          'Misrepresent your identity or the nature of your communications.',
        ],
        trailingParagraphs: [
          'You are solely responsible for the legality of contact lists, message content, templates, and business practices conducted through your workspace.',
        ],
      },
      {
        title: '4. WhatsApp and third-party platform compliance',
        paragraphs: [
          'Use of WhatsApp messaging features is subject to WhatsApp Business policies, Meta platform terms, template approval rules, and messaging limits imposed by those platforms. Vartalap does not control third-party approval decisions, delivery outcomes, or policy enforcement actions taken by Meta or WhatsApp.',
          'You are responsible for maintaining an approved WhatsApp Business setup, using approved templates where required, honoring opt-out requests, and complying with regional messaging rules.',
        ],
      },
      {
        title: '5. Wallet, pricing, and payments',
        paragraphs: [
          'Communication usage is billed through a prepaid wallet model unless otherwise agreed in writing. Charges apply per successful message or applicable usage event as shown in the product and on the [pricing page](/pricing).',
          'Wallet top-ups and payments are processed through third-party payment providers. You authorize us and our payment partners to charge the payment method you provide for approved transactions.',
          'Taxes, fees, and currency conversion costs may apply where relevant. All pricing is subject to change with notice where required.',
        ],
      },
      {
        title: '6. Refunds',
        paragraphs: [
          'Refunds, when available, are handled according to our [Refund Policy](/refund-policy). Amounts already consumed for delivered communications are generally non-refundable.',
        ],
      },
      {
        title: '7. Customer data and privacy',
        paragraphs: [
          'You retain ownership of data you upload or generate in your workspace. You grant Vartalap a limited license to host, process, and transmit that data solely to provide and improve the Service.',
          'Our handling of personal information is described in our [Privacy Policy](/privacy-policy).',
        ],
      },
      {
        title: '8. Intellectual property',
        paragraphs: [
          'Vartalap and its licensors own the Service, software, branding, documentation, and related intellectual property. These Terms do not grant you any rights to our trademarks or proprietary materials except as needed to use the Service.',
        ],
      },
      {
        title: '9. Service availability and disclaimers',
        paragraphs: [
          'We strive to keep the Service available and reliable, but uninterrupted or error-free operation is not guaranteed. The Service is provided on an "as is" and "as available" basis to the fullest extent permitted by law.',
          'We disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement where allowed by applicable law.',
        ],
      },
      {
        title: '10. Limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by law, Vartalap and its affiliates will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, data, or business opportunities arising from use of the Service.',
          'Our total liability for any claim relating to the Service will not exceed the amount you paid to Vartalap for the Service in the twelve months before the event giving rise to the claim, except where liability cannot be limited by law.',
        ],
      },
      {
        title: '11. Suspension and termination',
        paragraphs: [
          'We may suspend or terminate access if you violate these Terms, create security or legal risk, or fail to pay applicable charges. You may stop using the Service at any time.',
          'Upon termination, your right to access the Service ends. Provisions that by nature should survive termination will continue to apply, including payment obligations, disclaimers, and limitations of liability.',
        ],
      },
      {
        title: '12. Changes to these Terms',
        paragraphs: [
          'We may update these Terms from time to time. Material changes will be posted on this page with an updated effective date. Continued use after changes take effect constitutes acceptance of the revised Terms.',
        ],
      },
      {
        title: '13. Governing law and disputes',
        paragraphs: [
          'These Terms are governed by the laws of India, without regard to conflict-of-law principles. Courts located in India will have exclusive jurisdiction over disputes arising from these Terms or the Service, unless applicable law requires otherwise.',
        ],
      },
    ],
    published: true,
  },
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    intro:
      'This Refund Policy explains when wallet top-ups and other payments made to Vartalap may be refunded.',
    sections: [
      {
        title: '1. Refund window',
        paragraphs: [
          'Refund requests must be raised within 7 days from the original payment date.',
        ],
      },
      {
        title: '2. Wallet top-ups',
        paragraphs: [
          'Wallet top-ups may be refunded only for the unused wallet balance at the time of approval, subject to verification.',
          'Any amount already consumed for successful communication delivery is non-refundable.',
        ],
      },
      {
        title: '3. Billing errors',
        paragraphs: [
          'Duplicate payment and technical billing errors are eligible for full or partial refund after verification.',
        ],
      },
      {
        title: '4. Processing timeline',
        paragraphs: [
          'Approved refunds are processed to the original payment source within standard banking timelines (typically 5-10 business days).',
        ],
      },
      {
        title: '5. How to request a refund',
        paragraphs: [
          'To request a refund, email [support@vartalap.in](mailto:support@vartalap.in) with your payment reference, account email, and reason for the request.',
        ],
      },
    ],
    published: true,
  },
];
