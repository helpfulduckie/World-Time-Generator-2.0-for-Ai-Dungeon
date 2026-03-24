// ========== WTG 2.0 LIGHTWEIGHT - INPUT SCRIPT ==========
// Paste this ONLY into the INPUT tab in AI Dungeon scripting
// =========================================================

// input.js - Handle user commands and process player actions for WTG Lightweight

const modifier = (text) => {
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

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
      state.changed = true;
    }
  }

  state.changed = state.changed || false;
  state.insertMarker = false;

  let modifiedText = text;
  let messages = [];
  const WTG_COMMAND_NAMES = new Set(['settime', 'advance', 'sleep', 'reset', 'time']);
  const bracketCommandRegex = /\[([^\]]+)\]/g;
  const commandQueue = [];
  let rebuiltText = '';
  let lastIndex = 0;

  let commandMatch;
  while ((commandMatch = bracketCommandRegex.exec(text)) !== null) {
    rebuiltText += text.slice(lastIndex, commandMatch.index);

    const commandBody = commandMatch[1].trim();
    const parts = commandBody.split(/\s+/);
    const command = (parts[0] || '').toLowerCase();

    if (WTG_COMMAND_NAMES.has(command)) {
      commandQueue.push({command, parts});
      rebuiltText += ' ';
    } else {
      rebuiltText += commandMatch[0];
    }

    lastIndex = bracketCommandRegex.lastIndex;
  }
  rebuiltText += text.slice(lastIndex);
  modifiedText = rebuiltText.replace(/\s{2,}/g, ' ').trim();

  for (const {command, parts} of commandQueue) {
    if (command === 'sleep') {
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
      // Flag to prevent context.js from overwriting turnTime (marker isn't in history yet)
      state.turnTimeModifiedByCommand = true;
      setSleepCooldown({hours: 8});
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
          } else {
            state.startingTime = 'Unknown';
          }
          state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
          const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
          state.currentDate = currentDate;
          state.currentEra = currentEra;
          state.currentTime = currentTime;

          // Update timestamps in all existing storycards to reflect the new time
          updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`[SYSTEM] Starting date and time set to ${getStartingDateDisplay()} ${state.startingTime}. [[${ttMarker}]]`);
          // Mark settime as initialized
          markSettimeAsInitialized();
          // Initialize storycards
          updateDateTimeCard();
          getWTGSettingsCard();
          getCooldownCard();
          getWTGCommandsCard();
          state.insertMarker = true;
          state.changed = true;
          // Clear any existing AI command cooldowns when user resets time (Normal mode only)
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
        if (isNaN(amount) || amount <= 0) {
          messages.push('[Invalid advance command. Use: [advance N hours/days/months/years]. Example: [advance 2 hours]]');
          continue;
        }

        const unit = parts[2] ? parts[2].toLowerCase() : 'hours';
        let add = {};
        if (unit.startsWith('y')) {
          add.years = amount;
        } else if (unit.startsWith('min')) {
          add.minutes = amount;
        } else if (unit.startsWith('mo')) {
          add.months = amount;
        } else if (unit.startsWith('d')) {
          add.days = amount;
        } else {
          add.hours = amount;
        }
        state.turnTime = addToTurnTime(state.turnTime, add);
        const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
        state.currentDate = currentDate;
        state.currentEra = currentEra;
        state.currentTime = currentTime;
        const ttMarker = formatTurnTime(state.turnTime);
        messages.push(`[SYSTEM] Advanced ${amount} ${unit}. New date/time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`);
        state.insertMarker = true;
        state.changed = true;
        // Flag to prevent context.js from overwriting turnTime (marker isn't in history yet)
        state.turnTimeModifiedByCommand = true;
        setAdvanceCooldown({minutes: 5});
      }
    } else if (command === 'time') {
      const ttMarker = formatTurnTime(state.turnTime);
      state.pendingTimeResponse = `[SYSTEM] Current Date and Time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`;
      state.timeCommandUsed = true;
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

          // Clear cooldowns when time is reset
          clearCommandCooldowns("reset command");

          valid = true;
        }
      }
      if (valid) {
        const ttMarker = formatTurnTime(state.turnTime);
        messages.push(`[SYSTEM] Date and time reset to most recent mention: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`);
        state.insertMarker = true;
        state.changed = true;
      } else {
        messages.push(`[No date or time mentions found in history.]`);
      }
    }
  }

  // Add messages to modified text
  if (messages.length > 0) {
    modifiedText = messages.join('\n') + (modifiedText ? '\n' + modifiedText : '');
  }

  return {text: modifiedText};
};

modifier(text);
