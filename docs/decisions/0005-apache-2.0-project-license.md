# ADR 0005 — Apache License 2.0 project license

Status: accepted.

## Context

The repository could not be described or distributed as open source until a
project license was selected. The license must permit use, modification, and
distribution while preserving attribution and providing an explicit patent
grant.

## Decision

License original project source code and documentation under the Apache License,
Version 2.0. Keep the complete license text in the repository root as `LICENSE`
and declare the SPDX identifier `Apache-2.0` in package metadata.

Third-party dependencies, models, and referenced projects remain governed by
their own licenses. Publication and deployment still require explicit approval
and completion of the remaining Phase 5 checks.

## Consequences

- the repository may be described as Apache-2.0 licensed
- recipients may use, modify, and redistribute the project under its terms
- contributors grant the copyright and patent rights described by the license
- redistributed copies and derivatives must satisfy the license conditions
- project licensing does not authorize redistribution of excluded model files or
  override third-party terms
