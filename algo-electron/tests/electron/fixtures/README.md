# Electron Smoke Fixtures

## 职责

`tests/electron/fixtures/` stores minimal preload fixtures used by real Electron smoke tests.

## 当前覆盖

- `userScriptRuntimeOrdinaryPreload.ts` records ordinary preload execution order without exposing privileged APIs.

## 边界规则

Fixtures must stay deterministic and minimal. They must not contain real user scripts, cookies, tokens, login state, or network credentials.

## 验证入口

The fixtures are bundled by `tests/verify.mjs` and exercised through `npm run test:electron`.
