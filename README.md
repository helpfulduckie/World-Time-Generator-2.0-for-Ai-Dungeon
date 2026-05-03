# World Time Generator 3.0

> Advanced time tracking and entity management system for AI Dungeon scenarios

by helpfulduckie (aka bluestar) | based on World Time Generator 2.0 by thedenial.

---

## Table of Contents

- [Overview](#overview)
- [Which Variant Should I Use?](#which-variant-should-i-use)
- [System Commands](#system-commands)
- [Features](#features)
- [Installation](#installation)
- [Settings List](#settings-list)
- [Credits](#credits)

---

## Overview

World Time Generator (WTG) is a scripting system for AI Dungeon that automatically tracks the passage of time throughout your adventure. As the story unfolds, WTG keeps a running clock and calendar, displays the current date and time in your storycards, and automatically creates and timestamps storycards for the characters and locations the AI introduces.

WTG is designed to be installed once by a scenario author and then mostly invisible to players. You set a starting date, play your adventure, and WTG handles the rest. A handful of commands let you jump forward in time, skip ahead to morning after sleeping, or jump to a specific date or time when the story calls for it.

WTG 3.0 comes in three variants depending on what other systems your scenario uses:

| Variant | Use when... |
|---------|-------------|
| **wtg-standard** | You're using WTG on its own |
| **wtg-is** | Your scenario also uses the Inner Self (NPC memory) system by LewdLeah |
| **wtg-lola** | Your scenario also uses the LOLA (Localization) system (also) by LewdLeah |

All three variants share the same commands and settings. The only difference is how they integrate with those other systems.

---

## Which Variant Should I Use?

**Most scenarios:** Use **wtg-standard**. It's the full-featured version with no external dependencies.

**If you use Inner Self:** Use **wtg-is**. Inner Self is a character simulation system by LewdLeah that gives NPCs persistent memory and adaptive personalities. The wtg-is variant is built to work alongside it without conflicts.

**If you use LOLA:** Use **wtg-lola**. The wtg-lola variant integrates WTG's time tracking with the LOLA system, allowing you to translate the things WTG tells the AI into your desired language once so no English sneaks into your game.

> Do not mix scripts from different variants. All four files (library, input, context, output) must come from the same variant folder.

---

## System Commands

### Player Commands

These commands work in square brackets and can be typed as part of any action.

#### `[setStartTime mm/dd/year time ERA]`
**Set the starting date and time.**

```
[setStartTime 06/15/2023 8:00 AM]
[setStartTime 12/25/2024 11:30 PM AD]
[setStartTime 03/15/44 9:00 AM BC]
[setStartTime 01/01/7 12:00 AM AD]
```

- Supported eras: `AD` / `CE` (counts up) and `BC` / `BCE` (counts down)
- If you omit the era, it defaults to `AD`
- Years support 1–6 digits, including single-digit years

**Setting the time via a storycard:**
You can also put `[setStartTime]` directly in any storycard entry. When the scenario starts, WTG will detect it, apply the time, and remove the command from the card automatically.

```
[setStartTime 12/25/2024 6:00 AM AD]
It's Christmas morning in Victorian London...
```

See the [Installation](#installation) section for the recommended **WTG Time Config** storycard approach, which is more efficient for large scenarios.

---

#### `[advance N unit]` or `[adv N unit]`
**Jump forward in time.**

```
[advance 5 hours]
[adv 2 days]
[advance 1 month]
[adv 3 years]
```

Accepted units: `minutes` / `min` / `m`, `hours` / `hr` / `h`, `days` / `d`, `weeks` / `wk`, `months` / `mo`, `years` / `yr`

---

#### `[sleep]`
**Sleep until the next morning.**

Advances time by 6–9 hours plus a random number of minutes, landing somewhere in the morning of the next day.

```
[sleep]
```

You can also sleep for a specific duration:

```
[sleep 8 hours]
[sleep 2 days]
```

---

#### `[goto target]`
**Jump to a specific time, date, day of the week, or time phase.**

`[goto]` can move forward in time. You can give it a time, a date, a day of the week, or the name of a time phase. In cases of ambiguity, it will always pick the nearest time (In other words, if you say `[goto 10:00 AM]` and it's currently 11 am, it will go to tomorrow, but if its currently 9:00 am, it will advance just an hour).

```
[goto 10:00 AM]
[goto 06/20/2023]
[goto 06/20/2023 10:00 AM]
[goto Monday]
[goto Evening]
```

---

#### `[sleepuntil target]`
**Like `[goto]`, but also applies the sleep cooldown and flavors the text left behind a little differently.**

Useful for skipping to a specific morning or time of day without being able to accidentally rewind.

```
[sleepuntil 8:00 AM]
[sleepuntil Dawn]
[sleepuntil Friday]
```

---

#### `[goBack target]`
**Like `[goto]`, but goes backward in time instead of forward**

`[goBack]` can move backward in time up to your start time/date. You can give it a time, a date, a day of the week, or the name of a time phase.

```
[goBack 10:00 AM]
[goBack 06/20/2023]
[goBack 06/20/2023 10:00 AM]
[goBack Monday]
[goBack Evening]
```

---

#### `[reset]`
**Reset to the most recent date/time mentioned in the story.**

Scans recent story history for any date or time references and resets WTG's clock to the most recent one found.

```
[reset]
```

---

#### `[time]`
**Display the current date and time without advancing it.**

```
[time]
```

---

### AI Commands

When **Enable Dynamic Time** is turned on, the AI can also issue time commands by including them at the start of its response. These are processed automatically and removed from the output.

| Command | Effect |
|---------|--------|
| `(sleep N units)` | AI sleeps for the stated duration |
| `(advance N units)` | AI advances time by the stated amount |

Both commands have cooldown periods to prevent the AI from advancing time too aggressively.

---

### Storycard Markers

These markers can be placed in a storycard's **Notes** field to control how WTG handles that card.

#### `[e]`/`[wtg-no-timestamp]` — Exclude from timestamps

Add `[e]` or `[wtg-no-timestamp]` to a card's Notes or Entry to permanently exclude it from receiving WTG timestamps. If the marker was placed in the card's Entry, it is moved to the Notes. `[e]` is always converted to `[wtg-no-timestamp]` by the system. 

#### `/]` — Custom timestamp placement

Add `/]` anywhere in a card's Notes to control exactly where the timestamp is inserted. The timestamp will be placed directly before `/]`, and the marker is removed after insertion. Without this marker, timestamps are appended at the end of the card entry but inside any {} or [] you may be encapsulating your story cards with.

---

## Features

- **Automatic time tracking** — Time advances roughly 1 minute per ~300 characters of story text (configurable)
- **Persistent date and time display** — A "Current Date and Time" storycard is kept up to date every turn
- **Day of week** — WTG calculates the correct day of the week for any date
- **Time phases** — The time of day is labeled (Predawn, Dawn, Morning, Late Morning, Midday, Afternoon, Evening, Night, After Midnight); fully customizable via a "WTG Time Phases" storycard
- **Full era support** — AD/CE and BC/BCE calendars with correct arithmetic across era boundaries
- **Adventure rewind detection** — WTG detects when you erase or rewind story turns and adjusts accordingly
- **Automatic entity cards** — Characters introduced as `(Name)` and locations introduced as `((Name))` automatically get storycards with "first seen" timestamps
- **AI-driven time commands** — When enabled, the AI can advance time naturally as part of the narrative
- **Cooldown system** — Prevents the AI from spamming time commands
- **Localization** — Display labels (date format, phase names, etc.) can be translated via a "WTG: Localization" storycard

---

## Installation

### Step 1 — Choose Your Variant

Pick the variant folder that matches your scenario:

- `wtg-standard/` — standalone use
- `wtg-is/` — with Inner Self
- `wtg-lola/` — with LOLA

### Step 2 — Install the Scripts

1. Go to [AI Dungeon](https://aidungeon.com/) on a desktop browser (or switch to desktop view on mobile)
2. Create a new scenario or open one you're editing
3. Open the **Details** tab
4. Scroll down to **Scripting** and toggle **Scripts Enabled** ON
5. Click **Edit Scripts**
6. For each of the four tabs below, delete any existing code and paste in the contents of the corresponding file from your chosen variant folder:

| Script Tab | File |
|------------|------|
| Library | `library.js` |
| Input | `input.js` |
| Context | `context.js` |
| Output | `output.js` |

7. Click the yellow **Save** button

### Step 3 — Add the WTG Time Config Storycard

It's recommended for all scenarios to use the **WTG Time Config** storycard to set the starting date and time. It's required if your scenario has 500 or more storycards (without it, WTG has to scan every card on startup, which is slow).

1. Download `wtg-time-config-template.json` from this repository
2. Import it into your scenario's storycards
3. Edit the "WTG Time Config" card to set your starting date, era, and time:

```
Starting Date: 06/15/2023
Starting Era: AD
Starting Time: 8:00 AM
Initialized: true
```

> **Large scenarios (500+ storycards):** This step is not just recommended — it's essential. Without the WTG Time Config card, WTG must scan every storycard at startup, which causes significant slowdowns in large scenarios. This can cause your adventure to time out on creation, which will make you sad.

### Step 4 — Start Playing

Launch an adventure from your scenario. If you didn't use the WTG Time Config card, type the following into your first action to initialize the clock:

```
[setStartTime 06/15/2023 8:00 AM AD]
```

WTG will start tracking time from that point forward.

---

## Settings List

All WTG settings are stored in a storycard titled **Configure WTG**, which WTG creates automatically. Add one setting per line in the format `Setting Name: value`.

| Setting | Default | Options / Notes |
|---------|---------|-----------------|
| Enable WTG | `true` | Master on/off switch. Set to `false` to disable WTG entirely. |
| Time Duration Multiplier | `1.0` | Scales how fast time passes. `2.0` = time passes twice as fast; `0.5` = half speed. |
| Text Characters per Turn | `600` | Characters per turn for time calculation. This number should be your AI Response length multiplied by 4, unless you take a lot of long Story actions, then you may want to raise it further. This, combined with **Number of Turns per Hour** is used to determine how fast the clock moves before the **Time Duration Multiplier** is applied. |
| Number of Turns per Hour | `30` | Turns-based time rate. Used together with **Text Characters per Turn**. |
| Clock Format | `12h` | `12h` or `24h` |
| Date Format | `american` | `american` = MM/DD/YYYY; `european` = DD/MM/YYYY |
| Enable Generated Character Cards | `true` | Auto-create storycards for characters the AI names with `(Name)` |
| Enable Generated Location Cards | `true` | Auto-create storycards for locations the AI names with `((Name))` |
| Enable Generated Card Deletion | `false` | Auto-delete entity cards that haven't appeared in recent turns |
| Enable Dynamic Time | `true` | Allow the AI to issue time commands: `(sleep N)` and `(advance N)` |
| AI Command Nudge | `false` | When a player uses a WTG command, WTG can leave a short visible note in the story so the AI knows time has changed. This setting decides if the AI's time commands also leave this note. Set to `true` to show this note; `false` to suppress it. |
| Enable Fuzzy Duplicate Matching | `false` | *(Experimental)* Try to detect near-duplicate entity names and avoid creating separate cards for the same character or place |
| Player Command Clean Mode | `prepend` | Controls how player commands appear in the story text. `prepend` = command is removed and a nudge note is added before the `>` of your action; `in-place` = command is replaced by its nudge note where it was typed; `full` = command is removed with no nudge left behind at all. |
| Player Command Merge Mode | `all` | Controls how nudge notes from multiple commands are combined. `none` = each command gets its own note; `command-based` = adjacent commands of the same type are merged; `all` = all notes are merged into one. |
| Enable Card Timestamps | `true` | Inject "first seen" timestamps into storycards |
| Exclude Card Types | *(empty)* | Comma-separated list of storycard types that should never receive timestamps |
| Enable Localization | `false` | Use strings from the "WTG: Localization" storycard to translate WTG output labels |
| Debug Mode | `0` | `0` = off; higher values show progressively more diagnostic output in a Debug Data storycard |
| Nudge Show Date | `true` | Whether the date appears in the nudge note left after a player command (see **AI Command Nudge**) |
| Nudge Show Era | `true` | Whether the era (AD/BC) appears in the nudge note |
| Nudge Show Time | `true` | Whether the time appears in the nudge note |
| Nudge Show Day of Week | `true` | Whether the day of the week appears in the nudge note |
| Nudge Show Phase | `true` | Whether the time phase (e.g. "Morning") appears in the nudge note |
| AN Show Date | `true` | Whether the date appears in the Author's Note time injection |
| AN Show Era | `true` | Whether the era appears in the Author's Note time injection |
| AN Show Time | `true` | Whether the time appears in the Author's Note time injection |
| AN Show Day of Week | `true` | Whether the day of the week appears in the Author's Note time injection |
| AN Show Phase | `true` | Whether the time phase appears in the Author's Note time injection |
| DateTime Card Show Phase | `true` | Whether the time phase is shown in the "Current Date and Time" storycard |

---

## Credits

**Original concept and World Time Generator 2.0**
thedenial. — 2025

**World Time Generator 3.0 modifications and extensions**
helpfulduckie (aka bluestar) — 2026

**Integrations**
- Inner Self system by LewdLeah
- LOLA system by LewdLeah

**License:** Apache License 2.0 — see LICENSE file for details.

---

**Questions or bug reports?**
Discord: bluestar | Email: helpfulduckie@gmail.com
