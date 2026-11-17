# One Day Farmer — Complete Website MVP

This is a runnable full-stack website package for the Hyderabad-first One Day Farmer concept.

## Included
- Responsive public website based on the approved visual prototype.
- Hyderabad-first positioning and multi-city interest capture.
- Customer farm-day enquiry form.
- Farmer partnership application form.
- City waitlist form (Hyderabad, Bengaluru, Pune, Mumbai, Chennai, Delhi NCR, Other).
- Consent checkbox and starter Privacy Notice and Terms pages.
- Express API with server-side validation, request-size limit, rate limiting and honeypot spam field.
- SQLite database for persistent enquiry storage.
- Admin dashboard to view enquiries and update statuses.
- Health endpoint and Dockerfile.

## Important limitations
This is a functional enquiry-capture MVP, not yet a complete transactional marketplace. It does not yet include customer accounts, farm-owner accounts, verified/live farm inventory, availability calendars, confirmed reservations, online payments/refunds, email/SMS notifications, reviews, payouts or a production cloud deployment. No demo farm card should be treated as a live offer.

The name "One Day Farmer" has a potential existing-business conflict in Telangana identified during earlier research. Do not publish the site under this name, buy branding/ads, or register it until company-name, domain and trademark clearance is completed with appropriate professional advice.

## Run locally
Requirements: Node.js 20+ and npm.

1. Extract this ZIP and open a terminal in the extracted folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `ADMIN_TOKEN` in `.env` to a random secret of at least 32 characters. Example generator:
   - PowerShell: `[guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()`
   - macOS/Linux: `openssl rand -hex 32`
5. Run `npm start`.
6. Visit `http://localhost:3000`.
7. Open `http://localhost:3000/admin.html` and sign in with the same admin token.

The SQLite database is created automatically under `data/`.

## Smoke test
- Open the site and submit an enquiry with consent checked.
- Confirm that a reference number appears.
- Open `/admin.html`, sign in, and confirm the enquiry is listed.
- Change its status and refresh.
- Visit `/api/health` and expect `{"ok":true,"service":"one-day-farmer"}`.

## Production launch checklist
- Clear the brand name, domain, social handles and trademarks first.
- Replace placeholder legal contact details; have privacy notice, terms, partner agreement, cancellation/refund policy and liability terms reviewed by an India-qualified professional.
- Deploy behind HTTPS with a managed database, automated backups, monitoring, secret manager and restricted admin access.
- Replace shared admin token with proper user accounts, password hashing and MFA.
- Add verified partner onboarding, property/activity permissions, safety procedures, insurance, food hygiene, accessibility and emergency information.
- Add email/SMS notifications, booking confirmation workflow, payment gateway and refund handling only after business/legal design.
- Configure data retention, deletion and consent withdrawal workflows.
