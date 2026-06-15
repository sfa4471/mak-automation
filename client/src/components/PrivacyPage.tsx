import React from 'react';
import { Link } from 'react-router-dom';

const s: Record<string, React.CSSProperties> = {
  page:    { maxWidth: 800, margin: '0 auto', padding: '48px 24px 80px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#111827', lineHeight: 1.75, fontSize: 15 },
  logoBar: { marginBottom: 40 },
  logo:    { height: 36 },
  h1:      { fontSize: 26, fontWeight: 700, margin: '0 0 4px' },
  meta:    { color: '#6b7280', fontSize: 13, margin: '0 0 40px' },
  h2:      { fontSize: 16, fontWeight: 700, margin: '36px 0 8px', color: '#111827' },
  p:       { margin: '0 0 12px' },
  ul:      { paddingLeft: 20, margin: '0 0 12px' },
  li:      { marginBottom: 6 },
  table:   { width: '100%', borderCollapse: 'collapse' as const, margin: '12px 0 20px', fontSize: 14 },
  th:      { textAlign: 'left' as const, padding: '8px 12px', background: '#f3f4f6', fontWeight: 600, borderBottom: '1px solid #e5e7eb' },
  td:      { padding: '8px 12px', borderBottom: '1px solid #f3f4f6' },
  footer:  { marginTop: 64, borderTop: '1px solid #e5e7eb', paddingTop: 24, color: '#6b7280', fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' as const },
  contact: { marginTop: 36, padding: '16px 20px', background: '#f9fafb', borderRadius: 8, fontSize: 14, color: '#374151' },
};

export default function PrivacyPage() {
  return (
    <div style={s.page}>
      <div style={s.logoBar}>
        <img src="/crestfield-logo.png" alt="Crestfield" style={s.logo} />
      </div>

      <h1 style={s.h1}>Privacy Policy</h1>
      <p style={s.meta}>Last updated: 06/15/2026</p>

      <p style={s.p}>
        This Privacy Policy explains how <strong>Syed Fawad Akhtar</strong> ("Crestfield," "we," "us") collects, uses,
        shares, and protects information in connection with the Crestfield web application at <strong>crestfield.app</strong>{' '}
        (the "Service"). Crestfield is a business-to-business service for businesses and their authorized users. We do not
        knowingly collect data from consumers or anyone under 18. For data you upload or generate in the Service, you are
        the controller and we act as a processor on your behalf.
      </p>

      <h2 style={s.h2}>1. Information We Collect</h2>
      <ul style={s.ul}>
        <li style={s.li}><strong>Account information</strong> you provide: business name, user names, email addresses, and billing details.</li>
        <li style={s.li}><strong>Customer Data</strong> you submit or generate: project records, field and test data, documents, and billing/invoicing records.</li>
        <li style={s.li}><strong>QuickBooks Online data</strong> (only if you connect it): customers, invoices, items, payments, and related transaction records needed for billing and invoicing features.</li>
        <li style={s.li}><strong>Technical and usage data</strong>: IP address, browser/device metadata, logs, and error reports used to operate and secure the Service.</li>
      </ul>

      <h2 style={s.h2}>2. How We Use Information</h2>
      <p style={s.p}>
        We use information to provide, operate, secure, and improve the Service and its billing/QuickBooks features; to
        authenticate users; to communicate about your account and support; and to comply with law.{' '}
        <strong>
          We do not sell your data, do not use it for advertising, and do not use QuickBooks Online data for any purpose
          other than providing the Service to you.
        </strong>
      </p>

      <h2 style={s.h2}>3. How We Share Information</h2>
      <p style={s.p}>
        We share information only with the infrastructure providers we use to run the Service, each bound by confidentiality
        and security obligations:
      </p>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Provider</th>
            <th style={s.th}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={s.td}>Supabase</td>
            <td style={s.td}>Database, authentication, file storage</td>
          </tr>
          <tr>
            <td style={s.td}>Render</td>
            <td style={s.td}>Application/backend hosting</td>
          </tr>
          <tr>
            <td style={s.td}>Vercel</td>
            <td style={s.td}>Frontend hosting and delivery</td>
          </tr>
          <tr>
            <td style={s.td}>Intuit (QuickBooks Online)</td>
            <td style={s.td}>Billing/invoicing integration (only if you connect it)</td>
          </tr>
        </tbody>
      </table>
      <p style={s.p}>
        We also disclose information when required by law or to protect rights and safety, and in connection with a merger
        or sale of assets. We do not share Customer Data or QuickBooks Online data with third parties for their marketing
        or for sale.
      </p>

      <h2 style={s.h2}>4. QuickBooks Online Data</h2>
      <p style={s.p}>
        We request only the access needed for billing and invoicing and use that data solely to provide the Service to you.
        You may disconnect QuickBooks Online at any time; on disconnection, we stop accessing it and delete the QuickBooks
        Online data we hold within a commercially reasonable period, except where retention is required by law.
      </p>

      <h2 style={s.h2}>5. Data Retention</h2>
      <p style={s.p}>
        We retain Customer Data while your account is active and as needed to provide the Service. After termination, you
        may export your data for 30 days, after which we may delete it, subject to legal retention requirements.
      </p>

      <h2 style={s.h2}>6. Security</h2>
      <p style={s.p}>
        We use administrative, technical, and organizational measures to protect data, including encryption in transit,
        access controls, authentication, and tenant data segregation. No system is completely secure, and we cannot
        guarantee absolute security. Use strong credentials and limit user access to those who need it.
      </p>

      <h2 style={s.h2}>7. Data Location</h2>
      <p style={s.p}>
        The Service is hosted in the United States. By using it from outside the United States, you consent to processing
        in the United States.
      </p>

      <h2 style={s.h2}>8. Your Rights</h2>
      <p style={s.p}>
        You may have rights to access, correct, delete, or export personal information depending on applicable law. Because
        we act as a processor for Customer Data, requests about that data are generally directed to the relevant business
        customer, and we will assist. To make a request, contact us at{' '}
        <a href="mailto:admin@crestfield.app">admin@crestfield.app</a>.
      </p>

      <h2 style={s.h2}>9. Changes</h2>
      <p style={s.p}>
        We may update this Policy and will post the revised version with a new date. Continued use means acceptance.
      </p>

      <h2 style={s.h2}>10. Contact</h2>
      <div style={s.contact}>
        <strong>Syed Fawad Akhtar</strong> · 672 W Peninsula Dr, Coppell, TX 75019 ·{' '}
        <a href="mailto:admin@crestfield.app">admin@crestfield.app</a>
      </div>

      <div style={s.footer}>
        <span>© 2026 Crestfield</span>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
        <a href="mailto:admin@crestfield.app">admin@crestfield.app</a>
      </div>
    </div>
  );
}
