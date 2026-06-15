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
  upper:   { textTransform: 'uppercase' as const, fontSize: 14 },
  footer:  { marginTop: 64, borderTop: '1px solid #e5e7eb', paddingTop: 24, color: '#6b7280', fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' as const },
  contact: { marginTop: 36, padding: '16px 20px', background: '#f9fafb', borderRadius: 8, fontSize: 14, color: '#374151' },
};

export default function TermsPage() {
  return (
    <div style={s.page}>
      <div style={s.logoBar}>
        <img src="/crestfield-logo.png" alt="Crestfield" style={s.logo} />
      </div>

      <h1 style={s.h1}>Terms of Service (EULA)</h1>
      <p style={s.meta}>Last updated: 06/15/2026</p>

      <p style={s.p}>
        These Terms govern your access to and use of the Crestfield web application at <strong>crestfield.app</strong> and
        related services (the "Service"), provided by <strong>Syed Fawad Akhtar</strong> ("Crestfield," "we," "us"). By
        creating an account or using the Service, you ("Customer," "you") agree to these Terms and represent that you are
        authorized to bind your business. The Service is for business use only.
      </p>

      <h2 style={s.h2}>1. Access and License</h2>
      <p style={s.p}>
        We grant you a limited, non-exclusive, non-transferable, revocable right to use the Service for your internal business
        purposes during your subscription. We reserve all rights not expressly granted.
      </p>

      <h2 style={s.h2}>2. Accounts</h2>
      <p style={s.p}>
        You are responsible for your account credentials, for all activity under your account, and for ensuring your authorized
        users comply with these Terms. Notify us promptly of any unauthorized access.
      </p>

      <h2 style={s.h2}>3. Acceptable Use</h2>
      <p style={s.p}>You will not:</p>
      <ul style={s.ul}>
        <li style={s.li}>reverse engineer the Service;</li>
        <li style={s.li}>resell or sublicense it;</li>
        <li style={s.li}>use it to build a competing product;</li>
        <li style={s.li}>attempt to access another customer's data or tenant;</li>
        <li style={s.li}>upload unlawful or malicious content; or</li>
        <li style={s.li}>use the Service in violation of law.</li>
      </ul>
      <p style={s.p}>
        We may suspend access for conduct that threatens the security or integrity of the Service or other customers' data.
      </p>

      <h2 style={s.h2}>4. Your Data</h2>
      <p style={s.p}>
        You own all data, files, project records, field data, documents, and billing records you submit or generate in the
        Service ("Customer Data"). You grant us a limited license to host, process, and transmit Customer Data solely to
        provide the Service to you. We do not sell Customer Data or use it for advertising. You are responsible for the
        accuracy and legality of your Customer Data, for having the rights to submit it, and for maintaining your own backups.
      </p>

      <h2 style={s.h2}>5. QuickBooks Online Integration</h2>
      <p style={s.p}>If you connect QuickBooks Online:</p>
      <ul style={s.ul}>
        <li style={s.li}>You represent you are authorized to connect it and to transfer data between the Service and QuickBooks Online.</li>
        <li style={s.li}>Your use of QuickBooks Online is governed by your agreement with Intuit; we are not responsible for the QuickBooks Online service or Intuit's acts.</li>
        <li style={s.li}>We use your QuickBooks Online data solely to provide the Service's billing and invoicing features and for no other purpose. We do not sell it or use it for advertising.</li>
        <li style={s.li}>You may disconnect at any time. On disconnection, we stop accessing your QuickBooks Online data and delete it within a commercially reasonable period, except where retention is required by law.</li>
      </ul>

      <h2 style={s.h2}>6. Fees</h2>
      <p style={s.p}>
        Fees and billing terms are as stated in your order or on the Service, in US dollars, and non-refundable except as
        expressly stated. You are responsible for applicable taxes other than taxes on our income.
      </p>

      <h2 style={s.h2}>7. Term and Termination</h2>
      <p style={s.p}>
        Either party may terminate for material breach not cured within 30 days of notice. We may suspend or terminate
        immediately for non-payment or for conduct under Section 3. On termination, your access ends, you may export your
        Customer Data for 30 days, and accrued payment obligations survive.
      </p>

      <h2 style={s.h2}>8. Disclaimer of Warranties</h2>
      <p style={{ ...s.p, ...s.upper }}>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL
        WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
      </p>

      <h2 style={s.h2}>9. Limitation of Liability</h2>
      <p style={{ ...s.p, ...s.upper }}>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY IS LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
        OR PUNITIVE DAMAGES, OR FOR LOST PROFITS OR DATA. EACH PARTY'S TOTAL LIABILITY ARISING FROM THESE TERMS WILL NOT
        EXCEED THE FEES YOU PAID US IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM. This limit does not apply
        to your payment obligations.
      </p>

      <h2 style={s.h2}>10. Changes</h2>
      <p style={s.p}>
        We may modify the Service and update these Terms. We will post the updated version with a new date and, for material
        changes, provide reasonable notice. Continued use means acceptance.
      </p>

      <h2 style={s.h2}>11. Governing Law</h2>
      <p style={s.p}>
        These Terms are governed by the laws of the State of Texas. The exclusive venue for disputes is the courts located
        in Dallas County, Texas.
      </p>

      <h2 style={s.h2}>12. General</h2>
      <p style={s.p}>
        These Terms are the entire agreement between the parties. You may not assign them without our consent; we may assign
        in a merger or sale of assets. If a provision is unenforceable, the rest remains in effect. Failure to enforce a
        provision is not a waiver.
      </p>

      <div style={s.contact}>
        <strong>Contact:</strong> Syed Fawad Akhtar · 672 W Peninsula Dr, Coppell, TX 75019 ·{' '}
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
