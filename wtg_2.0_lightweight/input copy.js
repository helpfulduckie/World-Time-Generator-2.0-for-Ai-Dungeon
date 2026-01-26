// ========== WTG 2.0 LIGHTWEIGHT - INPUT SCRIPT ==========
// Paste this ONLY into the INPUT tab in AI Dungeon scripting
// =========================================================

// input.js - Handle user commands and process player actions for WTG Lightweight

const modifier = (text) => {
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  // Check if WTG is disabled entirely
  if (getWTGBooleanSetting("Disable WTG Entirely")) {
    return {text: text};
  }

  // Initialize state if not present
  if (state.startingDate === undefined) {
    state.startingDate = '01/01/1900';
    state.startingTime = 'Unknown';
    state.currentDate = '01/01/1900';
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
      state.startingTime = timeConfig.startingTime;
      state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
      const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
      state.currentDate = currentDate;
      state.currentTime = currentTime;
      // Mark settime as initialized (persists marker to WTG Data card)
      markSettimeAsInitialized();
      state.changed = true;
    }
  }

  state.changed = state.changed || false;
  state.insertMarker = false;

  // Handle bracketed commands
  let modifiedText = text;
  let messages = [];
  let trimmedText = text.trim();
  // Check for one or more bracketed commands
  const commandRegex = /\[([^\]]+)\]/g;
  const commandMatches = [...trimmedText.matchAll(commandRegex)];
    
  if (commandMatches.length > 0) {
    // Process each command in sequence
    for (const match of commandMatches) {
      const bracketedCommand = match[0];
      const commandStr = match[1].trim().toLowerCase();
      const parts = commandStr.split(/\s+/);
      const command = parts[0];
      
      if (command === 'settime') {
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

            // Update timestamps in all existing storycards to reflect the new time
            updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

            const ttMarker = formatTurnTime(state.turnTime);
            messages.push(`[SYSTEM] Starting date and time set to ${state.startingDate} ${state.startingTime}. [[${ttMarker}]]`);
            modifiedText = modifiedText.replace(bracketedCommand, '');
            // Mark settime as initialized
            markSettimeAsInitialized();
            state.insertMarker = true;
            state.changed = true;
            // Clear any existing AI command cooldowns when user resets time (Normal mode only)
            if (!isLightweightMode()) {
              clearCommandCooldowns("user settime command");
            }
          } else {
            messages.push(`[Invalid date: ${dateStr}. Use mm/dd/yyyy or dd/mm/yyyy.]`);
          }
        }
      } else if (command === 'advance') {
        if (state.startingTime === 'Unknown') {
          messages.push(`[Time advancement not applied as current time is descriptive (${state.startingTime}). Use [settime] to set a numeric time if needed.]`);
        } else {
          const amount = parseInt(parts[1], 10);
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
          messages.push(`[SYSTEM] Advanced ${amount} ${unit}. New date/time: ${state.currentDate} ${state.currentTime}. [[${ttMarker}]]`);
          modifiedText = modifiedText.replace(bracketedCommand, '');
          state.insertMarker = true;
          state.changed = true;
          // Flag to prevent context.js from overwriting turnTime (marker isn't in history yet)
          state.turnTimeModifiedByCommand = true;
          setAdvanceCooldown({minutes: 5});
        }
      } else if (command === 'sleep') {
        if (state.currentTime !== 'Unknown' && /\d/.test(state.currentTime)) {
          let sleepHours = Math.floor(Math.random() * 3) + 6;
          let sleepMinutes = Math.floor(Math.random() * 60);
          let add = {hours: sleepHours, minutes: sleepMinutes};
          state.turnTime = addToTurnTime(state.turnTime, add);
          const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
          state.currentDate = currentDate;
          state.currentTime = currentTime;
          let wakeMessage = (add.days > 0 || state.turnTime.days > 0) ? "the next day" : "later that day";
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`[SYSTEM] You go to sleep and wake up ${wakeMessage} on ${state.currentDate} at ${state.currentTime}. [[${ttMarker}]]`);
        } else {
          // When time is Unknown, set it to 8:00 AM and reset turn time
          state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
          state.turnTime = addToTurnTime(state.turnTime, {days: 1});
          state.startingTime = "8:00 AM";
          const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
          state.currentDate = currentDate;
          state.currentTime = currentTime;
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`[SYSTEM] You go to sleep and wake up the next morning on ${state.currentDate} at ${state.currentTime}. [[${ttMarker}]]`);
        }
          state.insertMarker = true;
          state.changed = true;
          setSleepCooldown({hours: 8});
          modifiedText = modifiedText.replace(bracketedCommand, '');
      }else if (command === 'reset') {
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

            // Update timestamps in all existing storycards to reflect the reset time
            updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

            // Clear cooldowns when time is reset
            clearCommandCooldowns("reset command");

            valid = true;
          }
        }
        if (valid) {
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`[SYSTEM] Date and time reset to most recent mention: ${state.currentDate} ${state.currentTime}. [[${ttMarker}]]`);
          modifiedText = modifiedText.replace(bracketedCommand, '');
          state.insertMarker = true;
          state.changed = true;
        } else {
          messages.push(`[No date or time mentions found in history.]`);
        }
      } 
      messages.unshift(modifiedText);
    }
  }

  // Add messages to modified text
  if (messages.length > 0) {
    modifiedText = messages.join('\n');
  }

  return {text: modifiedText};
};

modifier(text);