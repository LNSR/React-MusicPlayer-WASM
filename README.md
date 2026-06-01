# Music Player

A Chromium-first local music player built with Vite, React 19, Tailwind CSS,
shadcn-style components, the File System Access API, FFmpeg.wasm, and an
AudioWorklet playback engine.

The app runs entirely in the browser. Users grant read-only access to a local
folder, the library is scanned for playable files, selected tracks are decoded in
a Web Worker, and decoded PCM audio is transferred to an AudioWorklet for
real-time output.

## Features

- Read-only local folder picking with `showDirectoryPicker()` browser new API.
- Recursive library scanning for MP3, WAV, FLAC, OGG, Opus, M4A, and AAC files.
- Worker-based decoding with `@ffmpeg/ffmpeg`, `@ffmpeg/core`, and optional
  `@ffmpeg/core-mt` assets.
- Stereo 48 kHz PCM playback through an AudioWorklet.
- Album-art extraction when embedded artwork is available.
- Searchable, virtualized track lists for large folders.
- Desktop sidebar with resizable library width.
- Mobile layout with library and now-playing tabs.
- Queue controls, seeking, volume control, progress display, and auto-advance.
- Runtime capability screen for unsupported browsers or insecure contexts.

## Requirements

- Bun 1.3 or newer | Node 26 or newer.
- A Chromium-based browser for the best File System Access API support.
- HTTPS local development certificates trusted by the browser.
- A secure, cross-origin-isolated runtime for browser audio and WASM features.

Firefox and Safari do not currently provide the same folder picker support used
by this app. Check MDN's File System API compatibility table before broadening
browser support.

## Getting Started

Install dependencies:

```sh
bun install
```

Start the HTTPS dev server:

```sh
bun run dev
```

Open one of these URLs:

- `https://localhost:5173/`
- `https://127.0.0.1:5173/`

The Vite config reads `localhost.pem` and `localhost-key.pem` from the project
root. If your browser does not trust those certificates, generate and trust local
certificates with `mkcert`, then replace the two local certificate files.

## Scripts

```sh
bun run dev       # Start Vite with HTTPS and host binding.
bun run build     # Type-check with tsc, then create a production build.
bun run lint      # Run ESLint across the project.
bun run preview   # Preview the production build.
bun run doctor    # Run the React diagnostics helper.
```

## Codebase Map

```text
.
├── public/
│   └── core-mt/                       Static @ffmpeg/core-mt files for dev MT tests.
├── src/
│   ├── App.tsx                        Top-level responsive app composition.
│   ├── components/
│   │   ├── features/music/            Music-player screens and controls.
│   │   └── ui/                        Local shadcn-style primitives.
│   ├── context/AppContext/            React context for runtime commands.
│   ├── hooks/
│   │   ├── useMusicRuntime.ts         Small runtime composition hook.
│   │   └── music-runtime/             Focused browser/audio/worker hooks.
│   ├── lib/                           Shared formatting, layout, and capability helpers.
│   ├── stores/
│   │   ├── useMusicAppStore.ts        Zustand store entry point.
│   │   └── music-app/                 Store state shape, actions, and selectors.
│   ├── types/                         Shared browser, worker, track, and player types.
│   ├── workers/                       Browser Web Workers for scan/metadata/decode work.
│   └── worklets/                      AudioWorklet processor.
├── vite.config.ts                     HTTPS dev server, aliases, headers, plugins.
├── components.json                    shadcn/ui project configuration.
└── package.json                       Scripts and dependencies.
```

## Responsibility Tree

```text
App shell
├── src/App.tsx
│   ├── Owns page-level layout: desktop sidebar, main playlist area, player bar.
│   ├── Installs TooltipProvider, Toaster, and MusicRuntimeProvider.
│   └── Reads only the layout state it needs directly from Zustand.
│
├── src/context/AppContext/useMusicRuntimeContext.tsx
│   ├── Exposes runtime commands to deeply nested UI components.
│   └── Keeps playback/folder/cover commands out of prop chains.
│
└── src/hooks/useMusicRuntime.ts
    ├── Composes the runtime hooks.
    ├── Returns only app-facing commands and capability data.
    └── Does not own library state or UI rendering decisions.

Music UI
├── src/components/features/music/LibraryPanel.tsx
│   ├── Desktop library navigation, stats, and compact virtual list.
│   └── Requests cover preload for visible virtual rows.
├── src/components/features/music/MobileLibraryTabs.tsx
│   ├── Mobile library and now-playing tab views.
│   └── Reuses the same store selectors/runtime context as desktop.
├── src/components/features/music/TrackTable.tsx
│   ├── Main virtualized playlist table.
│   └── Displays format, size, duration, and active row state.
├── src/components/features/music/PlayerBar.tsx
│   ├── Bottom transport UI for desktop and mobile.
│   └── Sends play/pause/seek/volume/next/previous commands via context.
├── src/components/features/music/SearchBox.tsx
│   └── Controlled search input.
├── src/components/features/music/TrackCover.tsx
│   └── Responsive cover-art display with fallback state.
└── src/components/features/music/UnsupportedRuntime.tsx
    └── Capability failure screen for non-secure or unsupported browsers.

Runtime hooks
├── src/hooks/music-runtime/usePlatformSync.ts
│   └── Syncs viewport/touch platform data into the store.
├── src/hooks/music-runtime/useLibraryResize.ts
│   └── Handles desktop sidebar drag resizing and keyboard resizing.
├── src/hooks/music-runtime/useFolderPicker.ts
│   └── Requests File System Access permission and starts directory scanning.
├── src/hooks/music-runtime/useWorkerBridge.ts
│   └── Holds metadata/decode worker refs and typed post helpers.
├── src/hooks/music-runtime/useRuntimeWorkerServices.ts
│   ├── Wires worker bridge, cover URLs, audio runtime, and worker listeners.
│   └── Provides worker-backed services to the top-level runtime hook.
├── src/hooks/music-runtime/useLibraryWorker.ts
│   ├── Starts metadata and decode workers.
│   ├── Handles scan chunks, scan completion, cover responses, decode progress,
│   │   decoded PCM, and decode errors.
│   └── Guards against stale decode results from older track selections.
├── src/hooks/music-runtime/useAudioRuntime.ts
│   ├── Creates the AudioContext and AudioWorkletNode.
│   ├── Receives worklet position, level, buffer, error, and ended events.
│   └── Auto-advances to the next queued track.
├── src/hooks/music-runtime/usePlaybackControls.ts
│   ├── Implements load, play/pause, next, previous, seek, and volume commands.
│   └── Clears the worklet immediately when switching tracks.
├── src/hooks/music-runtime/useCoverUrls.ts
│   └── Owns object URL creation/revocation for extracted artwork.
└── src/hooks/music-runtime/useMusicSelectors.ts
    └── Small React hooks around reusable Zustand selectors.

State
├── src/stores/useMusicAppStore.ts
│   └── Creates and exports the single Zustand store.
└── src/stores/music-app/
    ├── state.ts
    │   └── State shape, action interfaces, and initial state.
    ├── actions.ts
    │   └── Library, player, layout, and UI mutations.
    └── selectors.ts
        └── Static selectors for active track, filtered tracks, queue, progress,
            and layout mode.

Background processing
├── src/workers/metadata.worker.ts
│   ├── Recursively scans the chosen directory.
│   ├── Emits track chunks so large libraries do not wait for one giant result.
│   ├── Keeps file handles in memory for the current session.
│   └── Extracts embedded cover art with FFmpeg.wasm.
├── src/workers/audio-decode.worker.ts
│   ├── Decodes selected tracks with FFmpeg.wasm.
│   ├── Converts audio to stereo 48 kHz float PCM.
│   └── Transfers decoded channel buffers back to the main thread.
└── src/worklets/player-worklet.ts
    ├── Runs on the Web Audio render thread.
    ├── Renders PCM samples, volume, seeking, pause/play, and clearing.
    └── Posts position, levels, buffer status, and ended events.

Shared contracts
├── src/types/audio.ts
│   └── Track, player state, worker request/response, and worklet messages.
├── src/types/file-system-access.d.ts
│   └── File System Access API declarations.
├── src/lib/music-player.ts
│   └── Capability checks, layout constants, formatting, and track filtering.
└── src/lib/utils.ts
    └── Shared UI utility helpers.
```

## Runtime Boundaries

```text
User gesture
  ↓
useFolderPicker()
  ↓ posts scanDirectory
metadata.worker.ts
  ↓ emits scanChunk / scanComplete / coverLoaded
useLibraryWorker()
  ↓ updates Zustand and cover object URLs
UI components
```

```text
User selects or skips track
  ↓
usePlaybackControls()
  ↓ clears AudioWorklet immediately and posts loadTrack
audio-decode.worker.ts
  ↓ decodes selected track to stereo float PCM
useLibraryWorker()
  ↓ ignores stale decode results if another track is current
player-worklet.ts
  ↓ renders audio and sends progress/level/ended messages
useAudioRuntime()
  ↓ updates Zustand and auto-advances queue
```

The app intentionally separates metadata work from decode work. Folder scanning
and cover extraction happen in `metadata.worker.ts`; selected-track decoding
happens in `audio-decode.worker.ts`. This keeps cover preloading from owning the
same worker lifecycle as playback decode.

## Runtime Flow

1. `useMusicRuntime()` wires together platform sync, resizing, workers, folder
   picking, audio setup, and playback controls.
2. The user selects a folder. `useFolderPicker()` requests read permission and
   posts the directory handle to `metadata.worker.ts`.
3. `metadata.worker.ts` recursively scans the directory, keeps file handles in
   memory, and emits track chunks plus scan counts.
4. Zustand stores tracks, summary, queue, player, layout, and UI state.
5. Visible rows request cover art through `preloadTrackCovers()`, which posts to
   `metadata.worker.ts`.
6. When a track is selected, `usePlaybackControls()` clears the worklet, marks
   the selected track as loading, and posts the full track object to
   `audio-decode.worker.ts`.
7. `audio-decode.worker.ts` decodes the selected file to stereo `pcm_f32le` at
   48 kHz and transfers the channel buffers back to the main thread.
8. `useLibraryWorker()` checks that the decoded result still matches the current
   track, sends PCM to `player-worklet.ts`, updates track metadata, and starts
   playback when autoplay is pending.
9. `player-worklet.ts` owns sample rendering, position updates, peak levels,
   seek, pause, play, clear, and volume changes.

## Browser Runtime Headers

The Vite dev server and preview server send these headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

They are configured in `vite.config.ts` and help keep the app in the
cross-origin-isolated runtime expected by the audio and WASM pipeline.

## Local Data Model

The app does not upload music files. Folder access is granted by the browser for
the current session, and track/file handles are kept in memory. Rescanning or
reloading the app resets the library state.

Track objects include:

- Stable ID derived from relative path, file size, and modification time.
- Display name and relative path.
- File size, last modified timestamp, and detected format.
- Optional decoded duration, sample rate, channel count, and cover URL.

## Troubleshooting

If the unsupported-runtime screen appears, check that the page is loaded over
HTTPS, the browser is Chromium-based, `window.crossOriginIsolated` is true, and
the File System Access API is available.

If folder picking fails, confirm that the browser has permission to read the
folder and that the app is opened from `https://localhost:5173/` or
`https://127.0.0.1:5173/`.

If playback fails on the first track, open the browser console for FFmpeg.wasm or
AudioWorklet errors. Very large source files can take noticeable time to decode
because the current pipeline decodes the selected track into memory before
playback.

## Gotchas And Limits

This player is intentionally client-side and browser-native, which keeps files
local but exposes a few real limits.

### Large Libraries Can Choke The App

Folders in the multi-GB range can make the UI or playback feel uneven. The app
virtualizes rows, emits scan chunks, and separates metadata work from decode
work, but the browser still has to:

- Traverse every directory entry granted by File System Access.
- Create and store `Track` metadata for every supported file.
- Filter/search the in-memory track list.
- Patch tracks as durations and covers are discovered.
- Decode selected files into large PCM buffers.

Virtualized lists reduce DOM work, not data processing or decode memory.

### Playback Uses Full-Track PCM Decode

The current decode path converts the selected track into stereo 48 kHz
`Float32Array` PCM before handing it to the AudioWorklet. That is simple and
reliable, but memory-heavy:

```text
48,000 samples/sec * 2 channels * 4 bytes = about 384 KB/sec
about 23 MB/minute of decoded PCM
```

A long track can become hundreds of MB after decode. Transferable buffers avoid
copying where possible, but transferring and retaining large buffers can still
cause memory pressure or brief scheduling stalls.

### FFmpeg.wasm Work Is Heavy And Not Truly Cancellable

`ffmpeg.exec()` is CPU-heavy and does not behave like a fine-grained cancellable
stream. The app ignores stale decode results when the user switches tracks, but
an already-running FFmpeg command may still burn CPU until it returns.

Symptoms:

- Switching tracks during a large decode may feel delayed.
- Cover extraction can compete with metadata work.
- The browser may throttle or pause work under memory or CPU pressure.

The current mitigation is separate metadata/decode workers plus stale-result
guards. A deeper fix would use chunked streaming decode or a SharedArrayBuffer
ring buffer instead of full-track PCM.

### Browser Support Is Chromium-First

The app depends on browser APIs that are uneven across engines:

- `showDirectoryPicker()` is Chromium-first.
- `AudioWorklet` requires a secure context.
- `SharedArrayBuffer` requires cross-origin isolation.
- FFmpeg.wasm multithreading requires `SharedArrayBuffer`.

Firefox and Safari may fail at folder picking or multithreaded WASM support even
if basic Web Audio works.

### Cross-Origin Isolation Can Break Easily

The app expects these headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

If any production host, proxy, CDN, service worker, external script, or asset
violates the isolation model, `window.crossOriginIsolated` can become `false`.
That disables `SharedArrayBuffer` and prevents multithreaded FFmpeg.wasm.

### Folder Handles Are Session-Only

The app does not persist folder handles in IndexedDB. Reloading the page or
opening a new tab requires selecting the folder again. This keeps v1 simpler and
avoids long-lived local file permissions.

### Cover Art Is Best Effort

Embedded artwork is extracted with FFmpeg.wasm when available. Missing, unusual,
or very large artwork is skipped. Cover URLs are object URLs and are revoked when
the library is reset or workers are cleaned up.

### Dev And Production FFmpeg Cores Can Differ

Development load singlethreaded `@ffmpeg/core` to avoid module issues in Vite's dev server,
while production uses `@ffmpeg/core-mt` URLs when cross-origin isolation
is available. If dev and production behave differently

## Quality Checks

Run these before shipping changes:

```sh
bun run lint
bun run build
```
