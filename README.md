# REA MCP Server for Cursor Cloud Agents

A starter workspace for using [REA (Reverse Engineer Anything)](https://github.com/morluto/rea) as an MCP server in Cursor cloud agent environments.

## What is REA?

REA is a powerful reverse engineering toolkit that connects AI agents to tools for analyzing:
- **Native binaries** - Decompile x86/x64/ARM executables with Hopper, Ghidra, or IDA
- **JavaScript/Electron apps** - Trace code, understand features, analyze ASARs
- **Mobile apps** - Inspect Android APKs, classes, methods
- **Managed code** - Analyze .NET assemblies  
- **Archives** - Explore ZIP, APK, IPA, MSIX, DMG packages
- **Firmware** - Extract and analyze embedded systems
- **Web traffic** - Inspect HAR/SAZ network captures
- **Databases** - Query SQLite databases
- **And more** - Go/Rust metadata, packet captures, signal recordings

**Official sources:**
- GitHub: https://github.com/morluto/rea
- Website: https://rea.tools/
- npm: `rea-agents`

## What's Included

This workspace provides:

1. **`.cursor/mcp.json`** - MCP server registration using the official REA command
2. **`.cursor/environment.json`** - Cloud VM setup with Node.js 24+ and procps
3. **`.agents/skills/reverse-engineer-anything/`** - REA workflow instructions for agents
4. **`samples/`** - Sample JavaScript application for testing
5. **`VERIFICATION.md`** - Test results and verification output

## Quick Start

### For Cloud Agents

1. **The workspace is already configured!** The MCP server registration is in `.cursor/mcp.json`

2. **Environment setup**: The `.cursor/environment.json` ensures Node.js 24+ and procps are installed

3. **Test the setup**: Run in a cloud agent terminal:
   ```bash
   npx -y rea-agents@latest doctor --client cursor --json
   ```

4. **Try JavaScript analysis**:
   ```bash
   npx -y rea-agents@latest analyze-javascript-application /workspace/samples --json
   ```

### For Local Development

1. **Install REA globally**:
   ```bash
   npm install -g rea-agents@latest
   ```

2. **Run setup** (registers with Cursor and other supported agents):
   ```bash
   rea setup
   ```

3. **Restart Cursor** to load the MCP server

## What Works on Cloud VMs

### ✓ Works Without Additional Setup

These features work immediately on cloud agents:

- **JavaScript/Electron analysis** - Understand app features, trace code flows, analyze ASARs
- **Archive inspection** - Explore ZIP, APK, IPA, MSIX, DMG contents
- **Managed code** - Inspect .NET assemblies (no .NET runtime needed)
- **Go binaries** - Extract compiler version, modules, build settings
- **Rust binaries** - Read cargo-auditable dependency metadata  
- **Web captures** - Analyze HAR/SAZ network traffic
- **PE resources** - Inspect Windows executable resources
- **Package inventory** - Explore file structures, checksums, plists

**Example agent request:**
> "Analyze the sample JavaScript app at `/workspace/samples` and explain what the FileManager class does"

### ⚠️ Requires Setup

These features need additional tools:

#### Ghidra (Free - Recommended for VMs)

**What it provides:**
- Native binary decompilation (x86, x64, ARM, and more)
- Assembly inspection
- Function analysis and cross-references
- Pseudocode generation

**Setup on cloud VM:**
```bash
# Download and extract Ghidra 12.1.x
wget https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20250112.zip
unzip ghidra_12.1.4_PUBLIC_20250112.zip -d ~/tools

# Install JDK 21+
sudo apt-get update && sudo apt-get install -y openjdk-21-jdk

# Set environment (add to ~/.bashrc)
export GHIDRA_INSTALL_DIR=~/tools/ghidra_12.1.4_PUBLIC
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

# Verify
rea doctor --provider ghidra --json
```

**Note:** Ghidra native decompiler may need building on some architectures. See `/workspace/VERIFICATION.md` for details.

#### Other Optional Tools

- **Hopper** - Commercial/demo tool, works on Linux with automated demo mode
- **IDA Pro** - Commercial tool (expensive), not practical for cloud VMs
- **JADX** - For Android APK class decompilation (free)
- **Binwalk/Unblob** - For firmware extraction (free)
- **TShark** - For packet capture analysis (free)

## Giving an Agent a Target

### JavaScript/Electron Apps

```
"Analyze the Electron app at /path/to/app and explain how its main process handles IPC"
```

Or for ASAR archives:
```
"Inspect the ASAR at /path/to/app.asar and show me the module structure"
```

### Native Binaries (requires Ghidra/Hopper/IDA)

```
"Decompile the function at address 0x401000 in /path/to/binary.exe"
```

### Android APKs

```
"Show me the manifest permissions in /path/to/app.apk"
```

### Archives

```
"List all files in /path/to/package.zip and show their checksums"
```

### Web Traffic

```
"Analyze the HAR file at /path/to/capture.har and show all API calls"
```

## MCP Tools Available

REA provides 207 MCP tools in version 6.5.0. Key tools include:

### JavaScript/Electron
- `analyze_javascript_application` - Full static analysis
- `trace_application_feature` - Follow code paths
- `list_electron_targets` - Connect to running apps
- `inspect_electron_fuses` - Check Electron security settings

### Native Binaries (requires engine)
- `open_binary` - Start analysis session
- `binary_overview` - Get executable metadata
- `analyze_function` - Decompile specific functions
- `search_functions` - Find functions by name/pattern
- `search_strings` - Extract and search strings

### Archives & Packages
- `inspect_artifact` - Inventory archive contents
- `inspect_pe_resources` - Inspect Windows resources
- `inspect_go_binary` - Extract Go metadata
- `inspect_rust_binary` - Read Rust dependencies

### Web & Network
- `capture_browser_scenario` - Record browser interactions
- `inspect_web_network_capture` - Analyze HAR/SAZ
- `inspect_packet_capture` - Analyze PCAP files

### Android
- `inspect_android_package` - APK manifest & structure
- `search_android_classes` - Find classes by name
- `decompile_android_method` - Decompile Java/Kotlin

For the complete list, run:
```bash
rea doctor --json | jq '.identity.catalog'
```

## Updating REA

REA updates frequently with bug fixes and new features. To update:

```bash
# If installed globally
rea update

# Or with npx (always gets latest)
npx -y rea-agents@latest setup
```

**Important:** After updating, restart your Cursor agent to load the new version.

## Lawful Use Notice

**REA is for lawful use only:**
- ✓ Analyze software you own
- ✓ Analyze software you're authorized to examine
- ✓ Research, education, interoperability testing
- ✓ Security analysis with permission
- ✓ Software preservation and archival

**Not authorized for:**
- ✗ Analyzing software without permission
- ✗ Bypassing license restrictions
- ✗ Cracking or piracy
- ✗ Unauthorized reverse engineering
- ✗ Violating terms of service

See REA's [DISCLAIMER.md](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) for complete responsible-use guidance.

## Cloud VM vs Local Mac Differences

| Feature | Cloud VM (Linux) | Local Mac |
|---------|------------------|-----------|
| JavaScript analysis | ✓ Full support | ✓ Full support |
| Ghidra | ✓ Works with setup | ✓ Works with setup |
| Hopper | ⚠️ Demo mode only | ✓ Full support (commercial) |
| IDA Pro | ✗ Not practical | ✓ Works (commercial) |
| Electron debugging | ⚠️ Headless only | ✓ Full GUI support |
| Browser capture | ⚠️ Headless Chrome | ✓ Full browser support |

## Troubleshooting

### "Node.js version not supported" warning

**Current status:** The VM has Node.js 22.14.0, but REA requires 22.19+, 24.11+, or 26+.

**Solution:** The environment.json will install Node.js 24.x on VM startup. Or manually:
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### "MCP tools not appearing in agent"

1. Check registration:
   ```bash
   rea doctor --client cursor --json
   ```

2. If registration is stale, refresh it:
   ```bash
   rea setup --client cursor
   ```

3. Restart Cursor completely

### "Provider unavailable" for native analysis

This means no native analysis engine (Hopper/Ghidra/IDA) is configured. JavaScript analysis still works. To enable native analysis, set up Ghidra (see above).

### Process ownership check failed (Linux)

REA needs `procps` for process ownership verification:
```bash
sudo apt-get install -y procps
```

This is included in the environment.json.

## Documentation Links

- **REA GitHub**: https://github.com/morluto/rea
- **REA Website**: https://rea.tools/
- **Installation Guide**: https://github.com/morluto/rea/blob/main/docs/installation.md
- **JavaScript Analysis**: https://github.com/morluto/rea/blob/main/docs/javascript-application-workflows.md
- **Native Analysis**: https://github.com/morluto/rea/blob/main/docs/native-investigation.md
- **CLI Guide**: https://github.com/morluto/rea/blob/main/docs/cli.md
- **MCP Contracts**: https://github.com/morluto/rea/blob/main/docs/mcp-contracts.md

## License

This starter workspace configuration: MIT

REA itself: MIT (see [REA LICENSE](https://github.com/morluto/rea/blob/main/LICENSE))

**Note:** Commercial tools (Hopper, IDA Pro) have their own licenses. REA does not provide licenses for these tools.

## Support

- **REA Issues**: https://github.com/morluto/rea/issues
- **REA Discord**: https://discord.gg/GkcryMnJDM
- **Documentation**: https://rea.tools/guides/

## Contributing

To improve this starter workspace:
1. Test on different cloud agent environments
2. Add more sample applications for testing
3. Document additional setup patterns
4. Share your REA workflows and use cases

For REA itself, see [CONTRIBUTING.md](https://github.com/morluto/rea/blob/main/CONTRIBUTING.md) in the REA repository.
