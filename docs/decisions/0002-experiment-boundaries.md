# ADR 0002 — Experiments as bounded studies

Status: accepted.

## Context

Open-ended creative coding easily becomes a pile of unrelated demos. Portfolio
quality requires a coherent thesis and evidence of decisions.

## Decision

Every experiment gets one brief, one falsifiable question, deterministic
fixtures where possible, explicit exit criteria, and a result log. Shared code
enters `src/engine` only after two consumers or a clear architectural invariant
justify it.

## Consequences

- discarded ideas remain useful evidence rather than hidden work
- experiments can stay small and comparable
- premature abstraction is discouraged
- documentation work is part of experiment completion
