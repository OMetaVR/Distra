# Remote Commands protocol (v1)

The Remote Commands plugin adds slash commands to Discord that are defined and run by an
external backend. The plugin holds no command logic: it shows what a backend describes,
sends the user's input back, and acts on the reply. Anything that speaks this protocol
over HTTP can be a backend.

## Connecting

A backend is configured in the plugin with a **base URL** and a **token**, e.g.
`http://mesbot.lan` and a random string. Every request:

- goes to `<base URL>/rc/v1/<endpoint>`,
- carries `Authorization: Bearer <token>`,
- sends and receives JSON (`Content-Type: application/json`).

A backend answers a wrong or missing token with `401`. Any non-2xx reply should have a
body of `{"error": "<message for the user>"}`; the plugin shows that message only to the
user.

Backends that may be called from a browser-based client (Distra Desktop) should allow CORS
for `Authorization` and `Content-Type` headers.

## `GET /rc/v1/manifest`

Describes the backend and its commands. The plugin loads it at startup and when the user
reloads the backend.

```json
{
  "protocol": 1,
  "name": "Mesbot",
  "revision": "3f2a9c",
  "sections": [
    { "id": "files", "title": "mmeta.cloud" }
  ],
  "commands": [
    {
      "name": "share",
      "description": "Send one of your live mmeta.cloud links",
      "section": "files",
      "options": [
        {
          "name": "link",
          "description": "Which share to send",
          "type": 3,
          "required": true,
          "autocomplete": true
        }
      ]
    }
  ]
}
```

- `protocol`: always `1` for this version. The plugin refuses manifests with a higher major version.
- `name`: the backend's display name.
- `revision`: optional. Any string that changes whenever the manifest changes.
- `sections`: optional, in display order. Each becomes its own header in the slash picker,
  labelled with the backend and section names ("Mesbot · PC"), above the sections of
  client plugins. Commands without a `section`, or with an unknown one, go under a header
  named after the backend.
- `commands`: Discord's application command shape, restricted to chat-input commands:
  - `name`: 1-32 characters, lowercase letters, digits, `-` and `_`.
  - `description`: up to 100 characters.
  - `options`: optional. Each has `name`, `description`, `type`, and optionally `required`,
    `choices` (fixed `[{ "name", "value" }]`), `autocomplete`, `min_value`, `max_value`,
    `min_length`, `max_length`. Types: `3` string, `4` integer, `5` boolean, `6` user,
    `7` channel, `8` role, `10` number. Required options come before optional ones.
  - Subcommands: options of type `1`, each with its own `name`, `description` and
    `options`, as in Discord. A command with subcommands has no other options. Clients
    may show each subcommand as its own entry (`/share send`). Subcommand groups (type `2`)
    are not supported.

## `POST /rc/v1/choices`

Asked for an option with `"autocomplete": true`, for the list the user picks from.

```json
{
  "command": "share",
  "subcommand": "send",
  "option": "link",
  "query": "dish",
  "options": { "link": "dish" },
  "context": { "channelId": "123", "guildId": null, "userId": "456" }
}
```

- `subcommand`: present when the option belongs to a subcommand.
- `query`: what the user has typed into this option so far (may be empty).
- `options`: every option filled in so far, by name.

Reply with at most 25 choices:

```json
{ "choices": [ { "name": "Dishonored clip · video · 48 MB · 2d left", "value": "9Prhqe" } ] }
```

`name` is what the user sees (up to 100 characters); `value` is what comes back in
`/execute`. A plugin that can't ask on every keystroke may call this once with an empty
`query` and filter the list itself.

## `POST /rc/v1/execute`

Sent when the user runs a command.

```json
{
  "command": "share",
  "subcommand": "send",
  "options": { "link": "9Prhqe" },
  "context": {
    "channelId": "123",
    "guildId": "789",
    "userId": "456",
    "reply": {
      "messageId": "111",
      "channelId": "123",
      "content": "look at this",
      "author": { "id": "222", "username": "someone", "globalName": "Someone" },
      "attachments": [{ "url": "https://cdn.discordapp.com/…/clip.mp4", "filename": "clip.mp4", "contentType": "video/mp4", "size": 4810000 }]
    }
  }
}
```

- `context.guildId` is `null` in DMs.
- `context.reply` is the message the user was replying to when they ran the command, or
  `null`. It lets commands act on a message: save its attachment, react to it, answer it.

Reply with one result:

| `type` | Fields | What the plugin does |
| --- | --- | --- |
| `message` | `content` | Sends it to the channel as the user. |
| `local` | `content`, optional `embeds` | Shows it in the channel, visible only to the user. |
| `actions` | `actions`: a list (below) | Carries them out in order; stops at the first that fails. |
| `none` | | Nothing. |

```json
{ "type": "message", "content": "https://mmeta.cloud/s/9Prhqe" }
```

### Actions

Things the plugin does in Discord as the user:

| `type` | Fields | |
| --- | --- | --- |
| `send` | `content`, `reply` | Sends a message; `reply: true` sends it as a reply to `context.reply`. |
| `local` | `content`, `embeds` | A message only the user sees. |
| `upload` | `url`, `filename`, `content`, `reply` | Downloads `url` and sends it as an attachment, with optional text. |
| `react` | `emoji`, `messageId` | Reacts to `messageId`, or to `context.reply`'s message. `emoji` is a unicode emoji or `name:id`. |
| `status` | `text`, `emoji`, `clearAfterMs` | Sets the user's custom status; empty `text` clears it. Without `clearAfterMs` it stays until changed. |
| `clipboard` | `text` | Copies text. |
| `open` | `url` | Opens a link. |

```json
{ "type": "actions", "actions": [
  { "type": "status", "text": "The Eminence in Shadow, Vol. 05", "emoji": "🎧", "clearAfterMs": 10800000 },
  { "type": "local", "content": "Status set for 3 hours." }
] }
```

URLs in actions may be relative (`/rc/v1/files/…`); the plugin resolves them against the
backend's base URL. Files the client downloads this way are fetched without the token,
so a backend should serve them under unguessable, short-lived paths.

The plugin waits up to 15 seconds for a reply, then tells the user the backend timed out.

## Versioning

New optional fields and new result types may be added within version 1; plugins ignore
fields they don't know and show unknown result types as an error. Anything that breaks
an existing client bumps `protocol`.
