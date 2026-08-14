# Contributing to JusticeNow

This is the human-facing workflow guide for group SPM_NU_WE_01. The rules that our AI
agents must follow live in [`CLAUDE.md`](CLAUDE.md) — read that too, especially the
anonymity rules.

## Before you start

1. Move your Jira issue (project key `JNOW`) to **In Progress**.
2. Pull `main`.
3. Read [`CLAUDE.md`](CLAUDE.md).

## Branch naming

```
feat/JNOW-<number>-<short-kebab-description>
fix/JNOW-<number>-<short-kebab-description>
chore/<short-description>
```

Example: `feat/JNOW-9-submit-case-report`

## Commit messages

Format:

```
JNOW-<number>: <imperative summary>
```

Example: `JNOW-9: add anonymous case report submission`

Prefer several small commits over one large one. Never commit `.env`.

## Commit under your own account

Individual contribution is assessed in the viva. **Do not change `git user.name` or
`user.email` to another member's details, and never let an agent do so.** Verify who you
are before committing:

```bash
git config user.name && git config user.email
```

## The full workflow

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/JNOW-<n>-<description>`
3. Implement the change, **including tests**.
4. Run the test suite. Do not push failing tests.
5. Run the app and verify the feature manually.
6. `git add . && git commit -m "JNOW-<n>: ..."`
7. `git push -u origin feat/JNOW-<n>-<description>`
8. Open a PR into `main` using the template. Fill in every section.
9. Request review from another member. **Do not merge your own PR.**
10. After merge, move the Jira issue to **Done**.

**CI must be green before review.** Every PR runs lint + unit/integration tests +
Playwright e2e (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)). A PR with a
red check is not ready to review.

## Reviewing

- Check against `CLAUDE.md`'s hard rules first, especially anything touching anonymity
  (no reporter identity on a case, no case data in device storage, internal notes
  stripped server-side, evidence via signed URLs only).
- Confirm tests exist and pass, and that CI is green.
- Confirm there are no hardcoded user-facing strings (everything through `t('key')`).
- Say what needs changing plainly. Approve when it is right.

## Using AI agents

All of us use AI assistance. That is fine, and it is declared in the assignment under
the CLEAR framework. But:

- **You must understand and be able to explain every line you commit.** The viva
  assesses individual contribution, and "the AI wrote it" is not an answer.
- **Review agent output before committing.** Agents will confidently produce code that
  breaks the anonymity rules.
- **Never let an agent commit as another member, force-push to `main`, or merge a PR.**
- If an agent proposes storing reporter identity or persisting case data to the device,
  **reject it and raise it with the team.**
