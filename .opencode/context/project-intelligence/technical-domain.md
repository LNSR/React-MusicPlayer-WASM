<!-- Context: project-intelligence/technical | Priority: critical | Version: 1.0 | Updated: 2026-06-16 -->

# Technical Domain

> Local-first music player: React 19 + Vite + FFmpeg.wasm + Zustand + Tailwind v4.

**Last Updated**: 2026-06-16

## Quick Reference
- **Update Triggers**: Library upgrades, new architecture patterns, worker changes
- **Audience**: Developers, AI agents

## Primary Stack

| Layer       | Technology           | Version   | Rationale                            |
|------------ |--------------------- |---------- |------------------------------------- |
| Framework   | React + Vite         | 19 / 6.0  | Fast HMR, modern tooling             |
| Compiler    | React Compiler       | babel     | Auto-memoization via Babel plugin    |
| Language    | TypeScript           | strict    | Type safety across codebase          |
| Package Mgr | Bun                  | 1.3       | Fast installs, native TS support     |
| Styling     | Tailwind CSS         | v4        | Utility-first, Vite plugin           |
| State       | Zustand              | v5        | Lightweight, selector-friendly       |
| UI          | Radix UI             | latest    | Accessible primitives (headless)     |
| Audio       | FFmpeg.wasm          | 0.12      | In-browser audio processing (WASM)   |
| Metadata    | music-metadata       | 11        | Parse audio file tags                |
| Virtual     | TanStack Virtual     | v3        | 60fps scroll for large libraries     |
| Workers     | Web Workers + Comlink| -         | Off-main-thread heavy computation    |
| Icons       | Lucide React         | latest    | Consistent icon system               |
| Toasts      | Sonner               | v2        | Lightweight toast notifications      |
| Class Merge | clsx + tailwind-merge| -         | `cn()` utility in `src/lib/utils.ts` |

## Architecture

```
Client-only SPA — no server, no API routes.
Heavy work offloaded to Web Workers (FFmpeg, metadata, audio decode).

src/
├── components/
│   ├── ui/            # Radix-based primitives (button, slider, tabs...)
│   └── features/      # Music-specific: TrackTable, PlayerBar, LibraryPanel
├── stores/            # Zustand: state + actions + selectors split
│   └── music-app/     # Domain-specific store module
├── hooks/             # Feature hooks (usePlaybackControls, useLibraryWorker...)
├── context/           # React context providers (MusicRuntimeContext)
├── workers/           # Web Workers: ffmpeg, metadata, decoder, shared utils
├── lib/               # Utilities: cn(), music-player.ts, lru-caches.ts
└── types/             # Shared TypeScript types
```

## Data Flow

```
User Action → Zustand Store → UI Re-render
                  ↕
          MusicRuntimeContext
                  ↕
            Web Workers (Comlink)
                  ↕
         FFmpeg.wasm / File System
```

### Store Pattern (Zustand)

```typescript
// state.ts     — initial state + type exports
// actions.ts   — set-based actions (no middleware)
// selectors.ts — derived state selectors
// useMusicAppStore.ts — `create<MusicAppStore>(...)` combining state + actions

import { create } from 'zustand'
export const useMusicAppStore = create<MusicAppStore>((set) => ({
  ...initialMusicAppState,
  ...createMusicAppActions(set),
}))
```

### Context + Hooks Pattern

```typescript
// MusicRuntimeContext.ts    — createContext with runtime services
// MusicRuntimeProvider.tsx  — provider wrapping the app
// useMusicRuntimeContext.tsx — `useContext` consumer hook
```

## Component Pattern

```typescript
'use no memo' // React Compiler opt-out when needed

import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMusicAppStore } from '@/stores/useMusicAppStore'

interface TrackRowsProps {
  activeTrackId: string | undefined
  onPlay: (trackId: string) => void
  tracks: Track[]
  virtualItems: VirtualItem[]
}

export function TrackTable() {
  // 1. Hooks at top
  const { activeTrackId } = useMusicAppStore(useShallow(...))

  // 2. Early return for edge cases
  if (!tracks.length) return <EmptyState />

  // 3. Main render
  return <MainLayout />
}

// 4. Sub-components co-located in same file
function CompactTrackRows({ ... }: TrackRowsProps) { ... }
```

**Rules**:
- `export function` (named exports only — no `default`)
- Props via `interface {Name}Props` (PascalCase + "Props" suffix)
- `'use no memo'` when React Compiler can't optimize (imperative APIs)
- Zustand `useShallow` for multi-field selector optimization
- Tailwind classes inline (no CSS modules / styled-components)
- `cn()` for conditional class merging

## Naming Conventions

| Type       | Convention       | Examples                             |
|----------- |----------------- |------------------------------------- |
| Components | PascalCase       | `TrackTable`, `PlayerBar`           |
| Hooks      | camelCase + use  | `useMusicAppStore`, `useFilteredTracks` |
| Stores     | camelCase + use  | `useMusicAppStore`                   |
| Classes    | PascalCase       | `FfmpegManager`, `SerialPriorityTaskQueue` |
| Interfaces | PascalCase+Props | `TrackRowsProps`, `FfmpegManagerOptions` |
| Types      | PascalCase       | `Track`, `MusicAppStore`             |
| Utils      | camelCase        | `utils.ts`, `music-player.ts`       |
| Workers    | kebab-case       | `audio-decode.worker.ts`            |
| Directories| kebab-case       | `music-app`, `AppContext`           |

**Import alias**: `@/` → `src/`

## Code Standards

1. TypeScript strict mode — all configs enforce it
2. ESLint with React rules — `eslint.config.ts`
3. React Compiler via `babel-plugin-react-compiler` — `'use no memo'` for escape hatches
4. Named exports only — no `export default` anywhere
5. Zustand split pattern — state / actions / selectors in separate files
6. Heavy work in Web Workers — FFmpeg, metadata extraction, audio decoding
7. `cn()` for class merging — `clsx` + `tailwind-merge` (see `src/lib/utils.ts`)
8. `class-variance-authority` for variant-based UI components
9. Bun as package manager — `bunfig.toml`, `bun.lock`
10. Prefer `interface` over `type` for object shapes

## Security

| Requirement              | Implementation                                 |
|------------------------- |----------------------------------------------- |
| Sandboxed audio processing | FFmpeg.wasm runs in WASM sandbox             |
| Isolated heavy compute   | Web Workers (no DOM access)                    |
| User-controlled file access | File System Access API (user must pick dir)  |
| Dependency integrity      | Bun lockfile (bun.lock)                       |
| Transport security        | HTTPS in production (Vite dev certs provided)  |
| No server attack surface  | Client-only app — no backend to exploit       |

## 📂 Codebase References

| File / Directory                     | What It Shows                              |
|------------------------------------- |------------------------------------------- |
| `src/stores/useMusicAppStore.ts`      | Zustand store creation + type exports      |
| `src/stores/music-app/`              | Split state/actions/selectors pattern      |
| `src/components/features/music/TrackTable.tsx` | Component + sub-components + virtualizer |
| `src/context/AppContext/`            | Context + Provider + consumer hook pattern  |
| `src/workers/shared/ffmpeg.manager.ts` | Class-based worker service + task queue  |
| `src/lib/utils.ts`                   | `cn()` utility + FFmpeg WASM loader        |
| `src/types/`                         | Shared TypeScript type definitions          |
| `package.json`                       | Full dependency list                        |
| `tsconfig.json`                      | TypeScript configuration                    |
| `eslint.config.ts`                   | ESLint rules                                |
| `vite.config.ts`                     | Vite + Tailwind plugin configuration        |

## Related Files

- `business-domain.md` — Why this music player exists
- `business-tech-bridge.md` — Business needs → technical mapping
- `decisions-log.md` — Key architectural decisions
