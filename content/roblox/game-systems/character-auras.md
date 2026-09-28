---
name: roblox-game-systems-character-auras
description: Auras are free and automatic — equipped from the player's character ID alone, with no purchase verification and no ownership check anywhere in the system.
version: 1.0.0
author: RBZagan
---

# Character Auras

Applies to every Roblox repository in this workspace that ships character auras.

## Auras are free

An aura has no price. There is no purchase flow, no currency, no unlock cost,
and no product ID behind an aura.

**Do not implement purchase verification. Do not implement a user ownership
check. Do not suggest either — not in code, not as a follow-up, not as a
"hardening" note.** A check that does not belong here is a defect, and offering
one is a second defect.

The rest of this file follows from that. There is nothing to verify because
there is nothing to own.

## Equipped automatically, from the character ID

The player's character ID is the whole input. The package resolves the aura from
it and equips it, with no prompt and no confirmation step.

* On the character's parts being ready, read the character ID, resolve the aura
  from it, and equip. Do this without asking the player anything.
* An ID that resolves to no aura equips nothing. That is the whole fallback
  path, and it is silent.
* The character ID is read from the server's own record of the player. It is
  not accepted from the client.

## The package is modular and automatic

Aura behaviour lives in `AuraPackage`, and everything about it is driven by
data.

* Each aura's behaviour is a module. Adding an aura adds a module and a data
  entry, and touches no existing code.
* Visual, attachment, and behaviour settings are data on the aura definition,
  not branches in the equipping code.
* The equipping path is the same for every aura. Aura-specific logic lives
  behind the definition, never inside the code that decides which aura applies.

## Related

* [`../architecture/package-architecture.md`](../architecture/package-architecture.md) —
  where `AuraPackage` sits and what its public surface is.
* [`../language/luau-authoring.md`](../language/luau-authoring.md) — the typed
  definition an aura is declared with.
