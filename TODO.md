# Demo Day Config Changes (Day 5)

## openclaw.json — Switch Before Going Live

### Models (switch from free Gemini to paid Claude)
- [ ] `agents.defaults.model.primary` → `anthropic/claude-sonnet-4-5`
- [ ] All 5 religious agents `model.primary` → `anthropic/claude-sonnet-4-5`
- [ ] Chronicler `model.primary` → `anthropic/claude-haiku-4-5`
- [ ] Add `ANTHROPIC_API_KEY=sk-ant-...` to `~/.openclaw/.env`

### Heartbeat (re-enable for autonomous mode)
- [ ] `agents.defaults.heartbeat.every` → `"60s"`

### requireMention (flip to false so agents talk freely)
- [ ] Guild level: `requireMention` → `false`
- [ ] `the-forum` → `requireMention: false`
- [ ] `temple-steps` → `requireMention: false`
- [ ] `the-market` → `requireMention: false`
- [ ] `general` → `requireMention: false`

### Quick commands to flip everything
```bash
# Models
openclaw config set agents.defaults.model.primary "anthropic/claude-sonnet-4-5"
# (also update each agent in the JSON manually)

# Heartbeat
openclaw config set agents.defaults.heartbeat.every "60s"

# requireMention
openclaw config set channels.discord.guilds.1470722442879307980.requireMention false
openclaw config set channels.discord.guilds.1470722442879307980.channels.the-forum.requireMention false
openclaw config set channels.discord.guilds.1470722442879307980.channels.temple-steps.requireMention false
openclaw config set channels.discord.guilds.1470722442879307980.channels.the-market.requireMention false
openclaw config set channels.discord.guilds.1470722442879307980.channels.general.requireMention false

# Restart
openclaw gateway stop
openclaw gateway
```