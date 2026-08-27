# Vendored `salah` 0.7.6 — one-word patch

Upstream: https://github.com/insha/salah · MIT (see `LICENSE`, copyright Farhan Ahmed).

## Why this is vendored

`Parameters` exposes a public `high_latitude_rule` field, and `Configuration` has a
`high_latitude_rule(..)` builder — but `HighLatitudeRule` itself lives in the private
`models` module and is re-exported by neither `salah::*` nor `salah::prelude::*`. The
field is public; its type is unnameable. So a downstream crate cannot set it at all.

That blocks Claude.md §4.1, which requires the high-latitude rule to be a user setting:
"Middle of the Night · One Seventh · Angle Based · None".

`master` has the same problem, so pinning a git revision does not help.

## The patch

```diff
-mod models;
+pub mod models;
```

That is the whole change. No algorithm, no behaviour, no API surface beyond making an
already-public field's type nameable. Everything else is upstream 0.7.6 verbatim.

## What still is not available

§4.1's fourth high-latitude option, **None**, does not exist upstream in any form —
`salah` always applies one of its three rules and offers no bypass. Three of the four are
exposed; see `src/prayer/method.rs`.

## Removing this

If upstream re-exports the enum, delete `src-tauri/vendor/` and point the `salah`
dependency in `src-tauri/Cargo.toml` back at crates.io. Nothing else references the
vendored path.
