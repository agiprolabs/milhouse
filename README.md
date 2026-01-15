# Milhouse

**The desktop app that lets Claude Code run free.**

<p align="center">
  <img src="milhouse.png" alt="Milhouse" width="200"/>
</p>

Milhouse is a native desktop IDE wrapper for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that gives you a dedicated workspace for AI-powered coding. Open a project, flip a switch, and let Claude handle the rest.

## Ralph Wiggum Mode

The star feature. Toggle **Ralph Wiggum Mode** and Claude runs with `--dangerously-skip-permissions` - no more approval prompts interrupting your flow. Claude can read files, write code, run commands, and execute your entire task autonomously.

> *"Me fail English? That's unpossible!"* - Ralph Wiggum

Perfect for:
- Bulk refactoring across your codebase
- "Fix all the tests" tasks you don't want to babysit
- Letting Claude explore and implement features end-to-end
- When you trust Claude and just want it to *do the thing*

**Use responsibly.** Ralph mode gives Claude full access to your project. Great power, great responsibility, etc.

## Download

Grab the latest release and start coding:

| Platform | Download |
|----------|----------|
| **macOS (Apple Silicon)** | [Download .dmg](https://github.com/agiprolabs/milhouse/releases/download/v0.2.0/Milhouse_0.2.0_aarch64.dmg) |
| **macOS (Intel)** | [Download .dmg](https://github.com/agiprolabs/milhouse/releases/download/v0.2.0/Milhouse_0.2.0_x64.dmg) |
| **Windows** | [Download .exe](https://github.com/agiprolabs/milhouse/releases/download/v0.2.0/Milhouse_0.2.0_x64-setup.exe) |

[All releases](https://github.com/agiprolabs/milhouse/releases)

## Features

- **One-Click Claude Code** - Opens your project and launches Claude Code automatically
- **Ralph Wiggum Mode** - Autonomous operation with no permission prompts
- **Native Terminal** - Full xterm.js terminal with WebGL acceleration
- **Project Memory** - Built-in MCP server gives Claude persistent context about your codebase
- **Tasks & Docs Drawer** - Slide-out panel to view tasks and documentation Claude creates (Cmd/Ctrl+D)
- **Multi-Tab Terminals** - Run Claude in one tab, your build in another
- **Cross-Platform** - macOS (Apple Silicon & Intel) and Windows

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed (`claude` command available)
- An Anthropic API key configured in Claude Code

## How It Works

1. **Open a project** - Select any folder with code
2. **Claude launches** - Terminal opens with Claude Code ready to go
3. **Toggle Ralph mode** - Enable autonomous operation in Settings
4. **Let Claude cook** - Give it a task and watch it work

## Development

```bash
# Install dependencies
npm install

# Build MCP server
cd mcp-server && npm install && npm run build && cd ..

# Run dev mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Tech Stack

- **App**: Tauri 2.0 (Rust + React + TypeScript)
- **Terminal**: xterm.js with WebGL renderer
- **Memory**: LanceDB vector store via MCP server

## License

MIT

---

*Named after Milhouse Van Houten, Bart Simpson's best friend. The Ralph Wiggum mode is named after... well, you know Ralph.*
