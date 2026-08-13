# ADR 0004 - Research Spine collection and experiment records

Status: accepted.

## Context

Three independently linkable studies now form a meaningful research sequence,
but the surrounding interface presents them mostly as conventional page links.
Each experiment also ends with the same three-column findings pattern. That
pattern obscures failures, measurements, unresolved evidence, and the decision
required by the experiment protocol.

The collection must grow toward 10–20 studies without becoming a dashboard or
reducing the dominant visual workspace.

## Decision

Treat Gesture Proof as a curated, chronological collection connected by a
**Research Spine**.

- Group the homepage index by research phase, with numbered studies and explicit
  status or decision.
- Keep collection navigation behind a compact header control. The control opens
  a temporary, scrollable experiment index over the workspace and closes with
  Escape, its close action, or backdrop interaction. The active study remains
  explicit inside the index without permanently occupying canvas width.
- Keep every experiment workspace nearly full-screen and preserve its existing
  gesture interaction.
- Connect workspace and supporting content with an explicit record handoff.
- Structure records around question, hypothesis, observations, failures,
  measurements, unresolved evidence, and keep/revise/discard decision.
- Allow records to vary in length and evidence type. Do not force equal cards or
  an identical number of findings.
- Keep the dark instrument workspace and use a warm, editorial evidence ledger
  for the record. Status is distinct from route availability.
- Use motion only to communicate current position, selection, or transition, and
  remove it under `prefers-reduced-motion`.

## Consequences

- Gesture interaction remains the protagonist while project identity and study
  progression remain one action away.
- The index can add phases and numbered rows without changing into a card grid.
- Every new experiment must add one collection-index entry and a protocol-shaped
  record.
- Shared collection markup and CSS now form part of the experience layer.
- Records may become long, but evidence hierarchy is more credible than a fixed
  marketing summary.
- If the collection grows beyond roughly 20 studies, search or filtering may be
  reconsidered without replacing the chronological spine.
