// ========== WTG 2.0 FULL - INPUT SCRIPT ==========
// Paste this ONLY into the INPUT tab in AI Dungeon scripting
// ==================================================

// input.js - Handle user commands and process player actions for the new WTG implementation

const modifier = (text) => {
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  // Initialize mode to normal (full version always uses normal mode)
  if (!state.wtgMode) {
    state.wtgMode = 'normal';
  }

  ensureWTGEras();

  // Check if WTG is disabled entirely
  if (getWTGBooleanSetting("Disable WTG Entirely")) {
    return {text: text};
  }

  // Initialize state if not present
  if (state.startingDate === undefined) {
    state.startingDate = '01/01/1900';
    state.startingTime = 'Unknown';
    state.startingEra = DEFAULT_WTG_ERA;
    state.currentDate = '01/01/1900';
    state.currentEra = DEFAULT_WTG_ERA;
    state.currentTime = 'Unknown';
    state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
    state.settimeInitialized = false;
    if (!isLightweightMode()) {
      state.timeMultiplier = 1.0;
    }
  }

  // Check for WTG Time Config card to initialize state before processing commands
  // This must happen in input.js because commands like [advance] run before output.js
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
      getWTGDataCard();
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
      getWTGDataCard();
      state.changed = true;
    }
  }

  state.changed = state.changed || false;
  state.insertMarker = false;

  // Initialize cooldown tracking for AI commands
  state.lastSleepTime = state.lastSleepTime || null;
  state.lastAdvanceTime = state.lastAdvanceTime || null;
  state.sleepWakeTime = state.sleepWakeTime || null;
  state.advanceEndTime = state.advanceEndTime || null;

  let modifiedText = text;
  let messages = [];
  const commandRegex = /\[(\s*(?:settime|advance|sleep|reset|time)\b[^\]]*)\]/gi;
  const commandMatches = [...modifiedText.matchAll(commandRegex)];

  if (commandMatches.length > 0) {
    modifiedText = modifiedText.replace(commandRegex, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  const queueCommandMessage = (message) => {
    messages.push(message);
  };

  for (const match of commandMatches) {
    const commandStr = match[1].trim();
    const parts = commandStr.split(/\s+/);
    const command = parts[0].toLowerCase();

    if (command === 'sleep') {
      if (state.currentTime !== 'Unknown' && /\d/.test(state.currentTime)) {
        const sleepHours = Math.floor(Math.random() * 3) + 6;
        const sleepMinutes = Math.floor(Math.random() * 60);
        const add = {hours: sleepHours, minutes: sleepMinutes};
        state.turnTime = addToTurnTime(state.turnTime, add);
        const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
        state.currentDate = currentDate;
        state.currentEra = currentEra;
        state.currentTime = currentTime;
        const wakeMessage = (add.days > 0 || state.turnTime.days > 0) ? "the next day" : "later that day";
        const ttMarker = formatTurnTime(state.turnTime);
        queueCommandMessage(`[SYSTEM] You go to sleep and wake up ${wakeMessage} on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]`);
      } else {
        state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
        state.turnTime = addToTurnTime(state.turnTime, {days: 1});
        state.startingTime = "8:00 AM";
        const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
        state.currentDate = currentDate;
        state.currentEra = currentEra;
        state.currentTime = currentTime;
        const ttMarker = formatTurnTime(state.turnTime);
        queueCommandMessage(`[SYSTEM] You go to sleep and wake up the next morning on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]`);
      }
      state.insertMarker = true;
      state.changed = true;
      state.turnTimeModifiedByCommand = true;
      setSleepCooldown({hours: 8});
    } else if (command === 'settime') {
      const dateStr = parts[1];
      const timeStr = parts.slice(2).join(' ');
      if (dateStr) {
        const parsedSettime = normalizeSettimeArgs(dateStr, timeStr, DEFAULT_WTG_ERA);
        if (parsedSettime) {
          state.startingDate = parsedSettime.startingDate;
          state.startingEra = parsedSettime.startingEra;
          state.startingTime = parsedSettime.startingTime || 'Unknown';
          state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
          const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
          state.currentDate = currentDate;
          state.currentEra = currentEra;
          state.currentTime = currentTime;

          updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

          const ttMarker = formatTurnTime(state.turnTime);
          queueCommandMessage(`[SYSTEM] Starting date and time set to ${getStartingDateDisplay()} ${state.startingTime}. [[${ttMarker}]]`);
          markSettimeAsInitialized();
          updateDateTimeCard();
          getWTGSettingsCard();
          getCooldownCard();
          getWTGCommandsCard();
          getWTGDataCard();
          state.insertMarker = true;
          state.changed = true;
          if (!isLightweightMode()) {
            clearCommandCooldowns("user settime command");
          }
        } else {
          queueCommandMessage(`[Invalid date: ${dateStr}. Example commands: [settime 06/15/2023 8:00 AM AD], [settime 03/15/44 9:00 AM BC], or [settime 06/15/2023 8:00 AM] to default to AD.]`);
        }
      }
    } else if (command === 'advance') {
      if (state.startingTime === 'Unknown') {
        queueCommandMessage(`[Time advancement not applied as current time is descriptive (${state.startingTime}). Use [settime] to set a numeric time if needed.]`);
      } else {
        const amount = parseInt(parts[1], 10);
        const unit = parts[2] ? parts[2].toLowerCase() : 'hours';
        if (isNaN(amount) || amount <= 0) {
          queueCommandMessage('[Invalid advance command. Use: [advance N hours/days/months/years/minutes]. Example: [advance 2 hours]]');
        } else {
          let add = {};
          if (unit.startsWith('year')) {
            add.years = amount;
          } else if (unit.startsWith('month')) {
            add.months = amount;
          } else if (unit.startsWith('week')) {
            add.days = amount * 7;
          } else if (unit.startsWith('day')) {
            add.days = amount;
          } else if (unit.startsWith('minute')) {
            add.minutes = amount;
          } else {
            add.hours = amount;
          }
          state.turnTime = addToTurnTime(state.turnTime, add);
          const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
          state.currentDate = currentDate;
          state.currentEra = currentEra;
          state.currentTime = currentTime;
          const ttMarker = formatTurnTime(state.turnTime);
          queueCommandMessage(`[SYSTEM] Advanced ${amount} ${unit}. New date/time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`);
          state.insertMarker = true;
          state.changed = true;
          state.turnTimeModifiedByCommand = true;
          setAdvanceCooldown({minutes: 5});
        }
      }
    } else if (command === 'time') {
      const ttMarker = formatTurnTime(state.turnTime);
      const timeMessage = `[SYSTEM] Current Date and Time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`;
      queueCommandMessage(timeMessage);
      state.insertMarker = false;
      state.changed = true;
      state.timeCommandUsed = true;
      state.pendingTimeCommandOutput = timeMessage;
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

          updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

          valid = true;
        }
      }
      if (valid) {
        const ttMarker = formatTurnTime(state.turnTime);
        queueCommandMessage(`[SYSTEM] Date and time reset to most recent mention: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`);
        state.insertMarker = true;
        state.changed = true;
        clearCommandCooldowns("user reset command");
      } else {
        queueCommandMessage(`[No date or time mentions found in history.]`);
      }
    } else if (command) {
      queueCommandMessage('[Invalid command. Available: settime, advance, time, reset, sleep.]');
    }
  }

  // Add messages to modified text
  if (messages.length > 0) {
    modifiedText = messages.join('\n') + (modifiedText ? '\n' + modifiedText : '');
  }

  // Process entity markers in player input (always enabled)
  // Get the full input for storycard entries
  const fullInputText = text;

  // Blacklist for commands and pronouns
  const entityBlacklist = [
    'settime', 'advance', 'reset', 'sleep', 'help', 'status', 'time', 'date',
    'config', 'settings', 'debug', 'test', 'version', 'info', 'list', 'show',
    'clear', 'delete', 'remove', 'add', 'create', 'update', 'modify', 'change',
    'sleep', 'advance',
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
        // Always update entry with full input text
        card.entry = `Location: ${title}. First mentioned in player input: ${fullInputText}`;
        // Add timestamp if not present
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
          // Always update entry with full input text
          card.entry = `Character: ${title}. First mentioned in player input: ${fullInputText}`;
          // Add timestamp if not present
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

  
  // DISABLED: Automatic character name detection - cards are now only created from parentheses
  // const potentialNames = extractCharacterNames(text);
  // const newNames = potentialNames.filter(name => !hasStoryCardForName(name));
  // ... (rest of automatic detection code removed)

  // Detect triggers in player input and track mentions (only after proper time is set)
  if (text.trim() && !text.trim().match(/^\[(.+?)\]$/) && state.currentDate !== '01/01/1900' && state.currentTime !== 'Unknown') {
    // Skip command processing, scan the actual player input for triggers
    const inputText = text.toLowerCase();

    // Initialize trigger tracking for this turn if not exists
    if (!state.currentTurnTriggers) {
      state.currentTurnTriggers = [];
    }

    // Check all storycards for trigger matches in player input
    storyCards.forEach(card => {
      // Skip the WTG Data storycard, Current Date and Time card, and WTG Settings card (already handled)
      if (card.title === "WTG Data" || card.title === "Current Date and Time" || card.title === "World Time Generator Settings") {
        return;
      }

      // Check if this card has keys (triggers) and if any are mentioned in the input text
      if (card.keys && areCardTriggersMentioned(card, inputText)) {
        // Split the keys by comma to get individual triggers
        const triggers = card.keys.split(',').map(trigger => trigger.trim());

        // Check each trigger to see if it matches the input text
        for (const trigger of triggers) {
          const lowerTrigger = trigger.toLowerCase();

          // Check for exact match first
          if (inputText.includes(lowerTrigger)) {
            // Add to current turn triggers for turn data
            if (!state.currentTurnTriggers.includes(trigger)) {
              state.currentTurnTriggers.push(trigger);
            }
            break;
          }

          // Handle multi-word names: if there are two words or more in the trigger,
          // also check if the first word matches
          const triggerWords = lowerTrigger.split(/\s+/);
          if (triggerWords.length >= 2) {
            // Check if the first word of the multi-word trigger appears in the input text
            if (inputText.includes(triggerWords[0])) {
              // Add to current turn triggers for turn data
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

  return {text: modifiedText};
};

modifier(text);
