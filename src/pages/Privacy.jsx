import React from 'react';
import LegalPage from '@/components/legal/LegalPage';

const sections = [
  {
    id: 'who-we-are',
    title: 'Who we are and what this policy covers',
    content: (
      <>
        <p>Sellio is a commerce platform operated by Apptélier in Singapore. It helps merchants create public storefronts, manage products, inventory, tables, staff and orders, review reports, and participate in Sellio World.</p>
        <p>This policy applies when you visit <a href="https://sellio.apptelier.sg">sellio.apptelier.sg</a>, create or use a Sellio account, use a merchant workspace, browse or order from a Sellio-powered storefront, contact us, or otherwise interact with Sellio.</p>
        <p>A merchant may have its own privacy notice for its customers and staff. Where a merchant decides what customer or staff information to collect through its storefront or operations, that merchant is responsible for its own privacy obligations and Sellio processes the relevant information to provide the platform.</p>
      </>
    ),
  },
  {
    id: 'information-we-collect',
    title: 'Information we collect',
    content: (
      <>
        <h3>Account and profile information</h3>
        <p>We may collect your name, email address, phone number, sign-in details, profile preferences, account role, merchant membership and onboarding information. Authentication credentials are handled through our authentication services; we do not display your password to merchants or other users.</p>
        <h3>Merchant and storefront information</h3>
        <p>Merchants may provide business names, contact details, branch information, logos, banners, themes, product or service listings, descriptions, prices, categories, stock information, table details, operating settings and other material used to run or display a storefront.</p>
        <h3>Orders and customer information</h3>
        <p>When an order is placed or managed, Sellio may process order items, quantities, prices, fulfilment status, table or takeaway details, payment method or payment status, customer name and any contact or order information submitted for that transaction.</p>
        <h3>Billing information</h3>
        <p>Merchant plan purchases and subscription management are processed through Stripe. We receive billing records such as the plan, subscription status, billing period, currency, transaction identifiers and limited payment status information. Stripe, rather than Sellio, handles full card details.</p>
        <h3>Device, usage and support information</h3>
        <p>We may receive IP address, browser and device type, operating system, referring page, app activity, error and security logs, cookie identifiers, language and interface preferences, and information you provide when asking for support.</p>
        <h3>AI feature inputs</h3>
        <p>If you use Sellio AI features, we process the prompts, product images, business questions and related context you submit so the requested result can be generated. Please do not submit confidential, sensitive or unnecessary personal information to an AI feature.</p>
      </>
    ),
  },
  {
    id: 'how-we-collect',
    title: 'How we collect information',
    content: (
      <>
        <p>We collect information directly from you, from merchants and their authorised staff, automatically through the website and app, and from services you choose to connect or use.</p>
        <p>If you sign in with Google, Google provides the account information needed to authenticate you, such as your name, email address and profile identifier, according to the permissions shown during sign-in. You can manage the connection through your Google account.</p>
        <p>Merchants may enter information about staff, customers, products or orders. Merchants are responsible for having an appropriate reason and, where required, permission to provide that information to Sellio.</p>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use information',
    content: (
      <>
        <p>We use information where reasonably necessary to:</p>
        <ul>
          <li>create, authenticate, secure and administer accounts;</li>
          <li>provide storefronts, QR ordering, order management, inventory, reporting, staff permissions and merchant tools;</li>
          <li>process merchant subscriptions and maintain billing status;</li>
          <li>display merchant-provided content to customers and route order information to the relevant merchant;</li>
          <li>provide AI-assisted features requested by the user;</li>
          <li>send service, account, security, billing and support communications;</li>
          <li>detect misuse, investigate incidents and protect Sellio, merchants and customers;</li>
          <li>understand performance and improve the platform, where allowed by your cookie choice;</li>
          <li>comply with applicable law, enforce our terms and resolve disputes; and</li>
          <li>carry out another purpose explained at collection or authorised by you.</li>
        </ul>
        <p>Under Singapore's Personal Data Protection Act 2012 (PDPA), we rely on consent and on other grounds permitted by law, including what is reasonably necessary to provide a service you requested, manage a contractual relationship, protect legitimate interests or comply with legal obligations.</p>
      </>
    ),
  },
  {
    id: 'merchant-customer-data',
    title: 'Merchant, staff and customer data',
    content: (
      <>
        <div className="sellio-legal-callout">
          <p><strong>For storefront customers:</strong> the merchant whose storefront you use is responsible for its products, fulfilment and customer relationship. Contact that merchant first about an order or its use of your information. You may also contact us where your request concerns the Sellio platform.</p>
        </div>
        <p>Merchant owners control who is invited to their workspace and what permissions staff receive. Staff should use only their own authorised account and access business or customer information only for legitimate work purposes.</p>
        <p>Some merchant storefront details, product information and branding are intentionally public. Merchants should not publish personal information or content they do not have the right to make public.</p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    content: (
      <>
        <p>Sellio uses essential cookies and similar browser storage for sign-in, session continuity, security, navigation, interface preferences and core app functions. These are required for the service to work and are not disabled by declining optional analytics.</p>
        <p>Our cookie panel lets you allow or decline optional site-usage analytics. We remember that choice in your browser for up to 180 days. Optional analytics operate only after permission is given and when such analytics are enabled. You can reopen <strong>Cookie settings</strong> from the footer at any time.</p>
        <p>Clearing browser data, using a different device or browser, or changing our consent setup may cause Sellio to ask again. Blocking essential browser storage may prevent sign-in or other functions from working properly.</p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'When we share information',
    content: (
      <>
        <p>We do not sell personal information. We share or make information available only as reasonably needed for the purposes described in this policy, including with:</p>
        <ul>
          <li><strong>the relevant merchant and its authorised staff</strong>, for storefront, order, customer service and operational purposes;</li>
          <li><strong>Supabase</strong>, for database, authentication, storage and related platform services;</li>
          <li><strong>Stripe</strong>, for merchant checkout, subscriptions, invoices and billing management;</li>
          <li><strong>Google</strong>, when you choose Google sign-in or another Google-enabled function;</li>
          <li><strong>service providers</strong> supporting hosting, content delivery, communications, monitoring, security, support and AI-assisted functions;</li>
          <li><strong>professional advisers, authorities or other parties</strong> where reasonably necessary to comply with law, protect rights and safety, investigate misuse, or establish or defend legal claims; and</li>
          <li><strong>a successor or transaction party</strong> in connection with a genuine restructuring, financing, sale or transfer of all or part of the service, subject to appropriate confidentiality protections.</li>
        </ul>
        <p>Each third-party service may process information under its own terms and privacy notice. We seek to use providers appropriate to the nature of the service and information involved.</p>
      </>
    ),
  },
  {
    id: 'international-transfers',
    title: 'International data transfers',
    content: (
      <>
        <p>Sellio is operated from Singapore, but some service providers may process or store information in other countries. Those countries may have privacy laws different from Singapore's.</p>
        <p>Where the PDPA requires it, we take reasonable steps to ensure transferred personal data receives a standard of protection comparable to the protection under the PDPA, including through provider terms, contractual protections and security controls appropriate to the service.</p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    content: (
      <>
        <p>We keep information only for as long as it is reasonably needed to provide Sellio, administer an account or merchant relationship, maintain accurate business and transaction records, meet legal or tax obligations, resolve disputes, enforce agreements and protect the service.</p>
        <p>Retention periods vary by data type. Account and active merchant data generally remain while the account or relationship is active. Order, billing, audit, fraud-prevention and backup records may be retained longer where reasonably necessary or legally required. When information is no longer required, we delete, anonymise or securely isolate it in accordance with our processes.</p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect information',
    content: (
      <>
        <p>We use reasonable administrative, technical and organisational safeguards designed for the nature of the information and service, including authentication controls, role-based access, encrypted network connections, restricted administrative access, monitoring and service-provider security controls.</p>
        <p>No online service can guarantee absolute security. You are responsible for using a strong password, protecting your sign-in method and devices, keeping staff access current, and promptly notifying us if you suspect unauthorised access.</p>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights and choices',
    content: (
      <>
        <p>Subject to the PDPA and its exceptions, you may ask to access personal data we hold about you, learn how it has been used or disclosed, correct an error or omission, or withdraw consent for future collection, use or disclosure. You may also ask us to close your account, delete information that is no longer needed, or stop optional processing.</p>
        <p>Some requests may be limited where we must retain information, protect another person's rights, preserve security or transaction records, or comply with law. Withdrawing consent may affect our ability to continue providing features that depend on that information.</p>
        <p>To make a request, email <a href="mailto:hello@apptelier.sg">hello@apptelier.sg</a> with enough detail for us to identify you and understand the request. We may take reasonable steps to verify your identity. If the information is controlled by a merchant, we may direct the request to that merchant or assist it in responding.</p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    content: (
      <>
        <p>Sellio merchant accounts and administrative tools are intended for adults and authorised business users. We do not knowingly invite children to open merchant accounts or provide personal information through those tools.</p>
        <p>Public storefronts may be browsed by a general audience. Merchants are responsible for ensuring their offerings and any customer information they request are suitable and lawful for their audience. If you believe a child has provided personal data to Sellio inappropriately, contact us so we can review it.</p>
      </>
    ),
  },
  {
    id: 'links-and-services',
    title: 'External links and third-party services',
    content: (
      <>
        <p>Sellio may link to merchant websites, payment pages, social platforms, maps or other third-party services. We do not control those services and this policy does not govern their independent privacy practices. Review the relevant third party's notice before providing information.</p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    content: (
      <>
        <p>We may update this policy when Sellio, our providers or applicable requirements change. We will post the revised policy here and update the date above. If a change is material, we may also provide an in-app, account or email notice where appropriate.</p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    content: (
      <>
        <p>For privacy questions, requests or complaints concerning Sellio, contact:</p>
        <p><strong>Apptélier — Sellio Privacy</strong><br />Singapore<br /><a href="mailto:hello@apptelier.sg">hello@apptelier.sg</a></p>
        <p>We will review your message and respond within a reasonable period. If you remain dissatisfied, you may have the right to contact Singapore's Personal Data Protection Commission.</p>
      </>
    ),
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      eyebrow="Your data, handled with care"
      intro="This policy explains what Sellio collects, why we use it, when it may be shared and the choices available to merchants, staff and storefront customers."
      description="Read Sellio's Privacy Policy for merchants, staff and customers, including accounts, storefronts, orders, cookies, subscriptions and Singapore PDPA rights."
      path="/privacy"
      lastUpdated="22 September 2026"
      sections={sections}
    />
  );
}
