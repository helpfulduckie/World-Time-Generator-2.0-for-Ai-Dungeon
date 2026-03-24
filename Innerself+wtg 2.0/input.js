// ========== INNER SELF + WTG 2.0 - INPUT SCRIPT ==========
// Paste this ONLY into the INPUT tab in AI Dungeon scripting
// ==========================================================

// Combined Inner-Self + WTG Lightweight

const modifier = (text) => {
  // ========== WTG INPUT PROCESSING ==========
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  state.wtgMode = state.wtgMode || 'lightweight';

  ensureWTGEras();

  let modifiedText = text;

  // Check if WTG is disabled entirely
  if (!getWTGBooleanSetting("Disable WTG Entirely")) {
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

    const tryInitializeFromTimeConfig = () => {
      if (state.settimeInitialized) {
        return false;
      }
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
        markSettimeAsInitialized();
        updateDateTimeCard();
        getWTGSettingsCard();
        getCooldownCard();
        getWTGCommandsCard();
        state.changed = true;
        return true;
      }
      return false;
    };

    // Check for WTG Time Config card to initialize state before processing commands
    // This must happen in input.js because commands like [advance] run before output.js
    if (state.startingDate === '01/01/1900' && !state.settimeInitialized) {
      tryInitializeFromTimeConfig();
    }

    const bracketCommandRegex = /\[(\s*(?:settime|advance|sleep|reset|time)\b[^\]]*)\]/gi;
    const commandQueue = [];
    let commandMatch;
    while ((commandMatch = bracketCommandRegex.exec(modifiedText)) !== null) {
      commandQueue.push(commandMatch[1].trim());
    }
    bracketCommandRegex.lastIndex = 0;
    const hasWTGCommand = commandQueue.length > 0;

    // Auto-initialize with IRL time if user takes action without [settime]
    // Only trigger after initial message has been shown (prevents triggering on opening prompt)
    if (state.startingDate === '01/01/1900' && !state.settimeInitialized && state.initialMessageShown) {
      const trimmedText = text.trim();
      if (!hasWTGCommand && !trimmedText.match(/^\[.+?\]/)) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const year = now.getFullYear();
        state.startingDate = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
        state.startingEra = DEFAULT_WTG_ERA;
        state.startingTime = '9:00 AM';
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

    let wtgMessages = [];
    let terminalTimeMessage = null;

    if (commandQueue.length > 0) {
      modifiedText = modifiedText.replace(bracketCommandRegex, ' ').replace(/\s{2,}/g, ' ').trim();
      for (const commandEntry of commandQueue) {
        if (!commandEntry) {
          continue;
        }
        const parts = commandEntry.split(/\s+/);
        const command = parts[0].toLowerCase();

        if (command === 'sleep') {
          if (state.currentTime !== 'Unknown' && /\d/.test(state.currentTime)) {
            let sleepHours = Math.floor(Math.random() * 3) + 6;
            let sleepMinutes = Math.floor(Math.random() * 60);
            let add = {hours: sleepHours, minutes: sleepMinutes};
            state.turnTime = addToTurnTime(state.turnTime, add);
            const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
            state.currentDate = currentDate;
            state.currentEra = currentEra;
            state.currentTime = currentTime;
            let wakeMessage = (add.days > 0 || state.turnTime.days > 0) ? 'the next day' : 'later that day';
            const ttMarker = formatTurnTime(state.turnTime);
            wtgMessages.push(`[SYSTEM] You go to sleep and wake up ${wakeMessage} on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]`);
          } else {
            state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
            state.turnTime = addToTurnTime(state.turnTime, {days: 1});
            state.startingTime = '8:00 AM';
            const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
            state.currentDate = currentDate;
            state.currentEra = currentEra;
            state.currentTime = currentTime;
            const ttMarker = formatTurnTime(state.turnTime);
            wtgMessages.push(`[SYSTEM] You go to sleep and wake up the next morning on ${getCurrentDateDisplay()} at ${state.currentTime}. [[${ttMarker}]]`);
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
              wtgMessages.push(`[SYSTEM] Starting date and time set to ${getStartingDateDisplay()} ${state.startingTime}. [[${ttMarker}]]`);
              markSettimeAsInitialized();
              updateDateTimeCard();
              getWTGSettingsCard();
              getCooldownCard();
              getWTGCommandsCard();
              state.insertMarker = true;
              state.changed = true;
              if (!isLightweightMode()) {
                clearCommandCooldowns('user settime command');
              }
            } else {
              wtgMessages.push(`[Invalid date: ${dateStr}. Example commands: [settime 06/15/2023 8:00 AM AD], [settime 03/15/44 9:00 AM BC], or [settime 06/15/2023 8:00 AM] to default to AD.]`);
            }
          }
        } else if (command === 'advance') {
          if (state.startingTime === 'Unknown' && !state.settimeInitialized) {
            tryInitializeFromTimeConfig();
          }
          if (state.startingTime === 'Unknown') {
            wtgMessages.push(`[Time advancement not applied as current time is descriptive (${state.startingTime}). Use [settime] to set a numeric time if needed.]`);
          } else {
            const amount = parseInt(parts[1], 10);
            if (isNaN(amount) || amount <= 0) {
              wtgMessages.push('[Invalid advance command. Use: [advance N hours/days/months/years]. Example: [advance 2 hours]]');
            } else {
              const unit = parts[2] ? parts[2].toLowerCase() : 'hours';
              let add = {};
              if (unit.startsWith('min')) {
                add.minutes = amount;
              } else if (unit === 'm' || unit.startsWith('mon')) {
                add.months = amount;
              } else if (unit.startsWith('y')) {
                add.years = amount;
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
              wtgMessages.push(`[SYSTEM] Advanced ${amount} ${unit}. New date/time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`);
              state.insertMarker = true;
              state.changed = true;
              state.turnTimeModifiedByCommand = true;
              setAdvanceCooldown({minutes: 5});
            }
          }
        } else if (command === 'time') {
          const ttMarker = formatTurnTime(state.turnTime);
          terminalTimeMessage = `[SYSTEM] Current Date and Time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`;
          state.pendingWTGOutputMessage = terminalTimeMessage;
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
              updateAllStoryCardTimestamps(state.currentDate, state.currentTime);
              clearCommandCooldowns('reset command');
              valid = true;
            }
          }
          if (valid) {
            const ttMarker = formatTurnTime(state.turnTime);
            wtgMessages.push(`[SYSTEM] Date and time reset to most recent mention: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`);
            state.insertMarker = true;
            state.changed = true;
          } else {
            wtgMessages.push('[No date or time mentions found in history.]');
          }
        }
      }
    }

    if (terminalTimeMessage) {
      wtgMessages = [terminalTimeMessage];
      modifiedText = '';
    }

    // Add WTG messages to text
    if (wtgMessages.length > 0) {
      modifiedText = wtgMessages.join('\n') + (modifiedText ? '\n' + modifiedText : '');
    }
  }

  // ========== INNER-SELF INPUT PROCESSING ==========
  globalThis.text = modifiedText;
  InnerSelf('input');
  modifiedText = globalThis.text;

  return { text: modifiedText };
};

modifier(text);
