---
description: Describe when these instructions should be loaded by the agent based on task context
# applyTo: 'Describe when these instructions should be loaded by the agent based on task context' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

# Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes

## Purpose

These instructions tell the agent when to load project-specific guidance and the coding rules to follow while authoring or reviewing code in this repository.

## When to load

- Load when operating on files inside this repository

## Coding rules (high level)

- **Runtime**: Use `bun` as the default runtime/tooling for installs, scripts and dev tasks (for example, `bun install`, `bun run dev`).
- **React version**: Target the latest React 19 APIs. Do not use deprecated or removed React APIs — prefer current public APIs and hooks.
- **React Compiler enabled**: Assume React Compiler is enabled and prefer patterns that are compatible with it. Avoid patterns that Compiler already cover.
- **Decomposition**: Favor small, focused hooks. Don't do heavy decomposition that makes IDE static analysis and navigation difficult.
- **Early returns**: Favor guard-clause style for early-return checks. Keep functions shallow by returning early for invalid inputs or edge-cases.
- **Modules**: Prefer ES module syntax (`import` / `export`) and ESM package style instead of factory/UMD/factory-soup patterns.
- **useEffect discipline**: Always think critically before using `useEffect` — verify if the effect is appropriate, whether dependencies are correct, and whether a simpler pattern (memoization, derived state, event handlers, or subscription hooks) fits instead.
- **Web Workers**: Favor OOP patterns for Web Worker code, with clear lifecycle methods and minimal shared state. Avoid complex hooks or React-specific patterns in worker code.
- **Explicit Resource Management**: use JS new features [Resource Management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management)

## Practical guidance

- For new projects, scaffold with Bun and ESM entry points (no CommonJS shims).
- When upgrading or adding code for React components, consult the React 19 docs for recommended patterns and avoid deprecated lifecycle, legacy context, or unsafe APIs.
- Write concise components: start with input validation as guard clauses, then the main happy-path. Example:

```tsx
function MyComponent(props: Props) {
  if (!props.items || props.items.length === 0) return null; // guard clause

  // main rendering path
  return <div>{/* ... */}</div>;
}
```

- When you consider `useEffect`, ask:
  - Is this side-effect truly necessary here?
  - Can it be expressed without an effect (derived state, event handler, memo)?
  - Are the dependency arrays correct and minimal?
  - Would a custom hook with clear lifecycle be more appropriate?

## Linting / checks

- Prefer ESM-friendly tooling and ensure lint rules enforce no-deprecated-React-APIs and encourage guard-clause returns.
- Use React Doctor for regular health checks and to catch regressions in lint, accessibility, performance, and architecture.

## Notes for the agent

- Apply these rules conservatively: if the repository explicitly documents a different constraint, follow repository docs.
- Ask clarifying questions if a required rule conflicts with an explicit project decision.
