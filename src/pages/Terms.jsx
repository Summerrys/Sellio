import React from 'react';
import LegalPage from '@/components/legal/LegalPage';

const sections = [
  {
    id: 'agreement',
    title: 'Agreement to these terms',
    content: (
      <>
        <p>These Terms and Conditions govern your access to and use of Sellio, including our website, merchant workspace, public storefronts, QR ordering, Sellio World and related features (together, the <strong>Services</strong>). Sellio is operated by Apptélier in Singapore.</p>
        <p>By accessing or using the Services, creating an account, accepting an invitation, purchasing a plan or placing an order through a Sellio-powered storefront, you agree to these terms and our <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the Services.</p>
        <p>If you use Sellio for a business or other organisation, you confirm that you have authority to accept these terms for that organisation. “You” then includes both you and that organisation.</p>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: 'Eligibility and authority',
    content: (
      <>
        <p>You must be legally capable of entering into these terms. Merchant owners and account administrators must be at least 18 years old and authorised to act for the relevant business.</p>
        <p>If a person under 18 browses or orders from a merchant storefront, that person should do so with the involvement of a parent or legal guardian where required. Merchants remain responsible for ensuring their offerings are lawful and age-appropriate.</p>
      </>
    ),
  },
  {
    id: 'services',
    title: 'What Sellio provides',
    content: (
      <>
        <p>Sellio provides software and digital infrastructure that may include branded storefronts, product and category management, QR and table ordering, order and kitchen workflows, inventory, reports, staff roles, notifications, themes, AI-assisted tools, merchant progression and marketplace discovery.</p>
        <p>Features, plan limits and availability may differ by plan, merchant category, device, region or development stage. Illustrations, prototypes, roadmap items and future areas of Sellio World describe intended direction and are not a promise that a feature will launch by a particular date.</p>
        <p>Where you have a separate signed proposal, statement of work, service agreement or order form with Apptélier, that document also applies. If it directly conflicts with these terms, the signed document controls for the subject it covers.</p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts, roles and security',
    content: (
      <>
        <p>You must provide accurate, current and complete account information and keep it updated. You are responsible for safeguarding your password, Google sign-in, device and session, and for activity carried out through your account unless caused by our breach.</p>
        <p>Do not share one login among multiple people. Merchant owners should invite staff individually, assign only the permissions needed for their work, review access regularly and remove access promptly when a role changes or employment ends.</p>
        <p>You must notify <a href="mailto:hello@apptelier.sg">hello@apptelier.sg</a> without undue delay if you suspect unauthorised access. We may require identity or authority checks before changing ownership, billing or sensitive account settings.</p>
      </>
    ),
  },
  {
    id: 'merchant-responsibilities',
    title: 'Merchant responsibilities',
    content: (
      <>
        <p>Each merchant is responsible for its business, storefront and customer relationship. A merchant must:</p>
        <ul>
          <li>publish accurate business, product, service, price, tax, availability and fulfilment information;</li>
          <li>honour accepted orders and clearly communicate cancellations, substitutions, refunds and delays;</li>
          <li>comply with laws, licences, permits and industry rules that apply to its goods, services, promotions and operations;</li>
          <li>use customer and staff information lawfully and provide any privacy notice required for its activities;</li>
          <li>maintain appropriate inventory, food-safety, product-safety and consumer-protection practices;</li>
          <li>ensure content and branding do not infringe another person's rights; and</li>
          <li>configure staff roles, payment methods, receipt details, taxes and operational settings correctly.</li>
        </ul>
        <p>Sellio does not verify every merchant listing, product, service or licence. We may review, restrict or remove material that appears unlawful, misleading, unsafe or inconsistent with these terms.</p>
      </>
    ),
  },
  {
    id: 'customer-orders',
    title: 'Customer orders and merchant transactions',
    content: (
      <>
        <div className="sellio-legal-callout">
          <p><strong>The merchant is the seller.</strong> When a customer orders from a Sellio-powered storefront, the purchase is between that customer and the merchant. Sellio supplies the technology used to present and manage the order.</p>
        </div>
        <p>The merchant is responsible for accepting, preparing, fulfilling, cancelling and refunding orders, as well as for product quality, safety, availability, pricing, taxes, warranties and customer support. Customers should check the merchant's information and order details before submitting an order.</p>
        <p>Sellio may transmit order status and other messages supplied by the merchant. Such status information is operational and may change. If an order, payment, refund or product issue arises, contact the merchant first. We may assist with platform-related issues but do not become the seller or guarantor of the transaction.</p>
      </>
    ),
  },
  {
    id: 'subscriptions',
    title: 'Plans, trials and subscriptions',
    content: (
      <>
        <p>Merchant features are offered under the plans, prices, billing periods and usage limits shown on the Sellio website or at checkout. Prices are in Singapore dollars unless stated otherwise and may exclude applicable taxes.</p>
        <p>Eligible merchants may receive a trial or promotional offer. The checkout or offer states the applicable duration, eligibility and conversion terms. Unless it clearly says otherwise, providing a payment method for a recurring plan authorises the plan to begin billing when the trial or promotional period ends.</p>
        <p>Monthly and annual subscriptions renew automatically for successive billing periods until cancelled. You authorise Stripe and Sellio to charge the payment method associated with the subscription for the plan price, applicable taxes and any authorised changes.</p>
        <p>Plan limits may include products, orders, staff, branches, tables, reports, roles or other usage. We may restrict a feature, request an upgrade or apply a separately disclosed charge if usage exceeds the purchased plan.</p>
      </>
    ),
  },
  {
    id: 'billing',
    title: 'Billing, cancellation and refunds',
    content: (
      <>
        <p>You can manage an eligible subscription through the billing portal made available in Sellio. Cancellation normally takes effect at the end of the current paid billing period, unless the billing portal or a written agreement states otherwise. You remain responsible for charges incurred before cancellation takes effect.</p>
        <p>Subscription fees are generally non-refundable once a billing period begins, except where required by law or expressly promised in writing. A plan change, credit or exception shown in Stripe or confirmed by us will apply according to its stated terms.</p>
        <p>If a charge fails, becomes overdue or is reversed, we may retry payment, provide a limited grace period, restrict paid functions, suspend merchant access or cancel the subscription. Restoring payment does not guarantee recovery of changes or transactions attempted while access was restricted.</p>
        <p>We may change future pricing or plan design. For an existing paid subscription, we will provide reasonable notice before a material price change applies to a later renewal, unless the change is required urgently by law or concerns an optional purchase you initiate.</p>
      </>
    ),
  },
  {
    id: 'payments',
    title: 'Payments and third-party payment services',
    content: (
      <>
        <p>Stripe processes merchant plan checkout, recurring subscription payments, invoices and billing management. Stripe's own terms and privacy notice also apply to its services.</p>
        <p>A merchant may configure customer-facing payment methods such as cash, bank transfer, PayNow, payment QR or a supported online payment option. Unless Sellio expressly states otherwise for a specific payment product, Sellio is not a bank, stored-value facility, escrow agent or money-transfer service and does not hold customer funds.</p>
        <p>Merchants are responsible for reconciling payments, issuing refunds, resolving chargebacks and complying with the rules of their chosen payment providers. A status recorded in Sellio does not by itself prove that funds have finally settled.</p>
      </>
    ),
  },
  {
    id: 'content',
    title: 'Your content and permissions',
    content: (
      <>
        <p>You retain ownership of content you submit to Sellio, including business information, product data, photographs, logos, themes and written material. You grant Apptélier a worldwide, non-exclusive, royalty-free licence to host, copy, process, adapt for technical display, transmit and show that content only as reasonably needed to operate, secure, improve and promote the Services and your public storefront.</p>
        <p>You confirm that you have all rights and permissions needed for the content and for any personal data it contains. Do not upload confidential information, malicious code, misleading material or content that infringes intellectual property, privacy, publicity or other rights.</p>
        <p>You may request removal of your content, subject to legitimate retention needs, completed transactions, backups and legal obligations. Public content may remain in search caches or third-party copies outside our control for a period after removal.</p>
      </>
    ),
  },
  {
    id: 'sellio-property',
    title: 'Sellio intellectual property',
    content: (
      <>
        <p>The Services, software, interface, Sellio name, logos, visual world, documentation, templates, original designs and other platform materials are owned by Apptélier or its licensors and are protected by intellectual-property laws.</p>
        <p>While your account is active and you comply with these terms, we grant you a limited, non-exclusive, non-transferable and revocable right to use the Services for their intended business or customer purpose. You may not copy, sell, sublicense, reverse engineer, scrape, bypass access controls, create a competing service from, or misuse protected parts of Sellio except where applicable law does not allow that restriction.</p>
        <p>Feedback and suggestions may be used to improve Sellio without payment or obligation, provided we do not publicly identify you as the source without permission.</p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    content: (
      <>
        <p>You must not use Sellio to:</p>
        <ul>
          <li>break the law, facilitate fraud or sell prohibited, counterfeit, unsafe or unlawfully regulated goods or services;</li>
          <li>mislead customers about identity, price, availability, reviews, fulfilment or promotions;</li>
          <li>harass, exploit, discriminate against or harm another person;</li>
          <li>upload malware, interfere with security, probe vulnerabilities or disrupt the Services;</li>
          <li>access another tenant, account or dataset without authorisation;</li>
          <li>send spam, conduct unauthorised surveillance or misuse personal data;</li>
          <li>automate extraction, excessive requests or other activity that unreasonably burdens the platform; or</li>
          <li>evade plan limits, usage controls, suspension or enforcement.</li>
        </ul>
        <p>We may investigate suspected misuse and cooperate with merchants, service providers or authorities where reasonably necessary and lawful.</p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'AI-assisted features',
    content: (
      <>
        <p>Sellio may offer AI-assisted product content, image analysis, business questions or other generated results. Outputs can be incomplete, inaccurate, outdated or unsuitable. You must review an output before publishing it or relying on it for business decisions.</p>
        <p>AI outputs are not legal, accounting, tax, medical, safety or other professional advice. Merchants remain responsible for product claims, allergens, prices, stock, translations, customer communications and decisions made using an output.</p>
        <p>Do not submit sensitive personal data, payment credentials, trade secrets or content you are not permitted to process. We may apply reasonable usage and rate limits to protect availability, cost and fair access.</p>
      </>
    ),
  },
  {
    id: 'coins',
    title: 'Sellio Coins and digital rewards',
    content: (
      <>
        <p>Sellio Coins and similar rewards are in-platform promotional items intended for eligible features such as cosmetic storefront upgrades, decorations or progression. Unless we expressly state otherwise, they are not money, electronic money, stored value, securities or property redeemable for cash.</p>
        <p>Coins may be subject to earning, purchase, redemption, expiry, transfer and usage rules shown in the relevant feature. We may correct errors, reverse fraudulent activity and adjust coin rules or availability with reasonable notice where practicable. You may not sell, exchange or trade Coins outside authorised Sellio functions.</p>
      </>
    ),
  },
  {
    id: 'third-parties',
    title: 'Third-party services and links',
    content: (
      <>
        <p>Sellio relies on or links to third-party services, including Supabase, Stripe, Google and services used for hosting, communications, maps, AI, monitoring or merchant content. Your use of a third-party service may be governed by that provider's own terms.</p>
        <p>We are not responsible for third-party websites, products, outages, changes or independent conduct that we do not control. We will use reasonable efforts to maintain our integrations, but a provider change may require us to modify, replace or discontinue a related Sellio feature.</p>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Availability, maintenance and changes',
    content: (
      <>
        <p>We aim to keep Sellio reliable, but the Services are provided on an “as available” basis. Maintenance, updates, internet conditions, service providers, emergencies or events outside reasonable control may cause errors, delay or downtime.</p>
        <p>We may improve, replace, limit or discontinue features. Where a material change adversely affects an active paid plan, we will give reasonable notice where practicable and consider an appropriate transition, except where immediate action is needed for security, legal compliance or platform integrity.</p>
        <p>You are responsible for maintaining appropriate business continuity procedures and exporting important records where Sellio provides an export function. Sellio should not be your only record of information that your business is legally required to retain.</p>
      </>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspension and termination',
    content: (
      <>
        <p>You may stop using Sellio and cancel your subscription. We may suspend or terminate access where payment is overdue, an account materially or repeatedly breaches these terms, use creates security or legal risk, a merchant's activity may harm customers or others, or we are required to act by law or a service provider.</p>
        <p>Where reasonably possible, we will provide notice and an opportunity to address the issue. We may act immediately where delay could create harm, liability, fraud, data loss, security risk or unlawful activity.</p>
        <p>On termination, your right to use the Services ends. Before cancellation takes effect, you should export records you need where an export is available. We handle remaining data according to the <a href="/privacy">Privacy Policy</a>, legitimate retention needs and any separate written agreement.</p>
      </>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    content: (
      <>
        <p>To the fullest extent permitted by law, Sellio is provided without implied warranties of uninterrupted availability, merchantability, fitness for a particular purpose, non-infringement or that every error will be corrected. We do not guarantee business results, marketplace traffic, revenue, customer demand or a particular AI output.</p>
        <p>We do not endorse or warrant a merchant, customer, listing, product, service or transaction merely because it appears on Sellio. Nothing in these terms excludes a warranty, guarantee or consumer right that applicable law does not allow to be excluded.</p>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    content: (
      <>
        <p>Nothing in these terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for fraud or fraudulent misrepresentation, wilful misconduct, or death or personal injury caused by negligence where the law prohibits exclusion.</p>
        <p>To the fullest extent permitted by law, Apptélier is not liable for indirect, incidental, special, punitive or consequential loss, or for loss of profits, revenue, goodwill, anticipated savings, business opportunity or data, arising from use of or inability to use Sellio.</p>
        <p>To the fullest extent permitted by law, Apptélier's total aggregate liability arising from or relating to the Services and these terms will not exceed the greater of SGD 200 or the fees you paid for the affected Sellio service during the 12 months before the event giving rise to the claim.</p>
        <p>The limitations in this section reflect the allocation of risk in the subscription price and apply regardless of the legal theory, but remain subject to any non-excludable rights under applicable law.</p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Business-user indemnity',
    content: (
      <>
        <p>If you use Sellio for a business or organisation, you will indemnify Apptélier and its personnel against reasonable third-party claims, losses, penalties and costs arising from your unlawful merchant activity, your products or services, your content, your misuse of personal data, or your material breach of these terms, except to the extent caused by Apptélier's own breach, negligence or wilful misconduct.</p>
        <p>We will notify you of a covered claim where reasonably practicable and allow reasonable participation in its defence. You must not settle a claim in a way that admits fault for or imposes an obligation on Apptélier without our written consent.</p>
      </>
    ),
  },
  {
    id: 'general',
    title: 'General legal terms',
    content: (
      <>
        <p>These terms, the <a href="/privacy">Privacy Policy</a> and any applicable signed agreement form the agreement concerning your use of Sellio. If any provision is held invalid or unenforceable, the remaining provisions continue in effect. A failure to enforce a provision is not a waiver.</p>
        <p>You may not transfer your account or these terms without our written consent. We may transfer these terms as part of a genuine restructuring, financing or transfer of the Sellio business, provided this does not reduce non-excludable rights.</p>
        <p>Neither party is liable for delay caused by events beyond its reasonable control, except that this does not excuse payment obligations already due. These terms do not create a partnership, employment, agency or joint venture relationship.</p>
      </>
    ),
  },
  {
    id: 'law-and-disputes',
    title: 'Governing law and disputes',
    content: (
      <>
        <p>These terms are governed by the laws of Singapore, without regard to conflict-of-law rules. The courts of Singapore have exclusive jurisdiction over disputes arising from or relating to these terms or the Services, unless applicable law requires otherwise.</p>
        <p>Before starting formal proceedings, you and Apptélier agree to make a good-faith effort to resolve the dispute by written notice and discussion for at least 30 days. This does not prevent either party from seeking urgent injunctive relief or using a statutory complaint process.</p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    content: (
      <>
        <p>We may update these terms to reflect changes to Sellio, pricing, providers, security, law or business operations. We will post the revised terms here and update the date above. For a material change affecting an active paid service, we will provide reasonable advance notice where practicable.</p>
        <p>If you do not agree to revised terms, you must stop using the affected Services and cancel before the change takes effect. Continued use after the effective date means you accept the revised terms.</p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    content: (
      <>
        <p>Questions, notices and complaints about these terms may be sent to:</p>
        <p><strong>Apptélier — Sellio</strong><br />Singapore<br /><a href="mailto:hello@apptelier.sg">hello@apptelier.sg</a></p>
      </>
    ),
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms and Conditions"
      eyebrow="Clear terms for connected commerce"
      intro="These terms explain the rules for using Sellio as a merchant, staff member or storefront customer, including accounts, orders, subscriptions, content and Sellio Coins."
      description="Read Sellio's Terms and Conditions for merchant accounts, storefront orders, Stripe subscriptions, AI features, Sellio Coins and platform use."
      path="/terms"
      lastUpdated="22 September 2026"
      sections={sections}
    />
  );
}
