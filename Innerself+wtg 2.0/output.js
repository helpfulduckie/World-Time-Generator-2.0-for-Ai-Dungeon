// ========== INNER SELF + WTG 2.0 - OUTPUT SCRIPT ==========
// Paste this ONLY into the OUTPUT tab in AI Dungeon scripting
// ===========================================================

// Combined Inner-Self + WTG Lightweight

// Performance safeguard: limit storycard processing for scenarios with many cards
const MAX_STORYCARDS_TO_PROCESS = 200;

const modifier = (text) => {
  // ========== WTG OUTPUT PROCESSING ==========
  // Initialize WTG state
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  // Initialize mode if not set (default to lightweight)
  if (!state.wtgMode) {
    state.wtgMode = 'lightweight';
  }

  // Initialize date/time state if not present (mirrors input.js initialization)
  if (state.startingDate === undefined) {
    state.startingDate = '01/01/1900';
    state.startingTime = 'Unknown';
    state.currentDate = '01/01/1900';
    state.currentTime = 'Unknown';
    state.settimeInitialized = false;
  }

  let modifiedText = text;

  // Check if WTG is disabled entirely - if so, just run Inner-Self and return
  if (getWTGBooleanSetting("Disable WTG Entirely")) {
    InnerSelf("output");
    return { text: ensureLeadingSpace(text) };
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
      state.startingTime = timeConfig.startingTime;
      state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
      const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
      state.currentDate = currentDate;
      state.currentTime = currentTime;
      state.changed = true;

      markSettimeAsInitialized();
      updateDateTimeCard();
      getWTGSettingsCard();
      getCooldownCard();
      getWTGCommandsCard();
      if (!isLightweightMode()) {
        getWTGDataCard();
      }
    } else {
      // Fall back: Check for [settime] command in storycards at scenario start
      const maxCards = Math.min(storyCards.length, MAX_STORYCARDS_TO_PROCESS);
      for (let i = 0; i < maxCards; i++) {
        const card = storyCards[i];
        if (card && card.entry) {
          const settimeMatch = card.entry.match(/\[settime\s+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})\s+(.+?)\]/i);
          if (settimeMatch) {
            let dateStr = settimeMatch[1];
            let timeStr = settimeMatch[2].trim();

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
              const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
              state.currentDate = currentDate;
              state.currentTime = currentTime;
              state.changed = true;

              markSettimeAsInitialized();
              updateDateTimeCard();
              getWTGSettingsCard();
              getCooldownCard();
              getWTGCommandsCard();
              if (!isLightweightMode()) {
                getWTGDataCard();
              }

              card.entry = card.entry.replace(/\[settime\s+\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\s+.+?\]/i, '').trim();
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

  // If settime has NOT been initialized and we're at the start, show setup prompt
  if (!hasSettimeBeenInitialized() && state.startingDate === '01/01/1900' && state.startingTime === 'Unknown') {
    state.initialMessageShown = true;
    return { text: ' Use [settime mm/dd/yyyy time] to set a custom starting date and time, or just take any action to auto-initialize with the current real-world time.\n\nThis version combines WTG time tracking with Inner Self for NPC memory and behavior.\n\nTo report bugs, message me on discord: thedenial. (it has a period at the end of it)' };
  }

  // Normal processing
  if (isLightweightMode()) {
    // ========== LIGHTWEIGHT MODE OUTPUT PROCESSING ==========

    // Get the last action from history
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

        let shouldProcessCommand = true;
        if (verb === 'sleep' && isSleepCooldownActive()) {
          shouldProcessCommand = false;
        } else if (verb === 'advance' && isAdvanceCooldownActive()) {
          shouldProcessCommand = false;
        }

        if (shouldProcessCommand) {
          let days = 0, hours = 0, minutes = 0;
          switch (unit) {
            case 'years': case 'year': days = amount * 365; break;
            case 'months': case 'month': days = amount * 30; break;
            case 'weeks': case 'week': days = amount * 7; break;
            case 'days': case 'day': days = amount; break;
            case 'hours': case 'hour': hours = amount; break;
            case 'minutes': case 'minute': minutes = amount; break;
          }

          if (days > 0 || hours > 0 || minutes > 0) {
            state.turnTime = addToTurnTime(state.turnTime, { days, hours, minutes });
            const { currentDate, currentTime } = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime);
            state.currentDate = currentDate;
            state.currentTime = currentTime;
            state.changed = true;
            timeAdjustedByCommand = true;

            if (verb === 'sleep') {
              setSleepCooldown({hours: 8});
            } else if (verb === 'advance') {
              setAdvanceCooldown({minutes: 5});
            }
          }
        }

        if (!shouldProcessCommand || !getWTGBooleanSetting("Debug Mode")) {
          modifiedText = modifiedText.replace(commandRegex, '').trim();
        }
      }

      const shouldRemoveAllCommands = isSleepCooldownActive() || isAdvanceCooldownActive() || !getWTGBooleanSetting("Debug Mode");
      if (shouldRemoveAllCommands) {
        modifiedText = modifiedText
          .replace(/\((?:sleep|advance)[^)]*\)/gi, '')
          .replace(/ {2,}/g, ' ')
          .trim();
      }
    } else {
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

    // Update turn time based on character count
    if (!timeAdjustedByCommand && state.startingTime !== 'Unknown' && minutesToAdd > 0) {
      state.turnTime = addToTurnTime(state.turnTime, {minutes: minutesToAdd});
      const {currentDate, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime);
      state.currentDate = currentDate;
      state.currentTime = currentTime;
      state.changed = true;
    }

    // Update text without turn time marker
    modifiedText = narrative;

    // Add timestamps to existing storycards
    if (hasSettimeBeenInitialized()) {
      // Note: Current Date and Time card is updated via updateDateTimeCard(), not here
      // (It's a system card that displays time directly, not a discovery card)

      // Combine the player's action and AI's output for keyword detection
      const combinedText = (lastAction ? lastAction.text : '') + ' ' + modifiedText;

      // Limit storycard processing for performance (scenarios with 900+ cards)
      const maxTimestampCards = Math.min(storyCards.length, MAX_STORYCARDS_TO_PROCESS);
      for (let i = 0; i < maxTimestampCards; i++) {
        const card = storyCards[i];
        if (!card) continue;
        // Skip system cards (O(1) Set lookup)
        if (SYSTEM_CARD_TITLES.has(card.title)) {
          continue;
        }
        // Skip Inner-Self brain cards
        if (card.title && card.title.toLowerCase().includes("brain")) {
          continue;
        }
        // Process [e] marker - removes marker and adds card to exclusions list
        if (processExclusionMarker(card)) {
          continue;
        }
        // Add timestamp only if card doesn't have one AND its keywords are mentioned in the text
        if (card.entry && !hasTimestamp(card) && isCardKeywordMentioned(card, combinedText)) {
          addTimestampToCard(card, `${state.currentDate} ${state.currentTime}`);
        }
      }
    }

    // Add turn data to WTG Data storycard if we found a player action and it's not a continue
    if (lastAction && actionType !== "continue") {
      const timestamp = formatTurnTime(state.turnTime);
      // Extract first two sentences for responseText
      const firstTwoSentences = narrative.match(/^[^.!?]*[.!?][^.!?]*[.!?]/) || [narrative.substring(0, 200)];
      const responseText = firstTwoSentences[0].trim();
      addTurnData(actionType, lastAction.text, responseText, timestamp);
    }

    // Update the Current Date and Time storycard
    if (state.changed || info.actionCount === 1 || info.actionCount % 5 === 0) {
      updateDateTimeCard();
      delete state.changed;
    }

    delete state.insertMarker;
  }

  // ========== INNER-SELF OUTPUT PROCESSING ==========
  InnerSelf("output");

  // Ensure the modified text starts with a space
  return { text: ensureLeadingSpace(modifiedText) };
};

modifier(text);
