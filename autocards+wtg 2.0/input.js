// ========== AUTOCARDS + WTG 2.0 - INPUT SCRIPT ==========
// Paste this ONLY into the INPUT tab in AI Dungeon scripting
// =========================================================

// input.js - Combined WTG 2.0 Lightweight + AutoCards input processing
// WTG runs first for time consistency, then AutoCards processes the result

const modifier = (text) => {
  const WTG_COMMAND_REGEX = /\[([^\]]+)\]/g;
  const WTG_COMMANDS = new Set(['settime', 'advance', 'sleep', 'reset', 'time']);

  // ============ WTG PROCESSING FIRST ============
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  ensureWTGEras();

  // Check if WTG is disabled entirely
  if (getWTGBooleanSetting("Disable WTG Entirely")) {
    // Still process AutoCards even if WTG is disabled
    let modifiedText = AutoCards("input", text);
    return {text: modifiedText};
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
      getWTGCommandsCard();
      state.changed = true;
    }
  }

  state.changed = state.changed || false;
  state.insertMarker = false;
  delete state.pendingTimeCommandText;

  let modifiedText = text;
  let messages = [];
  let terminalTimeMessage = null;

  // Check if user action is [sleep] command to trigger sleep
  if (text.trim().toLowerCase() === '[sleep]') {
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
      messages.push(`[SYSTEM] You go to sleep and wake up ${wakeMessage} on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]. `);
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
      messages.push(`[SYSTEM] You go to sleep and wake up the next morning on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]. `);
    }
    state.insertMarker = true;
    state.changed = true;
    // Flag to prevent context.js from overwriting turnTime (marker isn't in history yet)
    state.turnTimeModifiedByCommand = true;
    setSleepCooldown({hours: 8});
    modifiedText = '';
  } else {
    const commandMatches = [];
    modifiedText = text.replace(WTG_COMMAND_REGEX, (match, commandBody) => {
      const command = commandBody.trim().split(/\s+/)[0].toLowerCase();
      if (WTG_COMMANDS.has(command)) {
        commandMatches.push(commandBody.trim());
        return ' ';
      }
      return match;
    });

    modifiedText = modifiedText.replace(/\s{2,}/g, ' ').trim();

    for (const commandEntry of commandMatches) {
      const parts = commandEntry.split(/\s+/);
      const command = parts[0].toLowerCase();

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
          messages.push(`[SYSTEM] You go to sleep and wake up ${wakeMessage} on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]. `);
        } else {
          state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
          state.turnTime = addToTurnTime(state.turnTime, {days: 1});
          state.startingTime = "8:00 AM";
          const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
          state.currentDate = currentDate;
          state.currentEra = currentEra;
          state.currentTime = currentTime;
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`[SYSTEM] You go to sleep and wake up the next morning on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]. `);
        }
        state.insertMarker = true;
        state.changed = true;
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

            // Clear cooldowns when time is reset
            clearCommandCooldowns("settime command");

            const ttMarker = formatTurnTime(state.turnTime);
            messages.push(`[SYSTEM] Starting date and time set to ${getStartingDateDisplay()} ${state.startingTime}. [[${ttMarker}]]. `);
            // Mark settime as initialized and create WTG Settings card
            markSettimeAsInitialized();
            // Initialize storycards
            updateDateTimeCard();
            getWTGSettingsCard();
            getWTGCommandsCard();
            state.insertMarker = true;
            state.changed = true;
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
            messages.push('[Invalid advance command. Use: [advance N hours/days/months/years/minutes]. Example: [advance 2 hours]]');
            continue;
          }
          const unit = parts[2] ? parts[2].toLowerCase() : 'hours';
          let add = {};
          if (unit.startsWith('y')) {
            add.years = amount;
          } else if (unit.startsWith('min')) {
            add.minutes = amount;
          } else if (unit.startsWith('m')) {
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
          messages.push(`[SYSTEM] Advanced ${amount} ${unit}. New date/time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]. `);
          state.insertMarker = true;
          state.changed = true;
          // Flag to prevent context.js from overwriting turnTime (marker isn't in history yet)
          state.turnTimeModifiedByCommand = true;
          setAdvanceCooldown({minutes: 5});
        }
      } else if (command === 'time') {
        const ttMarker = formatTurnTime(state.turnTime);
        terminalTimeMessage = `[SYSTEM] Current Date and Time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`;
        state.insertMarker = false;
        state.changed = true;
        break;
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
          messages.push(`[SYSTEM] Date and time reset to most recent mention: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]. `);
          state.insertMarker = true;
          state.changed = true;
        } else {
          messages.push(`[No date or time mentions found in history.]`);
        }
      } else {
        messages.push('[Invalid command. Available: settime, advance, time, reset, sleep.]');
      }
    }
  }

  if (terminalTimeMessage) {
    messages = [terminalTimeMessage];
    modifiedText = '';
    state.pendingTimeCommandText = terminalTimeMessage;
    state.timeCommandUsed = true;
  }

  // Add messages to modified text with proper spacing
  if (messages.length > 0) {
    // Always add a newline after system messages to ensure proper spacing before AI response
    modifiedText = messages.join('\n') + '\n' + (modifiedText || '');
  }

  // ============ AUTOCARDS PROCESSING SECOND ============
  modifiedText = AutoCards("input", modifiedText);

  return {text: modifiedText};
};

modifier(text);
