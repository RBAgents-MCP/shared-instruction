---
name: roblox-game-systems-data-store-management
description: DataStore access goes through one manager that retries, caches, and session-locks — never call DataStoreService directly from a game script.
version: 1.0.0
author: RBZagan
---

# Data Store Management

Applies to every Roblox repository in this workspace that persists player data.

## One manager owns the service

No game script calls `DataStoreService`, `GetDataStore`, `GetAsync`,
`SetAsync`, `UpdateAsync`, or `RemoveAsync` directly. All of them go through the
`DataStoreManager`.

* A direct call is a bypass of session locking and of the retry wrapper, and it
  is invisible in review because it looks like ordinary service usage.
* The manager is the only place that knows key naming, so a data key is never
  spelled out in a gameplay script.
* `game:Shutdown()` must call the manager's flush, or unsaved progress is lost
  on every server close.

## Retry every call

DataStore calls fail for reasons outside the game's control — throttling,
outage, network. A call that is not retried loses data that was real.

* Wrap every call in a retry with bounded attempts and a backoff between them.
* Re-throw after the last attempt rather than swallowing it, so the caller can
  decide what an unwritable value means.
* Log each failure with the key and the attempt count. An unlogged failure is
  an invisible one.
* Never retry a `SetAsync` inside a loop of unbounded length; a retry storm is
  itself a throttle.

## Cache the value in memory

A read on every request is a read on every request, against a service that
throttles.

* Load once per player at join, hold the value in memory, and treat that as the
  source of truth for the session.
* Every write updates the cache first, then persists. A cache that is updated
  after a successful write lags the truth it is meant to hold.
* A cache miss that is not a load is a bug, not a slow path. Do not fall back
  to reading the DataStore from a hot code path.

## Session lock, always

Two servers writing one key is how a profile is lost. Every player session takes
a lock and holds it until the player leaves.

* Acquire the session lock at join, before loading the profile. A profile read
  without its lock is a read that another server may be overwriting.
* Use the lock's value — not the player's `UserId` alone — as the identity the
  lock is checked against, so a stale lock can be detected and reported.
* Release the lock on leave, and release it on `game:Shutdown()` after the final
  flush.
* A lock that cannot be acquired is a reason to decline the join gracefully. It
  is never a reason to proceed unlocked.

## Related

* [`../security/zero-trust-networking.md`](../security/zero-trust-networking.md) —
  the server is the only writer this manager assumes to have.
* [`../conventions/naming-conventions.md`](../conventions/naming-conventions.md) —
  the shape of `DataStoreManager` and its constants.
