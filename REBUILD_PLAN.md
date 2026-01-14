# TokenGen Project Evaluation & Rebuild Plan

## Executive Summary

TokenGen is an ambitious project: a **Lightweight IDE for Claude Code** with integrated **Graph RAG context management** and **Ralph autonomous mode** integration. The goal is to provide a development environment that maintains semantic context about projects through vector embeddings and graph-based knowledge representation.

**Current Status:** The project has significant scaffolding but is not functional. The Tauri app compiles but displays only a placeholder UI. Many Rust backend functions are stubs. The frontend components exist but aren't connected to the App.

---

## Project Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      TokenGen Application                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐   ┌─────────────┐   ┌───────────────────┐    │
│   │  File Tree  │   │  Terminal   │   │  Context Panel    │    │
│   │  (React)    │   │  (xterm.js) │   │  Graph/Status/    │    │
│   │             │   │             │   │  Ralph Controls   │    │
│   └─────────────┘   └─────────────┘   └───────────────────┘    │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                    Tauri IPC Layer (invoke/events)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐   ┌─────────────┐   ┌───────────────────┐    │
│   │   Files     │   │  Terminal   │   │   MCP / Ralph     │    │
│   │   (Rust)    │   │  (PTY+Rust) │   │   (Rust)          │    │
│   └─────────────┘   └─────────────┘   └───────────────────┘    │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│              MCP Server (Node.js - separate process)             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  VectorStore (LanceDB) + GraphLayer + EmbeddingEngine   │   │
│   │                  13 MCP Tools                            │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Issues Identified

### 1. Frontend Issues

| Issue | Location | Description |
|-------|----------|-------------|
| **Placeholder App** | `src/App.tsx` | Only displays "If you can see this, the app is working!" - all components unused |
| **Orphaned Components** | `src/components/*.tsx` | FileTree, Terminal, ContextPanel, GraphView, StatusView, RalphControls exist but aren't imported |
| **Missing CSS imports** | `src/styles/` | Tailwind classes referenced (bg-bg-primary, text-text-secondary, etc.) may not be defined |

### 2. Rust Backend Issues

| Issue | Location | Description |
|-------|----------|-------------|
| **No State Management** | `main.rs` | `TerminalState`, `McpState`, `RalphState` defined but never instantiated or managed |
| **Terminal stubs** | `terminal.rs:93-112` | `write_terminal`, `resize_terminal`, `kill_terminal` are empty placeholders |
| **Terminal instance leak** | `terminal.rs:82-84` | Comment says "would need proper state management" - instances not stored |
| **File watcher stub** | `files.rs:133-138` | `watch_directory` does nothing |
| **MCP stubs** | `mcp.rs:81-99` | `stop_mcp_server` and `get_mcp_status` are placeholders |
| **Process not tracked** | `mcp.rs:61-69` | Child process spawned but not stored for later management |
| **Ralph stubs** | `ralph.rs:127-153` | `stop_ralph`, `get_ralph_status`, `set_ralph_config` are placeholders |
| **Unused warnings** | Build output | 16 warnings about unused variables/imports |

### 3. MCP Server Issues

| Issue | Location | Description |
|-------|----------|-------------|
| **HTTP incomplete** | `index.ts:289-301` | HTTP transport only has `/health` endpoint, no MCP protocol |
| **No error handling** | `store.ts` | SQL injection possible via string interpolation in queries |
| **Model not bundled** | `embedding.ts` | Depends on ONNX model file that may not exist |

### 4. Configuration Issues

| Issue | Location | Description |
|-------|----------|-------------|
| **Missing icons** | `tauri.conf.json:32-37` | References icon files that may not exist |
| **MCP not bundled** | `tauri.conf.json:39` | `resources: []` means MCP server not bundled with app |

---

## Rebuild Strategy

The key principle: **Start with a minimal working Tauri app, then add features incrementally, testing each step.**

---

## Phase 1: Minimal Working Tauri App

**Goal:** A Tauri app that launches, displays a window, and can invoke a simple Rust command.

### Step 1.1: Clean Slate Rust Backend

Create a minimal `main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Remove/comment out: `terminal.rs`, `files.rs`, `mcp.rs`, `ralph.rs`, `lib.rs`

Update `Cargo.toml` to remove unused dependencies initially.

### Step 1.2: Minimal Frontend

Create a simple `App.tsx` that tests Tauri IPC:

```tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

function App() {
  const [greeting, setGreeting] = useState('');
  const [name, setName] = useState('');

  async function greet() {
    setGreeting(await invoke('greet', { name }));
  }

  return (
    <div className="container">
      <h1>TokenGen</h1>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={greet}>Greet</button>
      <p>{greeting}</p>
    </div>
  );
}

export default App;
```

### Step 1.3: Verification Checklist

- [ ] `npm run tauri:dev` launches without errors
- [ ] Window displays correctly
- [ ] Greet button invokes Rust and displays result
- [ ] `npm run tauri:build` produces working binary

---

## Phase 2: File System Operations

**Goal:** Add file browsing capability.

### Step 2.1: Rust File Commands

Reintroduce `files.rs` with full implementation:

```rust
// Keep read_directory and read_file as-is (they work)
// Defer watch_directory for later
```

### Step 2.2: Frontend FileTree

1. Add the FileTree component
2. Add a simple layout (sidebar + main area)
3. Test file listing works

### Step 2.3: Verification Checklist

- [ ] Can browse directories
- [ ] Can select files
- [ ] File content can be read
- [ ] No errors in console

---

## Phase 3: Terminal Integration

**Goal:** Working terminal with PTY support.

### Step 3.1: Proper Rust State Management

```rust
// In main.rs
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub terminals: Arc<Mutex<HashMap<String, TerminalInstance>>>,
}

fn main() {
    let state = AppState {
        terminals: Arc::new(Mutex::new(HashMap::new())),
    };

    tauri::Builder::default()
        .manage(state)
        // ...
}
```

### Step 3.2: Complete Terminal Functions

Implement all terminal functions properly:
- `create_terminal` - store instance in state
- `write_terminal` - write to stored instance
- `resize_terminal` - resize stored instance
- `kill_terminal` - kill and remove from state

### Step 3.3: Frontend Terminal Component

Add Terminal component with:
- xterm.js integration
- Tab management
- Input handling

### Step 3.4: Verification Checklist

- [ ] Can create new terminal
- [ ] Can type and see output
- [ ] Can run commands (ls, cd, etc.)
- [ ] Can resize terminal
- [ ] Can close terminal tabs
- [ ] Multiple terminals work

---

## Phase 4: MCP Server Integration

**Goal:** MCP server can be started and communicates with the app.

### Step 4.1: Simplify MCP Server

Start with minimal MCP server:
- Remove LanceDB dependency initially (use in-memory storage)
- Use simple hash-based embeddings (no ONNX)
- Implement 2-3 core tools only

### Step 4.2: Bundle MCP Server

Update `tauri.conf.json` to bundle the MCP server.

### Step 4.3: Rust MCP Management

Implement proper process management:
- Store child process reference
- Implement stop functionality
- Implement status checking

### Step 4.4: Verification Checklist

- [ ] MCP server starts with app
- [ ] Can get MCP status
- [ ] Can stop MCP server
- [ ] Tools callable via CLI/test

---

## Phase 5: Context Panel & Graph

**Goal:** Display MCP data in the UI.

### Step 5.1: Add Context Panel

- StatusView (project status)
- GraphView (entity tree)

### Step 5.2: Connect to MCP

- Query MCP server for data
- Display in UI

### Step 5.3: Verification Checklist

- [ ] Status displays correctly
- [ ] Graph/tree view works
- [ ] Updates reflect in UI

---

## Phase 6: Ralph Integration (Optional)

**Goal:** Integrate Ralph autonomous mode.

This is the most complex feature and should only be attempted after Phases 1-5 are solid.

---

## File Structure for Rebuild

```
tokengen/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # Start minimal, grow incrementally
│   │   ├── state.rs          # Centralized state management (Phase 3+)
│   │   ├── files.rs          # Phase 2
│   │   ├── terminal.rs       # Phase 3
│   │   └── mcp.rs            # Phase 4
│   └── Cargo.toml
│
├── src/
│   ├── App.tsx               # Start minimal, grow incrementally
│   ├── main.tsx
│   ├── components/
│   │   ├── FileTree.tsx      # Phase 2
│   │   ├── Terminal.tsx      # Phase 3
│   │   └── ContextPanel.tsx  # Phase 5
│   ├── stores/
│   │   └── appStore.ts       # Phase 2+
│   └── styles/
│       └── globals.css
│
├── mcp-server/               # Phase 4
│   └── src/
│       ├── index.ts          # Simplified version
│       └── store.ts          # In-memory first, then LanceDB
│
└── package.json
```

---

## Key Principles

1. **Test Each Phase Completely** - Don't move on until current phase works perfectly
2. **No Premature Optimization** - Simple implementations first
3. **No Feature Creep** - Only add what's needed for current phase
4. **Keep Dependencies Minimal** - Add dependencies only when truly needed
5. **Handle Errors Properly** - Every function should handle failure gracefully

---

## Development Commands Reference

```bash
# Frontend only (fast iteration)
npm run dev

# Full Tauri app development
npm run tauri:dev

# Build production app
npm run tauri:build

# Check Rust compilation
cd src-tauri && cargo check

# MCP server development (Phase 4+)
cd mcp-server && npm run dev
```

---

## Success Criteria

The rebuild is complete when:

1. App launches reliably on macOS (and ideally Windows/Linux)
2. File browser works correctly
3. Terminal has full functionality (create, write, resize, kill)
4. MCP server starts with the app and is manageable
5. Context panel displays MCP data
6. No console errors or warnings
7. Clean shutdown (no orphan processes)

---

## Appendix: Current Working Components

These pieces work and can be reused:

- `read_directory` (files.rs) - Works correctly
- `read_file` (files.rs) - Works correctly
- `write_file` (files.rs) - Works correctly
- Frontend build pipeline (Vite + TypeScript) - Works
- Tauri configuration structure - Works
- MCP tool definitions (index.ts) - Logic is correct, needs integration work
- Store and Graph logic - Conceptually sound, needs testing

---

## Appendix: Components to Rebuild

These need significant work:

- Terminal state management (Rust)
- Terminal lifecycle (create/write/resize/kill)
- MCP server lifecycle (start/stop/status)
- File watching
- Frontend App.tsx and component integration
- MCP server HTTP transport (if needed)
- Ralph integration (defer to later)
