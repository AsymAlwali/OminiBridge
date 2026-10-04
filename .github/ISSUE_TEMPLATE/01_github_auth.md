---
name: GitHub OAuth dashboard authentication
about: Implement and document secure GitHub-only authentication for the dashboard
title: "[Dashboard] Implement GitHub OAuth authentication"
labels: enhancement, dashboard
assignees: ''
---

## Summary

Replace the dashboard's GitHub OAuth sign-in placeholder with a complete, secure authentication flow. GitHub must remain the dashboard's only authentication provider.

## Reproduction steps

1. Open `packages/dashboard/index.html` in a browser.
2. Select **Continue with GitHub**.
3. Observe that the page explains the OAuth client and callback are not configured and does not authenticate a user.

## Expected behavior

- A configured GitHub OAuth client can authenticate a user and return them to the dashboard.
- OAuth state and callback handling prevent request forgery and validate the returned identity.
- No client secret or access token is exposed in browser code, logs, or URLs.
- Unauthenticated users cannot access protected dashboard data.
- No alternate sign-in provider is presented.

## Technical specifications

- Integrate the static dashboard with a secure serverless OAuth callback/token-exchange service.
- Keep client ID, callback URL, allowed redirect origins, and scopes deployment-configurable.
- Validate OAuth state and use short-lived, secure, HttpOnly, SameSite cookies for sessions.
- Document local development and deployment setup without committing credentials.
- Add tests for success, denied consent, invalid state, callback errors, and expired sessions.

## Claiming this issue

Comment that you would like to work on this issue and wait for maintainer assignment before opening a pull request.
