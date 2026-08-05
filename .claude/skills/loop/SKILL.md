---
name: loop
description: Run a prompt or slash command repeatedly on a recurring interval (e.g. `/loop 5m /code-review`, defaults to 10m). Use this whenever the user wants something done again and again on a schedule rather than once — "check the deploy every 5 minutes", "keep watching the build until it's green", "run this every hour", "poll until X happens", "keep doing this until I say stop". Do NOT use it for a single one-off task, even a slow one.
---

# Loop

Repeat one task on a schedule until a stop condition is met or the user says stop.

The value of a loop is that the user stops having to ask. That only works if each
firing is cheap, quiet when nothing changed, and loud when something did. A loop
that narrates every tick is worse than no loop — the user starts ignoring it, and
then misses the one tick that mattered.

## 1. Parse the request

The invocation looks like `/loop [interval] <task>`. Both parts can be implicit:

| Input | Interval | Task |
|---|---|---|
| `/loop 5m /code-review` | 5 minutes | `/code-review` |
| `/loop check if the site is still up` | 10 minutes (default) | that prompt |
| `/loop 1h` | 1 hour | whatever the conversation is currently about |
| "check the build every couple minutes" | 2 minutes | check the build |

Accept `30s`, `5m`, `2h`, `90`, "every half hour", etc. Clamp to a sane floor —
under a minute the loop spends more effort waking up than working, so round up to
1 minute and say you did.

If the task is genuinely unclear (`/loop` alone, early in a conversation with no
obvious subject), ask once. Guessing wrong here means the user gets the wrong
thing repeated on a timer, which is worse than a single wrong answer.

## 2. Decide the stop condition before the first run

Ask yourself what makes this loop finish. Most loops are one of:

- **Until a condition holds** — "until CI is green", "until the PR is merged".
  Check it at the top of every firing and stop the moment it holds.
- **Until the user says stop** — monitoring, babysitting. Runs indefinitely.
- **A fixed number of times** — "run it 5 times and compare". Track the count.

State the stop condition to the user in your first reply, along with the interval.
They need to know what they signed up for and how it ends.

## 3. Schedule it

Pick the scheduling mechanism the session actually has, in this order:

1. **`ScheduleWakeup`** — best when you want to vary the delay based on what you
   just saw (back off when nothing is changing, tighten up when it is). Pass the
   same `/loop` input back as `prompt` each turn so the next firing repeats the
   task. Call it with `stop: true` to end the loop.
2. **`CronCreate`** — best for a fixed cadence you want to survive the session.
   Load it with `ToolSearch` first (`select:CronCreate,CronList,CronDelete`).
3. **`mcp__Claude_Code_Remote__send_later` / `create_trigger`** — in remote/web
   sessions, when the loop should keep firing after this container goes idle.

Never implement the wait with `sleep` in Bash. A sleeping shell burns the session
doing nothing, can't be interrupted cleanly, and dies with the container. If you
are waiting on background work the harness already tracks, don't poll for it at
all — you get woken when it finishes. Schedule a long fallback instead (20+ min)
so the loop survives if that work hangs.

## 4. Each firing

Do the task, then decide what the user hears:

- **Nothing changed since last tick** → say nothing, or one short line. Re-arm
  and end the turn. This is the common case and it should be nearly silent.
- **Something changed** → report the delta, not a full re-description. "Build
  went red: `test_auth.py::test_expiry` timing out" beats re-listing all 40 tests.
- **The stop condition is met** → say so plainly, stop scheduling, and summarize
  what happened across the whole loop.
- **The task failed in the same way twice** → stop and report. A loop that keeps
  hitting an identical error is not going to fix itself on tick nine; it is just
  spending the user's tokens to reprint the same message.

Keep a running note of what you saw last firing so "changed" is a real comparison
and not a guess. Compare against the previous observation, not against nothing.

## 5. Stopping

Stop immediately when the user asks — no final tick, no "one more check". Also
stop on your own when the stop condition holds, when the same failure repeats,
or when the thing you were watching no longer exists (branch deleted, PR closed,
server gone). Say which of those happened; a loop that goes quiet without
explanation reads as broken.

If you scheduled through `CronCreate` or a trigger, delete it as part of stopping.
Leaving a live schedule behind after the user said stop means it fires again
tomorrow with no context, which is exactly the surprise to avoid.
