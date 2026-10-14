# Connection and Recovery

This reference guide covers diagnosing and recovering from REA MCP connection issues.

## Quick Diagnosis

Run the doctor command with your client:
```bash
npx -y rea-agents@latest doctor --client cursor --json
```

## Common Issues

### 1. REA Tools Not Appearing

**Symptoms:** Agent doesn't see REA tools even though MCP is configured

**Diagnosis:**
- Check if MCP server is registered: `rea doctor --client cursor`
- Look for registration status in output

**Solution:**
1. Refresh registration:
   ```bash
   rea setup --client cursor --dry-run  # Review changes
   rea setup --client cursor            # Apply if approved
   ```
2. Restart Cursor completely

### 2. Provider Unavailable

**Symptoms:** Error about Hopper, Ghidra, or IDA not available

**What this means:**
- Native binary analysis requires one of these engines
- JavaScript/Electron analysis works without them

**Solution for Ghidra (free):**
```bash
# Install Ghidra 12.1.x and JDK 21+
export GHIDRA_INSTALL_DIR=/path/to/ghidra_12.1.4_PUBLIC
export JAVA_HOME=/path/to/jdk-21

# Verify
rea doctor --provider ghidra
```

### 3. Node.js Version Warning

**Symptoms:** Warning about unsupported Node.js engine

**Current requirement:** Node.js 22.19+, 24.11+, or 26+

**Solution:**
- JavaScript analysis may still work with warnings
- For full support, upgrade Node.js:
  ```bash
  # Using nvm
  nvm install 24
  nvm use 24
  ```

### 4. Process Ownership Check Failed (Linux)

**Symptoms:** Error about `ps` command not found or incompatible

**Solution:**
```bash
sudo apt-get install procps
```

## Recovery Steps

1. **Diagnose first** - Don't run setup blindly
   ```bash
   rea doctor --client cursor --json
   ```

2. **Review the plan** - Always dry-run before applying
   ```bash
   rea setup --client cursor --dry-run
   ```

3. **Apply if needed** - Only after reviewing
   ```bash
   rea setup --client cursor
   ```

4. **Restart the client** - Essential for MCP changes to take effect

## What Works Without Setup

These features require no native analysis engine:
- JavaScript/Electron analysis
- Archive inspection
- Managed .NET assemblies
- Go/Rust metadata extraction
- Web capture analysis
- SQLite databases (Node.js 24.15+/26+)

## Getting Help

- REA GitHub Issues: https://github.com/morluto/rea/issues
- REA Discord: https://discord.gg/GkcryMnJDM
- Documentation: https://rea.tools/

## Emergency CLI Fallback

If MCP is completely broken, use CLI directly:
```bash
npx -y rea-agents@latest analyze-javascript-application /path/to/app --json
```

This works without MCP registration and returns full evidence.
