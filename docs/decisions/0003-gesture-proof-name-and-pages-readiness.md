# ADR 0003 — Gesture Proof name and Pages-ready paths

Status: accepted.

License publication blocker resolved by ADR 0005.

## Context

The temporary Gesture Showcase Lab name no longer matches the experiment thesis.
The static multi-page build must also work from a GitHub project subpath without
weakening the on-device privacy boundary.

## Decision

Use **Gesture Proof** as product name and **Private, on-device motion
experiments.** as public tagline.

Keep runtime processing inside browser. Static application files, MediaPipe WASM,
and hand model may be served over HTTPS from same origin; frames, landmarks,
gesture evidence, and telemetry remain on-device.

Read deployment base from `VITE_BASE_PATH`, defaulting to `/` for local and
custom-domain builds. Navigation and model loading must use Vite base path.

Provide a manual-only GitHub Pages workflow. It downloads official model during
build because generated model remains excluded from Git. Triggering workflow is
a deployment and still requires separate explicit authorization.

## Consequences

- local development remains rooted at `/`
- project Pages builds work under `/<repository>/`
- custom domains can build with `/`
- first visit downloads application, WASM, and model; local-first does not mean
  offline-first
- repository still cannot be published until project license is selected
