# Milhouse

A desktop IDE for Claude Code - bringing the power of Claude's AI coding assistant to a native application experience.

![Milhouse](milhouse.png)

## Download

### Latest Release (v0.1.0)

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | [Milhouse_0.1.0_aarch64.dmg](https://github.com/agiprolabs/milhouse/releases/download/v0.1.0/Milhouse_0.1.0_aarch64.dmg) |
| macOS (Intel) | [Milhouse_0.1.0_x64.dmg](https://github.com/agiprolabs/milhouse/releases/download/v0.1.0/Milhouse_0.1.0_x64.dmg) |
| Windows (Installer) | [Milhouse_0.1.0_x64-setup.exe](https://github.com/agiprolabs/milhouse/releases/download/v0.1.0/Milhouse_0.1.0_x64-setup.exe) |
| Windows (MSI) | [Milhouse_0.1.0_x64_en-US.msi](https://github.com/agiprolabs/milhouse/releases/download/v0.1.0/Milhouse_0.1.0_x64_en-US.msi) |

[View all releases](https://github.com/agiprolabs/milhouse/releases)

## Features

- **Native Terminal Integration**: Full-featured terminal with xterm.js and WebGL rendering
- **Claude Code Integration**: Seamlessly run Claude Code with project context
- **Project Management**: Open and manage multiple projects with persistent settings
- **MCP Server Support**: Built-in Model Context Protocol server for enhanced Claude capabilities
- **Cross-Platform**: Available for macOS (Apple Silicon & Intel) and Windows

## Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) must be installed
- Node.js 18+ (for development)
- Rust (for development)

## Development

### Setup

```bash
# Install dependencies
npm install

# Build MCP server
cd mcp-server && npm install && npm run build && cd ..

# Run in development mode
npm run tauri dev
```

### Build

```bash
# Build for production
npm run tauri build
```

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Tauri (Rust)
- **Terminal**: xterm.js with WebGL addon
- **MCP Server**: Node.js with LanceDB for context storage

## License

MIT
