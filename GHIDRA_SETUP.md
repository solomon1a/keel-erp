# Optional: Ghidra Setup for Native Binary Analysis

Ghidra is a free, open-source reverse engineering tool from the NSA. It enables native binary decompilation on cloud VMs.

## Why Ghidra?

- **Free and open source** - No license required
- **Powerful decompilation** - Supports x86, x64, ARM, MIPS, and more
- **Works headless** - Perfect for cloud/server environments
- **Well-documented** - Active community and good docs

## Requirements

- Ghidra 12.1.x (12.1.4 recommended)
- JDK 21 or newer (full JDK, not just JRE)
- 2GB+ RAM recommended
- Linux, macOS, or Windows

## Installation on Linux Cloud VM

### 1. Install JDK 21

```bash
# Update package list
sudo apt-get update

# Install OpenJDK 21
sudo apt-get install -y openjdk-21-jdk

# Verify installation
java -version
javac -version
```

### 2. Download and Install Ghidra

```bash
# Create tools directory
mkdir -p ~/tools
cd ~/tools

# Download Ghidra 12.1.4 (check ghidra-sre.org for latest)
wget https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20250112.zip

# Extract
unzip ghidra_12.1.4_PUBLIC_20250112.zip

# Verify
ls -la ghidra_12.1.4_PUBLIC/
```

### 3. Configure Environment

Add to `~/.bashrc`:

```bash
export GHIDRA_INSTALL_DIR=~/tools/ghidra_12.1.4_PUBLIC
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH=$PATH:$JAVA_HOME/bin
```

Apply changes:
```bash
source ~/.bashrc
```

### 4. Verify with REA

```bash
# Check Ghidra provider
rea doctor --provider ghidra --json

# Should show:
# - Ghidra found at GHIDRA_INSTALL_DIR
# - JDK version and location
# - Native decompiler status
```

## Platform-Specific Notes

### Linux ARM64

The native decompiler may need building:

```bash
cd $GHIDRA_INSTALL_DIR/Ghidra/Features/Decompiler/src/decompile/cpp
make ghidra_opt ARCH_TYPE="-arch arm64" OSDIR=linux_arm_64

decompiler_dir="$GHIDRA_INSTALL_DIR/Ghidra/Features/Decompiler/os/linux_arm_64"
mkdir -p "$decompiler_dir"
install -m 755 ghidra_opt "$decompiler_dir/decompile"
```

### macOS x86_64

Build the native decompiler:

```bash
cd $GHIDRA_INSTALL_DIR/Ghidra/Features/Decompiler/src/decompile/cpp
make ghidra_opt

decompiler_dir="$GHIDRA_INSTALL_DIR/Ghidra/Features/Decompiler/os/mac_x86_64"
mkdir -p "$decompiler_dir"
install -m 755 ghidra_opt "$decompiler_dir/decompile"
```

### macOS Apple Silicon (ARM64)

```bash
cd $GHIDRA_INSTALL_DIR/Ghidra/Features/Decompiler/src/decompile/cpp
make ghidra_opt ARCH_TYPE="-arch arm64" OSDIR=mac_arm_64

decompiler_dir="$GHIDRA_INSTALL_DIR/Ghidra/Features/Decompiler/os/mac_arm_64"
mkdir -p "$decompiler_dir"
install -m 755 ghidra_opt "$decompiler_dir/decompile"
```

## Resource Controls

### Memory Limits

Set JVM heap size (default is 2G):

```bash
export GHIDRA_HEADLESS_MAXMEM=4G  # For large binaries
```

Or for small targets on constrained VMs:
```bash
export GHIDRA_HEADLESS_MAXMEM=512M
```

### Startup Timeout

For large binaries that take longer to analyze:

```bash
export REA_GHIDRA_STARTUP_TIMEOUT_MS=600000  # 10 minutes
```

## Testing Ghidra

### 1. Check Provider Status

```bash
rea doctor --provider ghidra --json
```

Expected output should show:
```json
{
  "id": "ghidra",
  "configured": true,
  "available": true,
  "providerVersion": "12.1.4",
  "checks": [
    {
      "name": "configuration",
      "ok": true,
      "classification": "healthy"
    }
  ]
}
```

### 2. Test with a Simple Binary

```bash
# Create a simple test binary
echo 'int main() { return 42; }' > test.c
gcc -o test test.c

# Analyze with REA
rea open-binary test --provider ghidra
rea decompile main
rea close-binary
```

## Advanced Configuration

### Language Override

For specific binary formats (e.g., Borland C++ PE):

```bash
export REA_GHIDRA_LANGUAGE_ID="x86:LE:32:default"
export REA_GHIDRA_COMPILER_SPEC_ID="borlandcpp"
```

### Seed Functions

To help analysis find computed jumps:

Create `seeds.tsv`:
```tsv
# Address  Kind      Name (optional)
0x401000  function  custom_entry
0x402000  code
0x403000  label     data_label
```

Set environment:
```bash
export REA_GHIDRA_SEED_FILE=/absolute/path/to/seeds.tsv
```

### Disable Slow Analyzers

If analysis stalls on certain binaries:

```bash
export REA_GHIDRA_DISABLED_ANALYZERS="Objective-C Message Analyzer"
```

## Troubleshooting

### "Native decompiler not found"

**Solution:** Build the native decompiler for your platform (see above)

### "GHIDRA_INSTALL_DIR is not set"

**Solution:** Set the environment variable to your Ghidra installation:
```bash
export GHIDRA_INSTALL_DIR=/path/to/ghidra_12.1.4_PUBLIC
```

### "JDK not found" or "Wrong Java version"

**Solution:** Install JDK 21+ and set JAVA_HOME:
```bash
sudo apt-get install openjdk-21-jdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
```

### Analysis timeout

**Solution:** Increase the startup timeout:
```bash
export REA_GHIDRA_STARTUP_TIMEOUT_MS=900000  # 15 minutes
```

## What Ghidra Enables

With Ghidra configured, you can:
- Decompile native binaries to C pseudocode
- Analyze functions, calls, and cross-references
- Search for strings and functions
- Inspect assembly instructions
- Trace data flow and control flow
- Export analysis results

## Performance Tips

1. **Start small** - Test with small binaries first
2. **Tune memory** - Adjust heap based on binary size
3. **Skip slow analyzers** - Disable analyzers that don't help your case
4. **Use timeouts** - Set realistic timeouts for large binaries

## Alternative: Hopper or IDA

If Ghidra doesn't work or you prefer alternatives:

- **Hopper** - Commercial/demo, good for macOS/Linux
  - Run `rea setup` and approve Hopper installation
  - Demo mode available for free

- **IDA Pro** - Commercial, expensive but powerful
  - Requires existing license
  - See https://github.com/morluto/rea/blob/main/docs/ida-provider.md

## Resources

- Ghidra Download: https://ghidra-sre.org/
- Ghidra GitHub: https://github.com/NationalSecurityAgency/ghidra
- REA Ghidra Guide: https://github.com/morluto/rea/blob/main/docs/installation.md#ghidra
- REA Native Analysis: https://github.com/morluto/rea/blob/main/docs/native-investigation.md
