# Isolated Windows availability

- Date: 2026-11-09 (Asia/Shanghai).
- Scope: environment-only probe, no installer or application run, no private profile access.

Read-only CIM reports `Containers-DisposableClientVM` with `InstallState = 1`
(enabled); `vmcompute` and `vmms` are running. This is stronger than finding the
WindowsSandbox executable, but does not by itself establish a usable guest.

A disposable `.wsb` probe was then launched with a hidden host window. Networking,
clipboard, audio/video input and printer redirection were disabled. Only a newly
created test-input directory (read-only) and a dedicated test-result directory
(writable) were mapped; the repository and user profile were not shared.

The guest logon script returned:

```json
{
  "kind": "isolated-windows-sandbox-boot-probe",
  "passed": true,
  "user": "WDAGUtilityAccount",
  "osVersion": "Microsoft Windows NT 10.0.26100.0",
  "timestamp": "2026-11-09T00:36:25.2930525+00:00"
}
```

The guest then shut down. Probe material is local and ignored under
`algo-electron/tmp/release-sandbox-probe/`. No host installation, registry/shortcut
change by NSIS, real credential, account login, or production database was used.

Result: the Sandbox boot path is available for later isolated acceptance. Fresh
install, 2.0.0-to-candidate upgrade, recovery, uninstall/data retention and reinstall
are **not yet performed**. A successful boot probe must not be counted as those gates.
