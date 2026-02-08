// ========== INNER SELF + WTG 2.0 - INPUT SCRIPT ==========
// Paste this ONLY into the INPUT tab in AI Dungeon scripting
// ==========================================================

// Combined Inner-Self + WTG Lightweight

const modifier = (text) => {
  // ========== WTG INPUT PROCESSING ==========
  // Initialize WTG state
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  state.wtgMode = state.wtgMode || 'lightweight';

  let modifiedText = text;

  // Check if WTG is disabled entirely
  if (!getWTGBooleanSetting("Disable WTG Entirely")) {
    // Initialize state if not present
    if (state.startingDate === undefined) {
      state.startingDate = '01/01/1900';
      state.startingTime = 'Unknown';
      state.currentDate = '01/01/1900';
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
        state.startingTime = timeConfig.startingTime;
        state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
        const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
        state.currentDate = currentDate;
        state.currentTime = currentTime;
        // Mark settime as initialized (persists marker to WTG Data card)
        markSettimeAsInitialized();
        // Initialize storycards
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

    const bracketCommandRegex = /\[(\s*(?:settime|advance|sleep|reset)\b[^\]]*)\]/gi;
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
      // Check if this is NOT a command (doesn't start with [something])
      const trimmedText = text.trim();
      if (!hasWTGCommand && !trimmedText.match(/^\[.+?\]/)) {
        // User is doing a regular action without having set time - auto-set IRL date with default time
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const year = now.getFullYear();
        state.startingDate = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
        state.startingTime = '9:00 AM';  // Default to 9 AM (server time may differ from user's timezone)
        state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
        const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
        state.currentDate = currentDate;
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

    if (commandQueue.length > 0) {
      modifiedText = modifiedText.replace(bracketCommandRegex, " ").replace(/\s{2,}/g, " ").trim();
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
            const {currentDate, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime);
            state.currentDate = currentDate;
            state.currentTime = currentTime;
            let wakeMessage = (add.days > 0 || state.turnTime.days > 0) ? "the next day" : "later that day";
            const ttMarker = formatTurnTime(state.turnTime);
            wtgMessages.push(`[SYSTEM] You go to sleep and wake up ${wakeMessage} on ${state.currentDate} at ${state.currentTime}. [[${ttMarker}]]`);
          } else {
            state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
            state.turnTime = addToTurnTime(state.turnTime, {days: 1});
            state.startingTime = "8:00 AM";
            const {currentDate, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime);
            state.currentDate = currentDate;
            state.currentTime = currentTime;
            const ttMarker = formatTurnTime(state.turnTime);
            wtgMessages.push(`[SYSTEM] You go to sleep and wake up the next morning on ${state.currentDate} at ${state.currentTime}. [[${ttMarker}]]`);
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
            dateStr = dateStr.replace(/[.-]/g, '/');
            let [part1, part2, year] = dateStr.split('/').map(Number);
            if (year < 100) year += 2000;
            let month = part1;
            let day = part2;
            if (month > 12 && day <= 12) [month, day] = [day, part1];
            if (isValidDate(month, day, year)) {
              state.startingDate = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
              if (timeStr) {
                state.startingTime = normalizeTime(timeStr);
              } else {
                state.startingTime = 'Unknown';
              }
              state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
              const {currentDate, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime);
              state.currentDate = currentDate;
              state.currentTime = currentTime;
              updateAllStoryCardTimestamps(state.currentDate, state.currentTime);
              const ttMarker = formatTurnTime(state.turnTime);
              wtgMessages.push(`[SYSTEM] Starting date and time set to ${state.startingDate} ${state.startingTime}. [[${ttMarker}]]`);
              markSettimeAsInitialized();
              // Initialize storycards
              updateDateTimeCard();
              getWTGSettingsCard();
              getCooldownCard();
              getWTGCommandsCard();
              state.insertMarker = true;
              state.changed = true;
              if (!isLightweightMode()) {
                clearCommandCooldowns("user settime command");
              }
            } else {
              wtgMessages.push(`[Invalid date: ${dateStr}. Use mm/dd/yyyy or dd/mm/yyyy.]`);
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
              if (unit.startsWith('y')) {
                add.years = amount;
              } else if (unit.startsWith('m')) {
                add.months = amount;
              } else if (unit.startsWith('d')) {
                add.days = amount;
              } else {
                add.hours = amount;
              }
              state.turnTime = addToTurnTime(state.turnTime, add);
              const {currentDate, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime);
              state.currentDate = currentDate;
              state.currentTime = currentTime;
              const ttMarker = formatTurnTime(state.turnTime);
              wtgMessages.push(`[SYSTEM] Advanced ${amount} ${unit}. New date/time: ${state.currentDate} ${state.currentTime}. [[${ttMarker}]]`);
              state.insertMarker = true;
              state.changed = true;
              // Flag to prevent context.js from overwriting turnTime (marker isn't in history yet)
              state.turnTimeModifiedByCommand = true;
              setAdvanceCooldown({minutes: 5});
            }
          }
        } else if (command === 'reset') {
          let newDate = getCurrentDateFromHistory('', true);
          let newTime = getCurrentTimeFromHistory('', true);
          let valid = false;
          if (newDate) {
            let [part1, part2, year] = newDate.split('/').map(Number);
            if (year < 100) year += 2000;
            let month = part1;
            let day = part2;
            if (month > 12 && day <= 12) [month, day] = [day, part1];
            if (isValidDate(month, day, year)) {
              let tempCurrentDate = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
              let tempCurrentTime = newTime ? normalizeTime(newTime) : state.startingTime;
              state.turnTime = getDateDiff(state.startingDate, state.startingTime, tempCurrentDate, tempCurrentTime);
              state.currentDate = tempCurrentDate;
              state.currentTime = tempCurrentTime;
              updateAllStoryCardTimestamps(state.currentDate, state.currentTime);
              clearCommandCooldowns("reset command");
              valid = true;
            }
          }
          if (valid) {
            const ttMarker = formatTurnTime(state.turnTime);
            wtgMessages.push(`[SYSTEM] Date and time reset to most recent mention: ${state.currentDate} ${state.currentTime}. [[${ttMarker}]]`);
            state.insertMarker = true;
            state.changed = true;
          } else {
            wtgMessages.push(`[No date or time mentions found in history.]`);
          }
        }
      }
    }

    // Add WTG messages to text
    if (wtgMessages.length > 0) {
      modifiedText = wtgMessages.join('\n') + (modifiedText ? '\n' + modifiedText : '');
    }
  }

  // ========== INNER-SELF INPUT PROCESSING ==========
  InnerSelf("input");

  return { text: modifiedText };
};

modifier(text);
