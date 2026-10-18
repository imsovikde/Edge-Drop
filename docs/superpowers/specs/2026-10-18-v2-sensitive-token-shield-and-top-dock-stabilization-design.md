# Technical Design Specification: Edge-Drop v2.0.0
## Sensitive Token Shield, Top Dock Layout Stabilization & Instant Windows Auto-Launch

- **Date**: 2026-10-18
- **Milestone**: Version 2.0.0 (Epoch 16 of Ralph Loop)
- **Status**: Approved & Ready for Implementation

---

## 1. Problem Statement & Motivation

1. **Top Dock Axis Flip Disorientation**:
   - When switching `stickPosition` from `left`/`right` to `top`, Framer Motion retains DOM elements under key `filterKey = "${typeFilter}:${query}"`.
   - The CSS switches from `flex-direction: column` to `flex-direction: row`.
   - `layout="position"` attempts to FLIP-animate 250 items across a 90-degree rotated axis spanning thousands of vertical pixels, resulting in cards flying diagonally across the screen and becoming visually stuck.
2. **Hover Boundary Collapse in Top Mode**:
   - `useEdgeHover.ts` hardcodes `baseBladeH = 218px` in `case 'top'`.
   - When Settings or Emoji picker is open, the dock extends up to 480px. Moving the cursor below Y=258px fires `scheduleClose()`, causing the dock to abruptly close while the user is actively configuring preferences.
3. **Header Component Collision**:
   - `.header-search-center` uses `position: absolute; left: 50%; transform: translate(-50%, -50%)`.
   - On screens under 1400px or when all 6 category filters are rendered, the center search and tag bar directly overlaps the left segmented control.
4. **Emoji Recents Synchronization**:
   - Emoji recents were stored strictly in browser `localStorage`.
   - They were not persisted in settings or synced to Cloud Vault, and `EmojiCategoryBar` failed to update within the same window after emoji selection.
5. **Windows Installer Detachment & Cold Boot Response**:
   - NSIS finish page execution can stall on synchronous ShellExecute resolution, marking the installer window as "Not Responding" before closing.
   - Auto-launch on reboot needs instantaneous priority elevation upon cursor proximity.
6. **Major v2.0.0 Milestone Capability**:
   - Power users and developers frequently copy sensitive secrets (API keys, GitHub tokens, AWS keys, JWTs).
   - Displaying them raw in the clipboard shelf creates security vulnerabilities during screen shares and presentations.

---

## 2. Technical Architecture & Component Design

### Component A: Sensitive Token Shield (`src/lib/securityDetector.ts`)
- Implements high-performance regex heuristics executed in under 0.1ms:
  - **OpenAI / Anthropic Keys**: `sk-[a-zA-Z0-9_-]{20,}`, `sk-ant-[a-zA-Z0-9_-]{20,}`
  - **GitHub Personal Access Tokens**: `ghp_[a-zA-Z0-9]{36}`, `github_pat_[a-zA-Z0-9_]{50,}`
  - **AWS Access Keys**: `AKIA[0-9A-Z]{16}`
  - **JSON Web Tokens (JWT)**: `eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+`
  - **Private Cryptographic Keys**: `-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----`
- Masking output: retains first 6 characters and last 4 characters, replacing inner characters with `••••••••••••••••`.
- Configurable toggle in `Settings`: `maskSensitiveTokens: boolean` (default: `true`).

### Component B: Top Dock Axis Flip Stabilization (`src/components/ItemList.tsx`)
- Update `motion.div` key to `key={`${settings.stickPosition}:${filterKey}`}`.
- When `stickPosition` changes, Framer Motion safely mounts the new layout fresh, completely bypassing cross-axis FLIP interpolation.

### Component C: Dynamic Dock Hover Boundaries (`src/hooks/useEdgeHover.ts`)
- Replace static `baseBladeH = 218` with dynamic calculation:
  ```ts
  const baseBladeH = state.settingsOpen ? 480 : (state.emojiOpen ? 260 : 218)
  ```
- Ensures the panel remains interactive while interacting with Settings or Emoji Picker.

### Component D: Clean Flexbox Header (`src/components/Header.tsx` & `src/styles/panel.css`)
- Replace absolute positioning of `.header-search-center` in horizontal mode with flex alignment:
  `display: flex; flex: 1 1 auto; justify-content: center; max-width: 520px;`
- Guaranteed zero overlap between left filter pills and center search/emoji bar.

### Component E: Emoji Recents Store & Event Dispatch
- Add `emojiRecents: string[]` to `Settings` interface and default settings.
- Dispatch `edge-drop:emoji-recents-updated` custom DOM event on every paste to update `EmojiCategoryBar` instantly.
- Synchronize recents across devices via Cloud Vault.

---

## 3. Verification & Validation Strategy
1. **Unit Test Suite**:
   - `tests/sensitiveTokenShield.test.ts`: Test regex detection, masking, and reveal mechanics.
   - `tests/horizontalSettings.test.ts`: Ensure horizontal layout invariants are 100% satisfied.
   - Run `npm test` (all 72+ test suites).
2. **Typecheck & Production Build**:
   - Run `npm run typecheck` (0 errors across Node & Web).
   - Run `npm run build` (successful compilation).
3. **CI/CD Multi-OS Release**:
   - Commit and push to `origin/main`.
   - Monitor GitHub Actions release pipeline (`v2.0.0`) in real time across Windows, macOS, and Linux.
