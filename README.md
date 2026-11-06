# Carreadi

Upload your CV, get matched to live jobs, see what you already have and what's missing,
and follow a step-by-step plan to close the gap.

Live at https://carreadi.naijabukana.com

## Run locally

```bash
npm install
npm run dev
```

## Checks

```bash
npm test
npm run typecheck
```

## Owner access

Set Worker secrets `OWNER_EMAIL`, `RESEND_API_KEY`, `DATA_KEY` (32+ random characters),
and `EMAIL_FROM` (a sender on a verified Resend domain). The configured owner can request
a sign-in link at `/signin` without buying a pass. Only the verified, unexpired session
unlocks full analyses, all ranked matches, exports and `/admin`; entering the email alone
never grants access. Owner access has no purchase quota or expiry; normal API burst limits
remain. Each device signs in separately. Existing customer passes and admin tokens still work.

Keep `DATA_KEY` and `QUOTA_SALT` stable: saved checks and account fingerprints depend on them.
Remove or change `OWNER_EMAIL` to revoke owner privileges immediately on subsequent requests.

## Localization and accessibility

Language support, translation maintenance and accessibility checks are documented in
[docs/LOCALIZATION.md](docs/LOCALIZATION.md).

## Contact

support@naijabukana.com
