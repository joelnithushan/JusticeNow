# Threat Model Overview

JusticeNow is built around **strong anonymity guarantees** for reporters. Below is a plain‑English summary of the hard rules defined in `CLAUDE.md` that every contributor must obey.

## Core Anonymity Guarantees
- **No reporter identity is ever stored** – the `case_reports` table contains no `user_id`, `email`, `phone`, `name`, or any other personal identifier. The only handle is a randomly generated `reference_code` returned to the reporter at submission.
- **Reporter‑facing flows are completely unauthenticated** – reporters never log in, and no authentication checks are performed on pages that allow case creation or lookup.
- **Device storage is limited** – the only data written to the client’s local storage is a boolean flag indicating that the onboarding screen has been seen. No case data, narratives, or reference codes are persisted on the device.
- **Evidence files are served via short‑lived signed URLs** – there are never permanent public URLs for uploaded evidence, preventing enumeration or unauthorized access.
- **Reference‑code lookup is rate‑limited** – the endpoint that retrieves a case by its `reference_code` must enforce rate limiting and return the **same generic response** for both "not found" and "rate limited" situations, so an attacker cannot use timing or error messages as an oracle.

## Hard Rules (Never Violate)
1. **Never add reporter identity to a case** – no `user_id`, email, IP address, or session identifier may ever be written to the database.
2. **Never add authentication to any reporter‑facing page or flow** – reporters remain anonymous and unauthenticated throughout.
3. **Never return internal case notes to an unauthenticated caller** – any internal notes are stripped server‑side before the response is sent.
4. **Never write case data to `localStorage` or `sessionStorage`** – only a simple onboarding flag may be stored on the client.
5. **Never serve evidence files through public URLs** – always generate signed URLs with a short expiry.
6. **Never log case narratives, evidence paths, or reference codes** – logs must not contain any reporter‑identifying information.
7. **Never commit real credentials** – only `.env.example` belongs in the repository.
8. **Never merge your own pull request** – follow the review process.

These rules are enforced both at the code level (middleware, services) and through CI linting/tests. Any change that appears to conflict with the above must be rejected or discussed with the team before proceeding.
