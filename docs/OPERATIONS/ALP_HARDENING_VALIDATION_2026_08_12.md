# ALP Hardening Validation - 2026-08-12

## 1. Scope

This record covers the `2.0.0-beta.2` mainline hardening completed on August 12, 2026: repository cleanup, dependency upgrades, LLM and Electron security, renderer code splitting, clean installation, audits, automated tests, and Windows packaging.

## 2. Environment

- Local Node.js: `24.13.0`
- Supported Node.js: `>=22.18.0 <25`
- CI Node.js: `22.23.2`
- Electron: `43.4.0`
- TypeScript: `7.0.2`
- Vite: `8.2.1`
- React: `19.2.8`
- better-sqlite3: `13.0.3`
- OpenAI SDK: `7.4.0`

## 3. Verification Results

- Two clean `npm ci` runs completed successfully.
- Electron binary download and `electron-builder install-app-deps` both ran during `postinstall`.
- `npm ls --depth=0` reported no missing, invalid, or conflicting direct dependencies.
- Production and full audits against `registry.npmjs.org` both reported zero vulnerabilities.
- `npm run test:all` passed after the clean install and again after the packaging fixes.
- Database tests covered migrations 001 through 024 using temporary databases.
- Six renderer screenshot scenarios passed: problem sidebar, dashboard, settings, LLM settings, Coach metrics, and note editor.
- Renderer initial entry measured `192,201` bytes versus the `2,221,300`-byte baseline, a 91.3% reduction.
- `npm run build:win` produced the Windows x64 NSIS installer and passed the automated `win-unpacked` startup smoke.
- The packaged smoke used isolated temporary `userData`, created `algo-learning.sqlite`, loaded the native SQLite module, and completed application startup.

## 4. Installer Record

- File: `AlgoLearningPlatform-Windows-2.0.0-beta.2-x64-Setup.exe`
- Size: `121,094,689` bytes
- SHA-256: `C5C0D47873614227676FCDFD6D873F5ED65F91195D611B3D75DF5F2C2F6FFBF6`

The installer, unpacked application, renderer output, Electron output, and test temporary files were removed after verification. `node_modules` was retained as required.

## 5. Final Repository State

- `master` and `origin/master` were synchronized after a fast-forward-only update.
- Local and remote `trae` branches are absent.
- The temporary hardening branch was deleted after publication.
- `.trae/`, `.tmp.driveupload/`, `.idea/`, `release/`, `dist/`, `dist-electron/`, and `tmp/` are absent.
- Tracked source tree: 505 files, approximately 2.35 MiB.
- Retained `node_modules`: 28,874 files, approximately 681.1 MiB.

## 6. Maintenance Rules

- Do not remove `test:packaged-main` or `test:packaged-app` from Windows release validation.
- Keep `better-sqlite3` external in the Vite 8 main-process bundle and unpack its native binaries from asar.
- Run audits against the npm registry when the configured mirror does not implement the audit API.
- Use only temporary databases and temporary `userData` for automated release validation.
