// ========== WTG 2.0 LIGHTWEIGHT - OUTPUT SCRIPT ==========
// Paste this ONLY into the OUTPUT tab in AI Dungeon scripting
// ==========================================================

// output.js - Handle AI responses and update storycards for WTG Lightweight

// Performance safeguard: limit storycard processing for scenarios with many cards
const MAX_STORYCARDS_TO_PROCESS = 200;

const modifier = (text) => {
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  if (state.timeCommandUsed) {
    delete state.timeCommandUsed;
    return { text: '' };
  }

  // Initialize mode if not set (default to lightweight)
  if (!state.wtgMode) {
    state.wtgMode = 'lightweight';
  }

  ensureWTGEras();

  // Initialize date/time state if not present (mirrors input.js initialization)
  if (state.startingDate === undefined) {
    state.startingDate = '01/01/1900';
    state.startingTime = 'Unknown';
    state.startingEra = DEFAULT_WTG_ERA;
    state.currentDate = '01/01/1900';
    state.currentEra = DEFAULT_WTG_ERA;
    state.currentTime = 'Unknown';
    state.settimeInitialized = false;
  }

  let modifiedText = text;

  // Check if WTG is disabled entirely
  if (getWTGBooleanSetting("Disable WTG Entirely")) {
    return {text: ensureLeadingSpace(text)};
  }

  // Sync settime initialization flag from storycard if not set in state
  if (!state.settimeInitialized) {
    const dataCard = getWTGDataCard();
    if (dataCard && dataCard.entry && dataCard.entry.includes('[SETTIME_INITIALIZED]')) {
      state.settimeInitialized = true;
    }
  }

  // Check for WTG Time Config card FIRST (O(1) lookup - no scanning needed)
  // Check whenever time hasn't been initialized yet (removed actionCount restriction)
  if (state.startingDate === '01/01/1900' && !state.settimeInitialized) {
    const timeConfig = parseWTGTimeConfig();
    if (timeConfig && timeConfig.initialized) {
      // Use config card values directly - skip full storycard scan
      state.startingDate = timeConfig.startingDate;
      state.startingEra = timeConfig.startingEra;
      state.startingTime = timeConfig.startingTime;
      // Don't reset turnTime if it was already set by a command in input.js
      // This fixes [advance]/[sleep] being overwritten when using WTG Time Config card
      if (!state.turnTimeModifiedByCommand) {
        state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
      }
      const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
      state.currentDate = currentDate;
      state.currentEra = currentEra;
      state.currentTime = currentTime;
      state.changed = true;

      // Mark settime as initialized since we got it from config card
      markSettimeAsInitialized();

      // Initialize required system storycards
      updateDateTimeCard();
      getWTGSettingsCard();
      getCooldownCard();
      getWTGCommandsCard();
      if (!isLightweightMode()) {
        getWTGDataCard();
      }
    } else {
      // Fall back: Scan storycards for [settime] commands (limited for performance)
      const maxCards = Math.min(storyCards.length, MAX_STORYCARDS_TO_PROCESS);
      for (let i = 0; i < maxCards; i++) {
        const card = storyCards[i];
        if (card && card.entry) {
          const settimeMatch = card.entry.match(/\[settime\s+([^\]]+?)\]/i);
          if (settimeMatch) {
            const settimeArgs = settimeMatch[1].trim().split(/\s+/);
            const dateStr = settimeArgs[0];
            const timeStr = settimeArgs.slice(1).join(' ');
            const parsedSettime = normalizeSettimeArgs(dateStr, timeStr, getCurrentEra());

            if (parsedSettime) {
              // Set the starting date and time
              state.startingDate = parsedSettime.startingDate;
              state.startingEra = parsedSettime.startingEra;
              state.startingTime = parsedSettime.startingTime || state.startingTime;
              // Don't reset turnTime if it was already set by a command in input.js
              if (!state.turnTimeModifiedByCommand) {
                state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
              }
              const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
              state.currentDate = currentDate;
              state.currentEra = currentEra;
              state.currentTime = currentTime;
              state.changed = true;

              // Mark settime as initialized since we auto-detected it
              markSettimeAsInitialized();

              // Initialize required system storycards
              updateDateTimeCard();
              getWTGSettingsCard();
              getCooldownCard();
              getWTGCommandsCard();
              if (!isLightweightMode()) {
                getWTGDataCard();
              }

              // Remove the [settime] command from the storycard
              card.entry = card.entry.replace(/\[settime\s+[^\]]+?\]/i, '').trim();

              // Skip the opening prompt and let AI respond
              // Don't return here, just continue to normal processing
              break;
            }
          }
        }
      }
    }
  }

  // Fallback auto-IRL-time for "continue" actions (onInput may not run for these)
  if (state.initialMessageShown && !state.settimeInitialized &&
      state.startingDate === '01/01/1900' && info.actionCount > 1) {
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

  // If settime has NOT been initialized and we're at the start, inject the prompt
  if (!hasSettimeBeenInitialized() && state.startingDate === '01/01/1900' && state.startingTime === 'Unknown') {
    state.initialMessageShown = true;
    modifiedText = ' Use [settime mm/dd/year time [BC|AD]] to set a custom starting date, era, and time. Years can be 1-6 digits (for example 7 or 44), BC years count down as time advances, and AD years count up. AC/CE and BCE also work. Or just take any action to auto-initialize with the current real-world time.\n\nThis is the LIGHTWEIGHT version - simple time tracking without AI prompt injection.\n\nTo report bugs, message me on discord: thedenial. (it has a period at the end of it)';
    return {text: ensureLeadingSpace(modifiedText)};
  }

  // ========================================================================
  // LIGHTWEIGHT MODE
  // ========================================================================
  if (isLightweightMode()) {

  // Get the last action from history to determine action type
  let lastAction = null;
  let actionType = "continue";
  
  for (let i = history.length - 1; i >= 0; i--) {
    const action = history[i];
    if (action.type === "do" || action.type === "say" || action.type === "story") {
      lastAction = action;
      actionType = action.type;
      break;
    }
  }

  // AI COMMAND EXTRACTION - Check for (sleep) or (advance) commands
  let timeAdjustedByCommand = false;
  if (getWTGBooleanSetting("Enable Dynamic Time")) {
    const commandRegex = /^\s*\((sleep|advance)\s+(\d+)\s+(\w+)\)\s*/;
    const commandMatch = modifiedText.match(commandRegex);
    if (commandMatch) {
      const verb = commandMatch[1];
      const amount = parseInt(commandMatch[2], 10);
      const unit = commandMatch[3].toLowerCase();
      const fullCommand = commandMatch[0].trim();

      // Check if cooldown is active before processing command
      let shouldProcessCommand = true;
      if (verb === 'sleep' && isSleepCooldownActive()) {
        shouldProcessCommand = false;
      } else if (verb === 'advance' && isAdvanceCooldownActive()) {
        shouldProcessCommand = false;
      }

      // Only process command if no active cooldown
      if (shouldProcessCommand) {
        // Convert to days, hours, minutes
        let days = 0, hours = 0, minutes = 0;
        switch (unit) {
          case 'years':
          case 'year':
            days = amount * 365;
            break;
          case 'months':
          case 'month':
            days = amount * 30;
            break;
          case 'weeks':
          case 'week':
            days = amount * 7;
            break;
          case 'days':
          case 'day':
            days = amount;
            break;
          case 'hours':
          case 'hour':
            hours = amount;
            break;
          case 'minutes':
          case 'minute':
            minutes = amount;
            break;
          default:
            break;
        }

        // Apply the time jump if we have valid values
        if (days > 0 || hours > 0 || minutes > 0) {
          state.turnTime = addToTurnTime(state.turnTime, { days, hours, minutes });
          const { currentDate, currentEra, currentTime } = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
          state.currentDate = currentDate;
          state.currentEra = currentEra;
          state.currentTime = currentTime;
          state.changed = true;
          timeAdjustedByCommand = true;

          // Set cooldown
          if (verb === 'sleep') {
            setSleepCooldown({hours: 8});
          } else if (verb === 'advance') {
            setAdvanceCooldown({minutes: 5});
          }
        }
      }

      // Remove command from output if not in debug mode OR if on cooldown
      if (!shouldProcessCommand || !getWTGBooleanSetting("Debug Mode")) {
        modifiedText = modifiedText.replace(commandRegex, '').trim();
      }
    }

    // Final sanitation: remove any remaining commands
    const shouldRemoveAllCommands = isSleepCooldownActive() || isAdvanceCooldownActive() || !getWTGBooleanSetting("Debug Mode");
    if (shouldRemoveAllCommands) {
      modifiedText = modifiedText
        .replace(/\((?:sleep|advance)[^)]*\)/gi, '')
        .replace(/ {2,}/g, ' ')
        .trim();
    }
  } else {
    // When Dynamic Time is OFF, always strip any (sleep ...) or (advance ...) commands
    // since they shouldn't appear at all - the AI may still output them incorrectly
    modifiedText = modifiedText
      .replace(/\((?:sleep|advance)[^)]*\)/gi, '')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  // Process any existing turn time marker in the text
  const ttMatch = modifiedText.match(/\[\[(.*?)\]\]$/);
  let parsedTT = ttMatch ? parseTurnTime(ttMatch[1]) : null;
  let narrative = ttMatch ? modifiedText.replace(/\[\[.*\]\]$/, '').trim() : modifiedText.trim();
  let charCount = narrative.length;

  // Calculate minutes to add based on character count
  let minutesToAdd;
  if (getWTGBooleanSetting("Enable Dynamic Time")) {
    const turnText = (lastAction ? lastAction.text : '') + ' ' + narrative;
    const dynamicFactor = getDynamicTimeFactor(turnText);
    minutesToAdd = Math.floor((charCount / 700) * dynamicFactor);
  } else {
    minutesToAdd = Math.floor(charCount / 700);
  }

  // Add warning if AI altered turn time metadata
  if (parsedTT) {
    const currentTTForm = formatTurnTime(state.turnTime);
    if (ttMatch[1] !== currentTTForm) {
      modifiedText += '\n[Warning: Turn time metadata altered by AI. Please retry.]';
    }
  }

  // Update turn time based on character count ONLY if no AI command was processed
  // Note: User commands are handled in context hook via [[turntime]] marker
  if (!timeAdjustedByCommand && state.startingTime !== 'Unknown' && minutesToAdd > 0) {
    state.turnTime = addToTurnTime(state.turnTime, {minutes: minutesToAdd});
    const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
    state.currentDate = currentDate;
    state.currentEra = currentEra;
    state.currentTime = currentTime;
    state.changed = true;
  }

  // Update text without turn time marker
  modifiedText = narrative;

  // Add timestamps to existing storycards that don't have them
  if (hasSettimeBeenInitialized()) {
    // Note: Current Date and Time card is updated via updateDateTimeCard(), not here
    // (It's a system card that displays time directly, not a discovery card)

    // Combine the player's action and AI's output for keyword detection
    const combinedText = (lastAction ? lastAction.text : '') + ' ' + modifiedText;

    // Add timestamps to storycards that don't have them but whose keywords were mentioned
    // Limit storycard processing for performance (scenarios with 900+ cards)
    const maxTimestampCards = Math.min(storyCards.length, MAX_STORYCARDS_TO_PROCESS);
    for (let i = 0; i < maxTimestampCards; i++) {
      const card = storyCards[i];
      if (!card) continue;

      // Skip system cards (O(1) Set lookup)
      if (SYSTEM_CARD_TITLES.has(card.title)) {
        continue;
      }

      // Process [e] marker - removes marker and adds card to exclusions list
      if (processExclusionMarker(card)) {
        continue;
      }

      // Add timestamp only if card doesn't have one AND its keywords are mentioned in the text
      if (card.entry && !hasTimestamp(card) && isCardKeywordMentioned(card, combinedText)) {
        addTimestampToCard(card, getCurrentTimestampDisplay());
      }
    }
  }

  // Add turn data to WTG Data storycard if we found a player action and it's not a continue
  if (lastAction && actionType !== "continue") {
    const timestamp = formatTurnTime(state.turnTime);
    addTurnData(actionType, lastAction.text, narrative, timestamp);
  }

  // Update the Current Date and Time storycard if needed
  if (state.changed || info.actionCount === 1 || info.actionCount % 5 === 0) {
    updateDateTimeCard();
    delete state.changed;
  }

  delete state.insertMarker;
  // Clean up the command flag (set by input.js, used by context.js and output.js)
  delete state.turnTimeModifiedByCommand;

  // Ensure the modified text starts with a space
  modifiedText = ensureLeadingSpace(modifiedText);

  return {text: modifiedText};
  }

};

modifier(text);
