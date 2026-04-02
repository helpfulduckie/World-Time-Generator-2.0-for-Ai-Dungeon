// ========== WTG 2.0 SCENARIO - INPUT SCRIPT ==========
// Paste this ONLY into the INPUT tab in AI Dungeon scripting
// ======================================================

// input.js - Handle user commands and process player actions for WTG with mode switching

const modifier = (text) => {
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  // Initialize mode if not set (default to lightweight)
  if (!state.wtgMode) {
    state.wtgMode = 'lightweight';
  }

  // Check if WTG is disabled entirely (Normal mode only)
  if (!isLightweightMode() && getWTGBooleanSetting("Disable WTG Entirely")) {
    return {text: text};
  }

  // Initialize state if not present
  if (state.startingDate === undefined) {
    state.startingDate = '01/01/1900';
    state.startingEra = DEFAULT_WTG_ERA;
    state.startingTime = 'Unknown';
    state.currentDate = '01/01/1900';
    state.currentEra = DEFAULT_WTG_ERA;
    state.currentTime = 'Unknown';
    state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
    state.settimeInitialized = false;
    if (!isLightweightMode()) {
      state.timeMultiplier = 1.0;
    }
  }

  ensureWTGEras();

  state.changed = state.changed || false;
  state.insertMarker = false;

  // Initialize cooldown tracking for AI commands (Normal mode only)
  if (!isLightweightMode()) {
    state.lastSleepTime = state.lastSleepTime || null;
    state.lastAdvanceTime = state.lastAdvanceTime || null;
    state.sleepWakeTime = state.sleepWakeTime || null;
    state.advanceEndTime = state.advanceEndTime || null;
  }

  // Clear any queued system-only output from the previous turn.
  delete state.pendingTimeCommandOutput;

  // Check for WTG Time Config card (runs before commands so [advance]/[sleep] work correctly)
  if (state.startingDate === '01/01/1900' && !state.settimeInitialized) {
    const timeConfig = parseWTGTimeConfig();
    if (timeConfig && timeConfig.initialized) {
      state.startingDate = timeConfig.startingDate;
      state.startingEra = timeConfig.startingEra;
      state.startingTime = timeConfig.startingTime;
      state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
      const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
      state.currentDate = currentDate;
      state.currentEra = currentEra;
      state.currentTime = currentTime;
      // Mark settime as initialized (persists marker to WTG Data card)
      markSettimeAsInitialized();
      // Initialize storycards
      updateDateTimeCard();
      getWTGSettingsCard();
      getCooldownCard();
      getWTGCommandsCard();
      if (!isLightweightMode()) {
        getWTGDataCard();
      }
      state.changed = true;
    }
  }

  // Auto-initialize with IRL time if user takes action without [settime]
  // Only trigger after initial message has been shown (prevents triggering on opening prompt)
  if (state.startingDate === '01/01/1900' && !state.settimeInitialized && state.initialMessageShown) {
    // Check if this is NOT a command (doesn't start with [something])
    const trimmedText = text.trim();
    if (!trimmedText.match(/^\[.+?\]/)) {
      // User is doing a regular action without having set time - auto-set IRL date with default time
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const year = now.getFullYear();
      state.startingDate = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
      state.startingEra = DEFAULT_WTG_ERA;
      state.startingTime = '9:00 AM';  // Default to 9 AM (server time may differ from user's timezone)
      state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
      const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
      state.currentDate = currentDate;
      state.currentEra = currentEra;
      state.currentTime = currentTime;
      markSettimeAsInitialized();
      updateDateTimeCard();
      getWTGSettingsCard();
      getCooldownCard();
      getWTGCommandsCard();
      if (!isLightweightMode()) {
        getWTGDataCard();
      }
      state.changed = true;
    }
  }

  let modifiedText = text;
  let messages = [];
  let terminalTimeMessage = null;

  const commandRegex = /\[([^\]]+)\]/g;
  const allowedCommands = new Set(['light', 'normal', 'settime', 'advance', 'sleep', 'reset', 'time']);
  const commandMatches = [...text.matchAll(commandRegex)];

  if (commandMatches.length > 0) {
    let rebuiltText = '';
    let lastIndex = 0;

    // Process bracketed commands in the order they appear, while preserving
    // any non-command narrative outside the brackets.
    for (const match of commandMatches) {
      rebuiltText += text.slice(lastIndex, match.index);

      const commandStr = match[1].trim();
      const parts = commandStr.split(/\s+/);
      const command = parts[0] ? parts[0].toLowerCase() : '';

      if (!allowedCommands.has(command)) {
        rebuiltText += match[0];
        lastIndex = match.index + match[0].length;
        continue;
      }

      if (command === 'light') {
        state.wtgMode = 'lightweight';
        messages.push('[Switched to Lightweight mode. All advanced features disabled.]');
      } else if (command === 'normal') {
        state.wtgMode = 'normal';
        messages.push('[Switched to Normal mode. All advanced features enabled.]');
      } else if (command === 'settime') {
        let dateStr = parts[1];
        let timeStr = parts.slice(2).join(' ');
        if (dateStr) {
          const parsedSettime = normalizeSettimeArgs(dateStr, timeStr, DEFAULT_WTG_ERA);
          if (parsedSettime) {
            state.startingDate = parsedSettime.startingDate;
            state.startingEra = parsedSettime.startingEra;
            if (parsedSettime.startingTime) {
              state.startingTime = parsedSettime.startingTime;
            }
            state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
            const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
            state.currentDate = currentDate;
            state.currentEra = currentEra;
            state.currentTime = currentTime;

            // Update timestamps in all existing storycards to reflect the new time
            updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

            const ttMarker = formatTurnTime(state.turnTime);
            messages.push(`[SYSTEM] Starting date and time set to ${getStartingDateDisplay()} ${state.startingTime}. [[${ttMarker}]]`);
            markSettimeAsInitialized();
            updateDateTimeCard();
            getWTGSettingsCard();
            getCooldownCard();
            getWTGCommandsCard();
            if (!isLightweightMode()) {
              getWTGDataCard();
            }
            state.insertMarker = true;
            state.changed = true;
            if (!isLightweightMode()) {
              clearCommandCooldowns("user settime command");
            }
          } else {
            messages.push(`[Invalid date: ${dateStr}. Example commands: [settime 06/15/2023 8:00 AM AD], [settime 03/15/44 9:00 AM BC], or [settime 06/15/2023 8:00 AM] to default to AD.]`);
          }
        }
      } else if (command === 'advance') {
        if (state.startingTime === 'Unknown') {
          messages.push(`[Time advancement not applied as current time is descriptive (${state.startingTime}). Use [settime] to set a numeric time if needed.]`);
        } else {
          const amount = parseInt(parts[1], 10);
          const unit = parts[2] ? parts[2].toLowerCase() : 'hours';
          if (isNaN(amount) || amount <= 0) {
            messages.push('[Invalid advance command. Use: [advance N hours/days/months/years/minutes]. Example: [advance 2 hours]]');
          } else {
            let add = {};
            if (unit.startsWith('y')) {
              add.years = amount;
            } else if (unit.startsWith('mon')) {
              add.months = amount;
            } else if (unit.startsWith('min')) {
              add.minutes = amount;
            } else if (unit.startsWith('d')) {
              add.days = amount;
            } else {
              add.hours = amount;
            }
            state.turnTime = addToTurnTime(state.turnTime, add);
            const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
            state.currentDate = currentDate;
            state.currentEra = currentEra;
            state.currentTime = currentTime;
            const ttMarker = formatTurnTime(state.turnTime);
            messages.push(`[SYSTEM] Advanced ${amount} ${unit}. New date/time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`);
            state.insertMarker = true;
            state.changed = true;
            state.turnTimeModifiedByCommand = true;
            if (!isLightweightMode()) {
              setAdvanceCooldown({minutes: 5});
            }
          }
        }
      } else if (command === 'sleep') {
        if (state.currentTime !== 'Unknown' && /\d/.test(state.currentTime)) {
          let sleepHours = Math.floor(Math.random() * 3) + 6;
          let sleepMinutes = Math.floor(Math.random() * 60);
          let add = {hours: sleepHours, minutes: sleepMinutes};
          state.turnTime = addToTurnTime(state.turnTime, add);
          const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
          state.currentDate = currentDate;
          state.currentEra = currentEra;
          state.currentTime = currentTime;
          let wakeMessage = (add.days > 0 || state.turnTime.days > 0) ? "the next day" : "later that day";
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`[SYSTEM] You go to sleep and wake up ${wakeMessage} on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]`);
        } else {
          // When time is Unknown, set it to 8:00 AM and reset turn time
          state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
          state.turnTime = addToTurnTime(state.turnTime, {days: 1});
          state.startingTime = "8:00 AM";
          const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
          state.currentDate = currentDate;
          state.currentEra = currentEra;
          state.currentTime = currentTime;
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`[SYSTEM] You go to sleep and wake up the next morning on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]`);
        }
        state.insertMarker = true;
        state.changed = true;
        state.turnTimeModifiedByCommand = true;
        if (!isLightweightMode()) {
          setSleepCooldown({hours: 8});
        }
      } else if (command === 'reset') {
        let newDate = getCurrentDateFromHistory('', true);
        let newTime = getCurrentTimeFromHistory('', true);
        let valid = false;
        if (newDate) {
          const parsedResetDate = parseDateString(newDate, getCurrentEra());
          if (parsedResetDate && isValidDate(parsedResetDate.month, parsedResetDate.day, parsedResetDate.year, parsedResetDate.era)) {
            let tempCurrentDate = formatDateForStorage(parsedResetDate);
            let tempCurrentEra = parsedResetDate.era;
            let tempCurrentTime = newTime ? normalizeTime(newTime) : state.startingTime;
            state.turnTime = getDateDiff(state.startingDate, state.startingTime, tempCurrentDate, tempCurrentTime, state.startingEra, tempCurrentEra);
            state.currentDate = tempCurrentDate;
            state.currentEra = tempCurrentEra;
            state.currentTime = tempCurrentTime;

            // Update timestamps in all existing storycards to reflect the reset time
            updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

            valid = true;
          }
        }
        if (valid) {
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`[SYSTEM] Date and time reset to most recent mention: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`);
          state.insertMarker = true;
          state.changed = true;
          if (!isLightweightMode()) {
            clearCommandCooldowns("user reset command");
          }
        } else {
          messages.push(`[No date or time mentions found in history.]`);
        }
      } else if (command === 'time') {
        const ttMarker = formatTurnTime(state.turnTime);
        terminalTimeMessage = `[SYSTEM] Current Date and Time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`;
        state.insertMarker = false;
        state.changed = true;
        state.pendingTimeCommandOutput = terminalTimeMessage;
        lastIndex = text.length;
        break;
      } else {
        messages.push('[Invalid command. Available: settime, advance, time, reset, sleep, light, normal.]');
      }

      lastIndex = match.index + match[0].length;
    }

    rebuiltText += text.slice(lastIndex);
    modifiedText = rebuiltText;
  }

  if (terminalTimeMessage) {
    messages = [terminalTimeMessage];
    modifiedText = '';
  }

  // Add messages to modified text
  if (messages.length > 0) {
    modifiedText = messages.join('\n') + (modifiedText ? '\n' + modifiedText : '');
    modifiedText = modifiedText.replace(/[ \t]{2,}/g, ' ').trim();
  }

  // ========================================================================
  // NORMAL MODE ONLY: Process entity markers in player input
  // ========================================================================
  if (!isLightweightMode()) {
    const fullInputText = text;
    
    // Blacklist for commands and pronouns
    const entityBlacklist = [
      'settime', 'advance', 'reset', 'sleep', 'help', 'status', 'time', 'date',
      'config', 'settings', 'debug', 'test', 'version', 'info', 'list', 'show',
      'clear', 'delete', 'remove', 'add', 'create', 'update', 'modify', 'change',
      'sleep', 'advance', 'light', 'normal',
      // Personal pronouns
      'i', 'me', 'my', 'mine', 'myself',
      'you', 'your', 'yours', 'yourself', 'yourselves',
      'he', 'him', 'his', 'himself',
      'she', 'her', 'hers', 'herself',
      'it', 'its', 'itself',
      'we', 'us', 'our', 'ours', 'ourselves',
      'they', 'them', 'their', 'theirs', 'themselves',
      // Demonstrative pronouns
      'this', 'that', 'these', 'those',
      // Relative pronouns
      'who', 'whom', 'whose', 'which', 'what',
      // Indefinite pronouns
      'someone', 'somebody', 'something', 'somewhere',
      'anyone', 'anybody', 'anything', 'anywhere',
      'everyone', 'everybody', 'everything', 'everywhere',
      'no one', 'nobody', 'nothing', 'nowhere',
      'one', 'ones', 'other', 'others', 'another',
      'each', 'every', 'either', 'neither', 'both', 'all', 'some', 'any', 'none',
      'few', 'many', 'several', 'much', 'more', 'most', 'less', 'least',
      // Interrogative pronouns
      'whoever', 'whomever', 'whatever', 'whichever'
    ];

    const isBlacklisted = (entityName) => {
      const lowerName = entityName.toLowerCase().trim();
      // Check for exact match with blacklist (important for pronouns to avoid false positives)
      return entityBlacklist.some(item => lowerName === item);
    };

    const enableLocationCards = getWTGBooleanSetting("Enable Generated Location Cards");

    // Parse double-parentheses locations first
    if (enableLocationCards) {
      const doubleParenRegex = /(?<!\()\(\(([^)]+?)\)\)(?!\))/g;
      let doubleParenMatch;
      while ((doubleParenMatch = doubleParenRegex.exec(text)) !== null) {
        const entity = doubleParenMatch[1];
        if (entity.length >= 2) {
          const sanitized = sanitizeEntityName(entity);
          const title = normalizeNameCase(sanitized);
          
          // Skip if blacklisted
          if (isBlacklisted(title)) {
            continue;
          }
          
          const keys = normalizeKeysFor(title);
          const card = findOrCreateCard(title);
          if (card) {
            card.type = "location";
            card.keys = keys.join(',');
            card.entry = `Location: ${title}. First mentioned in player input: ${fullInputText}`;
            if (!hasTimestamp(card)) {
              addTimestampToCard(card, getCurrentTimestampDisplay());
            }
          }
        }
      }
    }

    // Parse single-parentheses characters
    const enableCharacterCards = getWTGBooleanSetting("Enable Generated Character Cards");
    if (enableCharacterCards) {
      const singleParenRegex = /(?<!\()\(([^)]+?)\)(?!\))/g;
      let singleParenMatch;
      while ((singleParenMatch = singleParenRegex.exec(text)) !== null) {
        const entity = singleParenMatch[1];
        if (entity.length >= 2) {
          const sanitized = sanitizeEntityName(entity);
          const title = normalizeNameCase(sanitized);
          
          // Skip if blacklisted
          if (isBlacklisted(title)) {
            continue;
          }
          
          const keys = normalizeKeysFor(title);
          const card = findOrCreateCard(title);
          if (card) {
            card.type = "character";
            card.keys = keys.join(',');
            card.entry = `Character: ${title}. First mentioned in player input: ${fullInputText}`;
            if (!hasTimestamp(card)) {
              addTimestampToCard(card, getCurrentTimestampDisplay());
            }
          }
        }
      }
    }

    // Debug mode: Show raw input with parentheses if enabled
    const debugMode = getWTGBooleanSetting("Debug Mode");
    if (debugMode) {
      // Keep parentheses in the text for debugging
    } else {
      // Strip all ((...)) and (...) from the input text for normal mode
      modifiedText = modifiedText.replace(/\(\(([^)]+?)\)\)/g, '$1');
      modifiedText = modifiedText.replace(/\(([^)]+?)\)/g, '$1');
    }

    // Detect triggers in player input and track mentions (only after proper time is set)
    if (text.trim() && !text.trim().match(/^\[(.+?)\]$/) && state.currentDate !== '01/01/1900' && state.currentTime !== 'Unknown') {
      const inputText = text.toLowerCase();

      if (!state.currentTurnTriggers) {
        state.currentTurnTriggers = [];
      }

      storyCards.forEach(card => {
        if (card.title === "WTG Data" || card.title === "Current Date and Time" || card.title === "World Time Generator Settings") {
          return;
        }

        if (card.keys && areCardTriggersMentioned(card, inputText)) {
          const triggers = card.keys.split(',').map(trigger => trigger.trim());

          for (const trigger of triggers) {
            const lowerTrigger = trigger.toLowerCase();

            if (inputText.includes(lowerTrigger)) {
              if (!state.currentTurnTriggers.includes(trigger)) {
                state.currentTurnTriggers.push(trigger);
              }
              break;
            }

            const triggerWords = lowerTrigger.split(/\s+/);
            if (triggerWords.length >= 2) {
              if (inputText.includes(triggerWords[0])) {
                if (!state.currentTurnTriggers.includes(trigger)) {
                  state.currentTurnTriggers.push(trigger);
                }
                break;
              }
            }
          }
        }
      });
    }
  }

  return {text: modifiedText};
};

modifier(text);
