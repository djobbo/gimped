# Shared multi-lobby room registry

**Date:** 2026-08-20  
**Status:** Approved (Approach A + Effect layers)  
**Scope:** `@gimped/backend` custom-lobby create/join across TCP connections

## Goal

Multiple concurrent custom lobbies, each with its own settings and players. Host create and remote join (e.g. Tailscale) share one lobby per room id. Registry storage is swappable via Effect layers (in-memory now; Redis/DB later).

## Non-goals (v1)

- Distinct account / user ids per client  
- Join-failure UI packets  
- Host migration when host disconnects  
- Persistent rooms across process restart  

## Model

```
Room = {
  roomId: number
  lobby: LobbyState
  members: [{ connectionId, role: "host" | "joiner", guestController?: number }]
}
```

- **Host** owns the room; hero picks use host slots.  
- **Joiner** is a remote TCP client; represented as a `LobbyGuest` seat (`guestController`).  
- Local keyboard seats on a member remain normal `applyLocalGuestJoin` guests on the shared lobby.

## `RoomRegistry` service

Effect `Context.Service` with `layerMemory` (and later `layerRedis` / etc.):

| Method | Behavior |
| --- | --- |
| `create(hostConnectionId)` | Allocate next `roomId`, fresh lobby, host member |
| `join(roomId, connectionId)` | Attach joiner + guest seat, or `RoomNotFound` / `RoomFull` / `AlreadyInRoom` |
| `leave(connectionId)` | Remove member; dissolve room if empty or host left |
| `roomForConnection(connectionId)` | `Option<Room>` |
| `updateLobby(roomId, f)` | Atomic lobby update |

State lives only inside the layer implementation.

## I/O fan-out

Separate `ConnectionHub` (also Effect service): register/unregister per-connection TCP writers; `send` / `broadcast`. Registry stays pure state; stub wires hub + registry.

## Protocol mapping

| Client | Server |
| --- | --- |
| **33** create | `create` → **2445** with allocated `roomId` |
| **38** join | `join` → joiner **2449+2445**; other members fan-out **2449+2445** |
| **37** / **41** / **44** / **80** / **55** | `updateLobby` (or read lobby) scoped by connection’s room; ack sender; fan-out when others must refresh |

## Testing

- Unit: `layerMemory` create/join/leave/update, multi-room isolation  
- Reply/integration: join second “connection” sees host lobby settings/players  

## Future

Same service surface for durable backends; optional room codes; host migration; proper join errors.
