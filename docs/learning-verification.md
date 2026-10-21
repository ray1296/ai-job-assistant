# Learning Browser Verification

## Scope

Automated browser acceptance for the real learning catalog and account-scoped state. The test does not mock API responses. It registers two temporary users, searches and filters the catalog, reveals an answer, favorites and self-assesses a question, reloads to verify persistence, checks account isolation, captures a 390px screenshot, and fails on page errors or horizontal overflow.

## Run

From `app/`:

```sh
node tests/learning-browser.mjs
```

Set `TEST_BASE_URL` to use an already-running service. When unset, the test starts an isolated ephemeral service with `PORT=0` and a temporary `CAREER_DATA_DIR`; it never touches the public 5173 service. Browser executable defaults to the existing Playwright Chromium cache and may be overridden with `PLAYWRIGHT_EXECUTABLE_PATH`.

## Evidence

Screenshots are written under `app/artifacts/learning/`: `knowledge-desktop.png`, `practice-desktop.png`, `knowledge-mobile-390.png`, `practice-mobile-390.png`, and `plan-reloaded.png`. Override the output directory with `TEST_ARTIFACT_DIR`. Both mobile screenshots show authenticated learning pages at 390 × 844. The test prints only pass labels and aggregate counts; it does not print credentials or cookies.

## Selector contract

The learning UI exposes `data-testid=knowledge-page`, `data-testid=practice-page`, `搜索题目` input, `题目方向` and `题目分类` selects, question rows with `data-question-id`, per-row `学习此题`, `显示答案`, answer region `答题要点`, favorite labels `收藏`/`取消收藏`, self-assessment controls `自评待复习`/`自评已掌握`, and scope controls `scope-all`, `scope-review`, `scope-favorites`, `scope-mastered`. Empty answers must visibly say `未提供答题要点`. The test intentionally fails when these controls are absent.

## Existing-plan browser smoke

The same test visits `#jobs`, adds one real catalog job to the account’s intents, saves the selection, follows the `#plan` link, saves a distinctive draft, reloads, and asserts the editor contains the exact saved draft. Account B must have no plan items. This closes the prior gap where `application-plan.test.mjs` tested persistence and account scoping only through HTTP/storage.

## Execution status

Prepared and syntax-checked. Final live acceptance is pending the learning implementation build; screenshots are not evidence until the final test run has passed and images have been inspected.
