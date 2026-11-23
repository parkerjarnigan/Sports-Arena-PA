# Firestore Security Specification (Phase 0)

## Data Invariants
1. **Board Isolation & Schema Integrity**: Every document in `/categories/{categoryId}` and `/sounds/{soundId}` must belong to `boardId == 'default'` and pass strict type, length, pattern, and key-allowlist validation (`isValidCategory`, `isValidSound`).
2. **Path Variable Hardening**: Document IDs (`categoryId`, `soundId`) must match `^[a-zA-Z0-9_\-]+$` and stay within 64 characters.
3. **Strict Key Allowlists**: Both `create` and `update` reject any shadow/unknown fields (`keys().hasAll(...) && keys().hasOnly(...)`).
4. **Action-Based Updates**:
   - Reorder updates on `/sounds/{soundId}` only permit modifying `order`, `categoryId`, and `updatedAt`.
   - Full property updates on `/sounds/{soundId}` permit updating sound metadata within strict size/enum/regex bounds.
   - Category updates permit modifying `name`, `order`, and `updatedAt`.
5. **Default-Deny Catch-All**: Any collection not explicitly matched is denied (`match /{document=**} { allow read, write: if false; }`).
6. **Public Link Operability**: Per application requirements, anyone with the public link may read the board (`boardId == 'default'`) and reorder tiles without signing into Firebase Auth, while schema validation prevents arbitrary data injection, oversized strings, or shadow fields.

## Dirty Dozen Adversarial Payloads
1. Shadow field injection on SoundPad (`{ ..., isAdmin: true }`) -> DENIED
2. Oversized `title` (> 60 chars) -> DENIED
3. Invalid `color` format (`"red"` instead of `"#DC2626"`) -> DENIED
4. Invalid `playbackMode` (`"loop_forever"` instead of `"retrigger"` | `"toggle"` | `"gate"`) -> DENIED
5. Path ID poisoning (`/sounds/../../admin`) -> DENIED
6. Oversized `audioUrl` (> 2048 chars) -> DENIED
7. Missing required field (`categoryId` omitted) -> DENIED
8. Negative/non-numeric `order` (`order: "first"`) -> DENIED
9. Wrong `boardId` (`boardId: "other"`) -> DENIED
10. Oversized category `name` (> 40 chars) -> DENIED
11. Unmatched collection write (`/users/attacker`) -> DENIED
12. Mutating `id` field on update (`incoming().id != existing().id`) -> DENIED
