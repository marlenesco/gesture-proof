# ADR 0001 - Local-first browser stack

Status: accepted.

## Context

Project needs direct camera, media, canvas, and hand-landmark access with low
friction. Final concept is unknown, so early architecture must favor experiments
and transparent signal inspection.

## Decision

Use strict TypeScript with Vite and pnpm. Use MediaPipe Tasks Vision behind a
project-owned adapter. Start rendering with Canvas 2D. Keep runtime processing
local and avoid a backend.

Do not introduce a UI framework until application navigation or shared state
proves direct DOM composition insufficient. Do not introduce WebGL/WebGPU until a
measured experiment requires it.

## Consequences

- simple, inspectable runtime and small initial dependency surface
- direct control over frame loops and object lifecycles
- UI composition requires more deliberate internal conventions
- advanced GPU effects may later add a renderer without replacing gesture logic
- cloud AI features require a separate decision and privacy review
