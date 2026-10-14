---
name: reverse-engineer-anything
description: Reverse engineer native, managed, Electron/JavaScript, packaged, firmware, and browser targets with REA. Use shipped-artifact or requested runtime evidence to explain features, compare versions, decompile code, or guide a reconstruction. Skip REA for ordinary source-repository architecture analysis.
metadata:
 version: "42"
---

# REA

Use REA when a claim depends on a shipped binary or package, decompilation,
passive application runtime evidence, or comparison with
behavior not established by available source. For ordinary analysis of a
complete source repository, use normal repository tools and do not run REA
readiness or provider commands.

## Connect only when needed

Installing this skill supplies instructions; it does not register the REA MCP
server, install analysis engines, or add tools to an already-running agent.

If REA tools are available and their registration is not known to be stale,
proceed directly to the target. Do not run diagnostics or setup before every
investigation. Use the connected server's actual tool list and input schemas;
a skill installed from repository main may describe capabilities absent from
an older npm release. Keep complete inline Evidence when that server does not
advertise retained references.

If tools are absent, a call is blocked by the client, or a required provider is
unavailable, read [connection and recovery](references/connection-and-recovery.md).
Diagnose the observed blocker, continue useful supported work, and resume the
original task after repair. Client approval, shell PATH, registration and engine
availability have different remedies; avoid repeating setup for all of them.

1. Diagnose without changing REA or client configuration. `npx` may download
 the package and write to npm's cache. For Codex, run
 `npx -y rea-agents@latest doctor --client codex --json`. Substitute the current
 supported client: `claude_code`, `claude_desktop`, `codex`, `cursor`,
 `gemini_cli`, `windsurf`, `devin`, `opencode`, `antigravity`, `copilot_cli`,
 `commandcode`, `vscode`, `grok_build`, `omp`, or `grok_bot`. `grok_bot` has no local
 file registration: doctor reports the Grok Bot chat step, and setup does not
 write `mcp.json`. If the client is unknown, use `doctor --json` and
 inspect its registration results before choosing a setup scope.
2. Distinguish the reason. Missing, malformed, or stale registration needs a
 scoped configuration repair. An aligned registration with no tools in the
 active session needs a restart/reconnection; doctor cannot prove that the
 current agent has connected. A missing provider affects only tasks requiring
 that provider: static JavaScript inspection needs neither Hopper nor Ghidra,
 and Android inspection has separate bring-your-own JADX/Java prerequisites.
3. For a configuration repair, prepare the read-only plan:
 `npx -y rea-agents@latest setup --client codex --dry-run --json`.
 Use the current client's ID, show its exact proposed paths, backups, and
 changes, and obtain approval before setup writes configuration or installs
 Hopper. Setup normally installs the matching bundled skill too; include that
 replacement in the reviewed plan. After approval, apply the same scope with
 `npx -y rea-agents@latest setup --client codex --yes`. Add `--install-hopper`
 only if that separate installation was needed and explicitly approved.
4. Restart/reconnect the affected agent. Verify that REA tools actually appear
 in the session, then resume the original investigation. If they remain
 absent, inspect the client's MCP launch error rather than repeating setup.

REA setup never installs or upgrades Node.js, npm, Homebrew, Java, Ghidra, IDA,
JADX, Binwalk, or Unblob. Use existing prerequisites; do not install unrelated
software to repair
MCP registration. For an unsupported client, use manual stdio registration
with a version-pinned `rea-agents` package or continue through the CLI.

A concrete CLI fallback for an operator-supplied JavaScript tree or ASAR is:

```bash
npx -y rea-agents@latest analyze-javascript-application /absolute/path/to/app --json
```

No MCP registration or native engine is required. Read the returned Evidence,
graph, limitations, and unknowns with the same care as an MCP result; the CLI
returns the Evidence record directly. This fallback does not establish that
MCP is configured. Native CLI tasks still require their selected engine.
Prefer an existing `rea` CLI. When none is installed and REA package acquisition
is within the authorized scope, use `npx -y rea-agents@latest` in its place.
Configuration repair starts with a read-only setup plan; show paths, backups and
skill replacement before applying authorized changes. Preserve existing approval
and target-execution boundaries. REA setup never installs or upgrades unrelated
software, including Node.js, npm, Homebrew, Java, Ghidra, IDA, JADX, Binwalk or Unblob.

## Route the target first

Choose the first tool from the target the user supplied. Use `open_binary` for
active-target native or archive workflows; target-free tools take their own
explicit path or endpoint and do not need it.

- ASAR or extracted JavaScript/Electron tree:
 `analyze_javascript_application`.
- Archive/package member inventory (ZIP/APK/IPA/MSIX/AppX or DMG):
 `open_binary` with the supplied local path; use `inspect_artifact` when its
 graph and findings help answer the question.
- Android APK code, classes, methods, or incoming references:
 `inspect_android_package`, then focused Android tools when advertised.
 Archive member inventory still uses the archive route above.
- Managed PE/CLI assembly: `inspect_managed_artifact`.
- Firmware image: `inspect_firmware_regions` when advertised. Use
 `extract_firmware` when extraction is requested, with a caller-selected new
 absolute output directory. These tools use caller-supplied Binwalk/Unblob on
 Linux; see the [firmware guide](https://github.com/morluto/rea/blob/main/docs/firmware-analysis.md).
- .NET NativeAOT PE/ELF: native Ghidra analysis. Native code can yield pseudocode;
 consult the NativeAOT workflow in `references/native-and-artifacts.md` for
 optional metadata recovery and its supported host/layout boundary.
- User-owned browser page already open: `list_browser_targets`.
- Browser action the agent must perform (click, type, navigate):
 `capture_browser_scenario` with declared actions. See
 [runtime observation](references/runtime-observation.md) for connect/launch
 and the focused follow-up browser tools.
- Other targets: See full list in skill file...

For an existing IDA MCP configuration, use `open_binary` with the original
input binary and `provider_id: "ida"`; do not pass an `.idb` or `.i64` database.

## Work summary-first

Start with the default result and use its inline Evidence and graph context.
For a JavaScript application or ELF layout whose size is unknown or large,
call `analyze_javascript_application` or `inspect_binary_layout` with
`"detail": "summary"`, then inspect the retained `parent_evidence_id` with
`inspect_analysis_view`.

## Plan broader investigations

For requests that span multiple features or subsystems, use a staged workflow:
1. Turn the request into a checklist of questions and the evidence each answer needs
2. Inspect the current REA session, artifact identity, saved analysis database, bookmarks, and prior evidence
3. Start with the smallest useful overview or inventory
4. Inspect relevant packaged resources and configuration alongside code
5. Corroborate a conclusion with the evidence type it requires
6. Decompose work into independent questions
7. Keep a concise finding ledger linking each conclusion to Evidence IDs

## Finish the task

Explain findings in plain language and tie them to returned evidence. When the
user asks to build something, use normal coding tools and separate observed
behavior from design choices. Close an opened native session with
`close_binary` when the investigation is complete.
