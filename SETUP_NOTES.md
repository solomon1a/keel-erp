# Workspace Setup Notes

## Created: October 14, 2026

## What This Workspace Provides

This is a starter workspace for using REA (Reverse Engineer Anything) as an MCP server in Cursor cloud agent environments.

### Files Created

1. **`.cursor/mcp.json`**
   - MCP server registration for REA
   - Uses official command: `npx -y rea-agents@latest mcp`
   - Compatible with Cursor cloud agents

2. **`.cursor/environment.json`**
   - Configures cloud VM with Node.js 24.x
   - Installs procps (required for Linux)
   - Sets up REA globally
   - Includes verification steps

3. **`.agents/skills/reverse-engineer-anything/`**
   - REA workflow instructions for agents
   - Connection and recovery guide
   - Based on official REA skill v42

4. **`samples/`**
   - Sample JavaScript application for testing
   - Demonstrates REA's JavaScript analysis capabilities
   - Used for verification testing

5. **`README.md`**
   - Comprehensive workspace documentation
   - What works on cloud VMs vs local Macs
   - Lawful use guidelines
   - Troubleshooting guide

6. **`VERIFICATION.md`**
   - Test results from initial setup
   - REA version: 6.5.0
   - JavaScript analysis test: SUCCESS
   - Lists what works without additional setup

7. **`GHIDRA_SETUP.md`**
   - Optional guide for native binary analysis
   - Step-by-step Ghidra installation
   - Platform-specific instructions
   - Troubleshooting tips

## Verification Results

### ✓ Successfully Tested
- MCP server configuration
- REA installation (v6.5.0)
- JavaScript application analysis
- CLI commands
- Doctor diagnostics

### ⚠️ Known Issues
- Node.js 22.14.0 shows engine warnings (needs 22.19+ or 24.11+)
- Environment.json includes Node.js 24 setup for cloud VMs

### ✗ Not Configured (Optional)
- Ghidra (requires manual setup - see GHIDRA_SETUP.md)
- Hopper (macOS/Linux - optional)
- IDA Pro (commercial - not practical for VMs)

## What Works Without Additional Setup

The following REA features work immediately on cloud agents:

- JavaScript/Electron application analysis ✓
- ASAR file analysis ✓
- Archive/package inspection (ZIP, APK, etc.) ✓
- Managed .NET assembly inspection ✓
- Go binary metadata extraction ✓
- Rust binary dependency metadata ✓
- Web network capture analysis (HAR/SAZ) ✓
- PE resource inspection ✓
- SQLite database inspection (with Node.js 24.15+/26+) ✓

## For Native Binary Analysis

To enable native binary decompilation:

1. Follow `GHIDRA_SETUP.md` (recommended - free)
2. Or use Hopper (commercial/demo)
3. Or use IDA Pro (commercial, expensive)

## Cloud VM Compatibility

### Works Great
- JavaScript/Electron analysis
- Archive inspection
- Package analysis
- Web traffic analysis

### Practical with Setup
- Ghidra (free, headless)
- Hopper demo mode (Linux)

### Not Practical
- IDA Pro (commercial, expensive)
- GUI-dependent workflows
- Electron GUI debugging

## Official REA Resources

- GitHub: https://github.com/morluto/rea
- Website: https://rea.tools/
- npm: `rea-agents` 
- Discord: https://discord.gg/GkcryMnJDM
- Docs: https://github.com/morluto/rea/tree/main/docs

## Maintenance

To update REA:
```bash
rea update  # If installed globally
# or
npx -y rea-agents@latest setup  # With npx
```

Then restart Cursor to load the new version.

## Contributing

To improve this workspace:
- Test on different cloud environments
- Add more sample applications
- Document additional patterns
- Share workflows and use cases

## License

- Workspace configuration: MIT
- REA itself: MIT
- Commercial tools (Hopper, IDA) have their own licenses

## Notes for Cloud Agent Users

This workspace is designed to work in Cursor cloud agent environments where:
- File system access is available
- Network access for npm/package downloads
- Terminal/shell access for running commands
- MCP server registration via .cursor/mcp.json

The environment.json ensures Node.js 24+ and procps are installed during VM setup.
