# Snappin implementation TODO — Casino photo quest integration

This document defines the Snappin-side work required to support photo-completable quests in Party Casino.

The casino-side implementation is intentionally isolated behind a small Snappin client. Snappin remains responsible for the camera experience, guest upload session, photo validation and photo storage. The casino remains responsible for player identity, quest eligibility and quest completion.

## 1. Configuration and service authentication

- [ ] Add a dedicated integration credential for the casino (do not reuse a user session or admin password).
- [ ] Store the credential hashed or in the existing secure secret store; support rotation/revocation.
- [ ] Scope the credential to one configured Snappin event.
- [ ] Require `Authorization: Bearer <integration-key>` on the integration endpoints.
- [ ] Rate-limit session creation and status lookups.
- [ ] Keep all integration credentials server-side. Never place the integration key in the camera URL or browser JavaScript.

Casino environment variables:

```env
SNAPPIN_API_URL=https://<snappin-host>
SNAPPIN_API_KEY=<server-to-server-key>
SNAPPIN_EVENT_ID=<existing-snappin-event-id>
```

## 2. Associate the casino with an existing Snappin event

- [ ] Reuse the existing Snappin event model and event-management UI.
- [ ] Add an integration mapping or event metadata for the external source and external event ID.
- [ ] Ensure the casino credential can access only the configured event.
- [ ] Do not create a parallel event/gallery model just for the casino.

## 3. Guest camera sessions

Implement:

`POST /api/integrations/sessions`

Authentication: Bearer integration key.

Request:

```json
{
  "eventId": "snappin-event-id",
  "externalReference": "party-casino:quest:123:player:45:unique-id",
  "guest": {
    "externalId": "party-casino-player-45",
    "displayName": "Player 1"
  },
  "expiresInSeconds": 300
}
```

Response:

```json
{
  "sessionId": "session-uuid",
  "cameraUrl": "https://snappin.example.com/camera/session/<opaque-token>",
  "status": "PENDING",
  "expiresAt": "2026-11-20T23:30:00.000Z"
}
```

Requirements:

- [ ] Create a guest session without requiring Snappin account registration/login.
- [ ] Reuse the current Snappin camera and upload UI.
- [ ] Make the camera URL contain a high-entropy, unguessable, short-lived session token.
- [ ] Store only a hash of the opaque token if compatible with the current auth/session architecture.
- [ ] Bind the session to exactly one event and one external reference.
- [ ] Enforce expiry server-side, not only in the frontend.
- [ ] Return an HTTPS camera URL in production.
- [ ] Do not allow a session to upload multiple photos unless that is explicitly supported by the event configuration.

## 4. Session status and photo metadata

Implement:

`GET /api/integrations/sessions/:sessionId`

Authentication: Bearer integration key.

For a pending session, return:

```json
{
  "sessionId": "session-uuid",
  "eventId": "snappin-event-id",
  "externalReference": "party-casino:quest:123:player:45:unique-id",
  "status": "PENDING",
  "photo": null,
  "expiresAt": "2026-11-20T23:30:00.000Z"
}
```

After a successful upload, return:

```json
{
  "sessionId": "session-uuid",
  "eventId": "snappin-event-id",
  "externalReference": "party-casino:quest:123:player:45:unique-id",
  "status": "UPLOADED",
  "photo": {
    "id": "photo-uuid",
    "uploadedAt": "2026-11-20T23:25:00.000Z",
    "mimeType": "image/jpeg"
  },
  "expiresAt": "2026-11-20T23:30:00.000Z"
}
```

Requirements:

- [ ] Return `UPLOADED` only after the photo is fully persisted and associated with the session/event.
- [ ] Return the stable photo ID and upload timestamp.
- [ ] Do not return internal storage paths or public unrestricted storage URLs.
- [ ] Ensure the session ID belongs to the event authorized by the integration key.
- [ ] Keep status transitions monotonic: PENDING -> UPLOADED or EXPIRED/CANCELLED.

## 5. Photo upload and storage

- [ ] Reuse Snappin's existing image upload/storage pipeline.
- [ ] Validate actual image content, MIME type and configured maximum file size.
- [ ] Associate the stored photo with the guest session and event.
- [ ] Ensure the uploaded photo cannot be reassigned to another session.
- [ ] Preserve existing Snappin gallery behavior for normal event users.
- [ ] Make photo retrieval subject to event/integration authorization.

The casino stores only the Snappin photo ID and verification metadata; Snappin remains the source of truth for the photo binary.

## 6. Polling-based completion verification (initial implementation)

The initial deployment must use polling, not webhooks. The casino currently runs on localhost, while Snappin is publicly hosted over HTTPS. A webhook from Snappin cannot reach the casino's `localhost`: that address would refer to the Snappin server itself.

The casino backend initiates outbound HTTPS requests to Snappin, which works from localhost and does not require a tunnel, public casino URL or inbound firewall rule.

- [ ] After creating a guest session, the casino frontend opens the returned `cameraUrl` in a new browser tab.
- [ ] The casino frontend polls its own casino-backend status endpoint every 2–3 seconds while the player completes the upload.
- [ ] The casino backend calls Snappin's `GET /api/integrations/sessions/:sessionId` endpoint using the server-side integration key.
- [ ] The casino backend validates that the returned `eventId` and `externalReference` match the stored casino session before accepting the result.
- [ ] The casino marks the matching active photo quest completed only when Snappin reports `UPLOADED` and provides a stable photo ID.
- [ ] Stop polling when the quest is completed, the session expires/is cancelled, or a terminal error occurs.
- [ ] Use a sensible overall timeout and backoff for temporary network errors; do not mark a quest complete based only on the browser redirect or a client-side message.
- [ ] Make status checks idempotent so repeated polls cannot complete or reward the same quest more than once.

### Optional future webhook support

Webhooks are not required for the localhost phase. Once the casino is deployed at a publicly reachable HTTPS URL, webhook notifications may be added to reduce polling latency and network requests.

If implemented later:

- [ ] Configure a callback URL and a separate webhook signing secret.
- [ ] Sign the exact UTF-8 request body bytes with HMAC-SHA256 and include a timestamp to prevent replay.
- [ ] Retry non-2xx responses with exponential backoff and include a stable delivery ID.
- [ ] Treat duplicate deliveries as normal and keep the receiver idempotent.
- [ ] Never include the integration API key or guest camera token in the webhook.
- [ ] Treat the webhook only as a notification; the casino must still fetch the session status from Snappin and validate the event/reference before completing the quest.

## 7. Operational and privacy requirements

- [ ] Log integration session creation, upload completion, webhook delivery and errors without logging secrets or camera tokens.
- [ ] Provide a way to revoke the casino integration key.
- [ ] Ensure event deletion/archival behavior is defined for active guest sessions.
- [ ] Apply the same retention/deletion policy to integration-uploaded photos as normal Snappin photos.
- [ ] Test expired, cancelled, duplicate-upload and unauthorized-session cases.

## 8. Acceptance test

1. Casino creates a photo-enabled quest and assigns it to a player.
2. Casino backend creates a Snappin guest session for the configured event.
3. Player opens the returned camera URL in a new browser tab without logging into Snappin.
4. Player takes and uploads a photo.
5. Snappin persists the photo and changes the session status to `UPLOADED`.
6. Casino polls its backend status endpoint; the casino backend reads the status from Snappin over outbound HTTPS.
7. Casino validates the event ID and external reference, then marks only the matching active quest as completed and stores the photo ID.
8. Repeated status checks do not complete or reward the quest more than once.
9. A different event, expired session or mismatched external reference cannot complete the quest.
10. A non-photo quest continues to use the existing three-digit PIN flow.

## Contract note

These routes and payloads are the agreed initial integration contract for the casino implementation. Snappin does not need to implement them yet, but its implementation should match this document or the casino client must be updated in lockstep.
