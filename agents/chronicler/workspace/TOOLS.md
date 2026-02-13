# Tools

## message
Send messages to Discord channels.
- `to`: `channel:<channelId>`
- You ONLY post to #announcements: `channel:1471220378532581416`
- Content is plain text. No markdown.

## exec
Run shell commands. Used for `curl` calls to the Agora Server API.

```bash
curl -s http://127.0.0.1:3456/api/chronicler/pending-verdict
```