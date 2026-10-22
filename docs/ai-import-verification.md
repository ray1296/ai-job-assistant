# Genuine AI resume import verification

## Scope and execution boundary

The dedicated browser harness uses a fresh temporary data directory, random loopback port, and synthetic accounts and resume fixtures only. It must not attach to the deployed service or copy an existing database. A private AI configuration file may be copied into the temporary directory with mode 0600; its contents, tokens, cookies, and request authorization headers must never be printed or included in browser traces. The service and temporary directory are removed in cleanup. No deployment or commit is part of this task.

## Current offline integration phase

The final source passes TypeScript and an isolated `BUILD_OUT_DIR=dist-review` build. Focused Node suites cover semantic mapping, draft CAS, cancellation and shared review/layout/learning gateway validation; five Python worker tests cover DOCX supplementary text and mandatory PDF rendering. Offline browser mode (`--offline`) uses only a loopback fake OpenAI server and fresh temporary database, never production credentials. Offline Chromium verified the learning AI-generation/API/cache/account-isolation core path. The final combined Studio layout UI and DOCX-to-PNG/PDF import acceptance remains incomplete: test harness navigation/stub assertions needed correction, and the final agent run was stopped before a result was collected. These tests do not establish all-format browser acceptance, real-provider semantic quality, or public deployment.

AI result polling is now 130 seconds (was 85), covering the server extraction budget of 120 seconds. The separate 20-second upload acceptance timer does not bound the model operation. No new paid model request or public restart occurred during this phase.

The authenticated same-draft `POST /api/resume-imports/:id/reprocess` accepts `{sourceText,revision}` plus explicit consent, preserves ID/provenance and applies revision CAS after successful model validation.

## Required acceptance checks

1. Render a synthetic resume as PNG, then embed that PNG in a PDF. Confirm the scanned PDF has no extractable text layer before uploading it.
2. Send the image and scanned PDF through the real vision model via the application UI. Assert exact synthetic contact details and distinctive skills/project text; assert vision provenance and a structured profile/document result. No mocked AI responses.
3. Seed an existing synthetic profile and old resume. Confirm recognition, review edits, draft save, and reload do not automatically change either stored resource.
4. Save edited structured review fields into the private pending draft, restart the isolated service, reload, and recover them through the UI. Confirm the same pending draft is available from profile and studio.
5. Explicitly choose the profile draft destination, select individual fields, and verify only selected fields enter the editable profile; the stored profile changes only after its separate save action.
6. Correct the recognized scanned-PDF name, explicitly choose a new resume version, verify the new document header contains that reviewed name, and verify the old version remains unchanged. Confirmation stays disabled until a destination is chosen; profile fields start unchecked.
7. Verify account B cannot list, read, edit, or delete account A pending drafts. Confirm profile and resume lists are isolated.
8. Delete a pending draft, reload, and verify it stays deleted. Capture desktop and 390px screenshots, inspect them visually, assert no horizontal page overflow, and fail on browser page errors.

## Final API contract

- `POST /api/resume-imports?filename=<encoded>`: raw binary upload with actual file Content-Type, `X-AI-Consent: true` and CSRF token, returns 202 `{job}`. Poll `GET /api/resume-extractions/:id`. Ready `result` includes `ai: {profile, document, evidence, provider, model, mode}`, `draftId`, `draftRevision`, text/pages/method/warnings.
- `GET /api/resume-imports`: `{drafts: [{id, revision, createdAt, updatedAt, mode}]}`.
- `GET /api/resume-imports/:id`: `{draft: {id, revision, sourceText, profile, document, evidence, provider, model, mode, createdAt, updatedAt}}`.
- `PUT /api/resume-imports/:id`: `{revision, sourceText, profile, document}` with CAS, returns `{draft}`.
- `DELETE /api/resume-imports/:id`: `{revision}`, returns 204. Cross-user access returns 404. Standard CSRF protection applies.
- `POST /api/resume-imports` as application/json with `{text}` and `X-AI-Consent: true` reparses edited text through AI; the browser acceptance avoids this extra paid call and instead saves reviewed structured fields.

## Run

From the app directory:

```sh
node tests/ai-import-browser.mjs --fixtures-only
node tests/ai-import-browser.mjs
```

The offline fixture mode does not start a server, read AI configuration, or make model calls. The full mode starts its own isolated server and makes two genuine synthetic vision requests. It deliberately ignores TEST_BASE_URL. Optional environment settings: AI_IMPORT_CONFIG_PATH, PLAYWRIGHT_EXECUTABLE_PATH, TEST_ARTIFACT_DIR.

## Execution status

Offline fixtures passed: readable synthetic PNG + one-page image-only PDF; pdftotext empty; visual inspection complete. Full isolated run bash-1016: real image vision exact facts passed; no overwrite; pending draft edit persisted across server restart+reload; A/B isolation and desktop/390px overflow passed. It reached profile destination; test assertion raced async UI, while failure screenshot proved it had updated after wait; harness now waits. Run bash-1026: real image call exceeded backend 60-second model budget and was cancelled; shown UI timeout is honest. No scan PDF call was reached and no automatic retry occurred. The parent authorized one more bounded full run with the same 60-second budget and no probe: bash-1028 also failed on its first image after 63.6 seconds, with the UI showing “AI处理超时；待确认草稿不设查看时限”. No scan request was reached; no further retry followed. The verifier's three runs attempted three real image requests (one passed, two timed out); earlier parent cache-failure runs may have initiated additional model calls, session total unknown. Document editor and evidence root mapping were subsequently added, but their latest rendering was not verified. Scan PDF recognition, final new-version field persistence, delete, and full acceptance remain unverified. No full browser acceptance or deployment is claimed.
