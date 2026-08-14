<!--
Fill in every section. A PR with a red CI check is not ready for review.
See CONTRIBUTING.md and CLAUDE.md.
-->

## Jira issue

<!-- e.g. JNOW-9 — https://<your-site>.atlassian.net/browse/JNOW-9 -->

Key and link:

## What this changes

<!-- A short, plain-English summary of the change. -->

## Acceptance criteria

<!-- Copy the story's acceptance criteria and tick each one you have met. -->

- [ ]
- [ ]

## How to test it manually

<!-- Exact steps a reviewer can follow to see it working. -->

1.
2.

## Tests added

- [ ] Unit
- [ ] Integration
- [ ] End-to-end (Playwright)
- [ ] Accessibility (axe)

## Checklist

- [ ] Tests pass locally and CI is green
- [ ] No hardcoded user-facing strings (everything goes through `t('key')`)
- [ ] No `.env` or real credentials committed
- [ ] **No reporter identity added to a case** (no user_id/email/phone/name/IP/session)
- [ ] **No case data written to `localStorage`/`sessionStorage`**
- [ ] `CLAUDE.md` hard rules followed
- [ ] Committed under my own account (`git config user.email` is mine)

## Screenshots

<!-- For any UI change. Delete if not applicable. -->

## Notes for the reviewer

<!-- Anything you are unsure about, or want a second opinion on. -->
