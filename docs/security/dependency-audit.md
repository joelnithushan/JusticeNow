# Dependency Audit Report

**Date:** 2026-09-19  
**Branch:** `chore/JNOW-65-supply-chain`  
**Command run:** `npm audit --omit=dev` (production dependencies only; no `npm audit fix` was executed and no lockfiles were modified)

---

## Summary

| Package scope | Vulnerabilities | Severity breakdown         |
|---------------|-----------------|----------------------------|
| Root (`/`)    | 0               | —                          |
| `/server`     | 4               | 1 high, 3 moderate         |
| `/client`     | 2               | 2 moderate                 |
| **Total**     | **6**           | **1 high, 5 moderate**     |

---

## Per-package results

### Root (`/`)

```
found 0 vulnerabilities
```

No production vulnerabilities.

---

### `/server`

```
# npm audit report

multer  <=2.2.0
Severity: high
multer vulnerable to Denial of Service via crafted multipart field names
  https://github.com/advisories/GHSA-wc9g-mqfw-jrwm
multer vulnerable to Denial of Service via file descriptor leak on aborted uploads
  https://github.com/advisories/GHSA-qfvm-cv95-jqjf
multer vulnerable to file size limit bypass via async fileFilter race condition
  https://github.com/advisories/GHSA-qvfw-j98x-7q72
multer vulnerable to Denial of Service via oversized array index in field names
  https://github.com/advisories/GHSA-535w-7cp7-47q4
fix available via `npm audit fix`
node_modules/multer

qs  2.2.5 - 6.15.3
Severity: moderate
qs array-limit bypass via bracket-key comma parsing
  https://github.com/advisories/GHSA-x5fp-wj9c-mxmx
qs: Denial of Service via Attacker Controlled isBuffer
  https://github.com/advisories/GHSA-4mjr-xmp4-gh2g
fix available via `npm audit fix`
node_modules/qs
  body-parser  1.20.5 - 1.20.6
  Depends on vulnerable versions of qs
  node_modules/body-parser
  express  4.22.2
  Depends on vulnerable versions of qs
  node_modules/express

4 vulnerabilities (3 moderate, 1 high)
```

---

### `/client`

```
# npm audit report

react-router  6.0.0 - 7.17.0
Severity: moderate
React Router: Open redirect via backslash in <Link> and useNavigate (CVE-2025-68470 bypass)
  https://github.com/advisories/GHSA-wrjc-x8rr-h8h6
React Router: Arbitrary Constructor Injection via deserializeErrors() in React Router SSR Hydration
  https://github.com/advisories/GHSA-337j-9hxr-rhxg
fix available via `npm audit fix`
node_modules/react-router
  react-router-dom  6.0.0-alpha.0 - 7.17.0
  Depends on vulnerable versions of react-router
  node_modules/react-router-dom

2 moderate severity vulnerabilities
```

---

## High and Critical Advisories

### ⚠️ HIGH — `multer` ≤ 2.2.0 (server)

Four advisories affect the version of `multer` currently pinned in `server/package.json`:

| Advisory | Summary |
|---|---|
| [GHSA-wc9g-mqfw-jrwm](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm) | DoS via crafted multipart field names |
| [GHSA-qfvm-cv95-jqjf](https://github.com/advisories/GHSA-qfvm-cv95-jqjf) | DoS via file descriptor leak on aborted uploads |
| [GHSA-qvfw-j98x-7q72](https://github.com/advisories/GHSA-qvfw-j98x-7q72) | File size limit bypass via async `fileFilter` race condition |
| [GHSA-535w-7cp7-47q4](https://github.com/advisories/GHSA-535w-7cp7-47q4) | DoS via oversized array index in field names |

**Risk context for JusticeNow:** Evidence uploads are the only multipart endpoint. A crafted request can cause the server process to hang or leak file descriptors, resulting in a denial of service for all reporters. The file size bypass also undermines the server-side upload limit, which is a security boundary.

**Recommended follow-up:** Open ticket `JNOW-66` — _"Upgrade multer to ≥ 2.3.0 to resolve high-severity DoS advisories (GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf, GHSA-qvfw-j98x-7q72, GHSA-535w-7cp7-47q4)"_. Pin `server/package.json` to `multer@^2.3.0` (or latest stable ≥ 2.3.0), run `npm install --prefix server`, verify the integration tests still pass, and update the lockfile in that PR.

---

## Moderate Advisories

### `/server` — `qs` indirect via `express` / `body-parser`

`qs` versions 2.2.5–6.15.3 are affected by two moderate advisories:

| Advisory | Summary |
|---|---|
| [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) | Array-limit bypass via bracket-key comma parsing |
| [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | DoS via attacker-controlled `isBuffer` |

These reach the server through `express@^4.19.2` → `body-parser` → `qs`. A fix for these is available by upgrading `express` to a version that ships a patched `qs` transitive dependency.

**Recommended follow-up:** Include in ticket `JNOW-66` above — upgrading `express` to `^4.21.x` or later typically resolves the `qs` transitive issue. Verify with `npm audit --omit=dev` after upgrading.

### `/client` — `react-router` / `react-router-dom` 6.0.0–7.17.0

| Advisory | Summary |
|---|---|
| [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) | Open redirect via backslash in `<Link>` and `useNavigate` (CVE-2025-68470 bypass) |
| [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) | Arbitrary constructor injection via `deserializeErrors()` in SSR hydration |

**Risk context for JusticeNow:** The SSR hydration advisory (`GHSA-337j-9hxr-rhxg`) has lower impact here because JusticeNow is a client-side Vite SPA (no SSR). The open-redirect advisory applies, but exploitation requires a user to follow a crafted link. Severity is moderate.

**Recommended follow-up:** Open ticket `JNOW-67` — _"Upgrade react-router-dom to ≥ 7.18.0 to resolve moderate open-redirect and constructor-injection advisories (GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg)"_. Test routing, language switching, and the staff dashboard navigation after upgrade.

---

## No Critical Advisories

There are **no critical-severity advisories** in any of the audited package scopes.

---

## Dependabot Automation

A Dependabot configuration has been added at [`.github/dependabot.yml`](../../.github/dependabot.yml) covering:

- `npm` updates weekly for `/`, `/server`, `/client`, and `/mobile`
- `github-actions` updates weekly for `/`
- Minor and patch updates grouped into a single PR per ecosystem directory
- All PRs labelled `dependencies` with a limit of 5 open at a time

Dependabot will automatically open PRs for the above advisories once merged to `main` if a patched version is available.
