# Reviewer checklist — anonymity and safety

Use this when reviewing any pull request. It restates checks from `CLAUDE.md`
and `CONTRIBUTING.md` in a short tick-list. It does not change product behaviour.

## Hard anonymity rules

- [ ] No `user_id`, `email`, `phone`, `name`, IP, or session id added to
      `case_reports` (or anywhere that links a case to a person).
- [ ] No new authentication on reporter-facing pages or flows.
- [ ] Internal case notes are filtered **on the server**, never only in the client.
- [ ] No case data written to `localStorage` / `sessionStorage` / AsyncStorage
      (narratives, drafts, reference codes, evidence, internal notes).
- [ ] Evidence is not served via public URLs — short-lived signed URLs only.
- [ ] Logs do not contain case narratives, evidence paths, or reference codes.
- [ ] No `.env` or real credentials in the diff — only `*.env.example` with
      placeholders.

## Staff vs reporter

- [ ] Staff-only endpoints still require auth.
- [ ] Anonymous status lookup returns **one** case by reference code, with
      internal notes stripped server-side.
- [ ] Rate limiting / generic errors still prevent reference-code guessing
      oracles where that endpoint is touched.

## i18n and a11y (when UI changes)

- [ ] User-facing strings go through `t('key')` — no hardcoded English in UI.
- [ ] New keys added to `en` / `ta` / `si` together (or clearly marked placeholders).
- [ ] Form controls have labels; errors are announced.

## Process

- [ ] CI green (or failures explained).
- [ ] Author did not merge their own PR.
- [ ] Commit author email is the contributor’s own account.

## If something looks unsafe

Stop the merge. Ask the author to fix it. Prefer rejecting a “clever” shortcut
that weakens anonymity over shipping and explaining later.
