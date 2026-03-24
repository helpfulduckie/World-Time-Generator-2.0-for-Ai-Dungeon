// ========== INNER SELF + WTG 2.0 - OUTPUT SCRIPT ==========
// Paste this ONLY into the OUTPUT tab in AI Dungeon scripting
// ===========================================================

// Combined Inner-Self + WTG Lightweight

// Performance safeguard: limit storycard processing for scenarios with many cards
const MAX_STORYCARDS_TO_PROCESS = 200;

const modifier = (text) => {
  // ========== WTG OUTPUT PROCESSING ==========
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  if (state.pendingWTGOutputMessage) {
    const pendingMessage = state.pendingWTGOutputMessage;
    delete state.pendingWTGOutputMessage;
    return { text: ensureLeadingSpace(pendingMessage) };
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

  // Check if WTG is disabled entirely - if so, just run Inner-Self and return
  if (getWTGBooleanSetting("Disable WTG Entirely")) {
    globalThis.text = modifiedText;
    InnerSelf('output');
    modifiedText = globalThis.text;
    return { text: ensureLeadingSpace(modifiedText) };
  }

  // Sync settime initialization flag from storycard if not set in state
  if (!state.settimeInitialized) {
    const dataCard = getWTGDataCard();
    if (dataCard && dataCard.entry && dataCard.entry.includes('[SETTIME_INITIALIZED]')) {
      state.settimeInitialized = true;
    }
  }

  // Check for WTG Time Config card FIRST (O(1) lookup - no scanning needed)
  if (state.startingDate === '01/01/1900' && !state.settimeInitialized) {
    const timeConfig = parseWTGTimeConfig();
    if (timeConfig && timeConfig.initialized) {
      state.startingDate = timeConfig.startingDate;
      state.startingEra = timeConfig.startingEra;
      state.startingTime = timeConfig.startingTime;
      if (!state.turnTimeModifiedByCommand) {
        state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
      }
      const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
      state.currentDate = currentDate;
      state.currentEra = currentEra;
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
      const maxCards = storyCards.length;
      for (let i = 0; i < maxCards; i++) {
        const card = storyCards[i];
        if (card) {
          const content = typeof card.entry === 'string' && card.entry.length > 0
            ? card.entry
            : (typeof card.value === 'string' && card.value.length > 0 ? card.value : '');
          if (!content) {
            continue;
          }

          const settimeMatch = content.match(/\[settime\s+([^\]]+?)\]/i);
          if (settimeMatch) {
            const settimeArgs = settimeMatch[1].trim().split(/\s+/);
            const dateStr = settimeArgs[0];
            const timeStr = settimeArgs.slice(1).join(' ');
            const parsedSettime = normalizeSettimeArgs(dateStr, timeStr, DEFAULT_WTG_ERA);

            if (parsedSettime) {
              state.startingDate = parsedSettime.startingDate;
              state.startingEra = parsedSettime.startingEra;
              state.startingTime = parsedSettime.startingTime || state.startingTime;
              if (!state.turnTimeModifiedByCommand) {
                state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
              }
              const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
              state.currentDate = currentDate;
              state.currentEra = currentEra;
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

              const updatedContent = content.replace(/\[settime\s+[^\]]+?\]/i, '').trim();
              if (typeof card.entry === 'string' && card.entry.length > 0) {
                card.entry = updatedContent;
              } else if (typeof card.value === 'string' && card.value.length > 0) {
                card.value = updatedContent;
              }
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
    state.startingTime = '9:00 AM';
    if (!state.turnTimeModifiedByCommand) {
      state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
    }
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

  // If settime has NOT been initialized and we're at the start, show setup prompt
  if (!hasSettimeBeenInitialized() && state.startingDate === '01/01/1900' && state.startingTime === 'Unknown') {
    state.initialMessageShown = true;
    return { text: ' Use [settime 06/15/2023 8:00 AM AD] to set a custom starting date, era, and time. For BC dates, use something like [settime 03/15/44 9:00 AM BC]. If you leave the era off, [settime 06/15/2023 8:00 AM] defaults to AD. Years can be 1-6 digits (for example 7 or 44).\n\nThis version combines WTG time tracking with Inner Self for NPC memory and behavior.\n\nTo report bugs, message me on discord: thedenial. (it has a period at the end of it)' };
  }

  // Normal processing
  if (isLightweightMode()) {
    // ========== LIGHTWEIGHT MODE OUTPUT PROCESSING ==========

    // Get the last action from history
    let lastAction = null;
    let actionType = 'continue';

    for (let i = history.length - 1; i >= 0; i--) {
      const action = history[i];
      if (action.type === 'do' || action.type === 'say' || action.type === 'story') {
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
            const { currentDate, currentEra, currentTime } = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
            state.currentDate = currentDate;
            state.currentEra = currentEra;
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
      const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
      state.currentDate = currentDate;
      state.currentEra = currentEra;
      state.currentTime = currentTime;
      state.changed = true;
    }

    // Update text without turn time marker
    modifiedText = narrative;

    // Add timestamps to existing storycards
    if (hasSettimeBeenInitialized()) {
      const combinedText = (lastAction ? lastAction.text : '') + ' ' + modifiedText;

      const maxTimestampCards = Math.min(storyCards.length, MAX_STORYCARDS_TO_PROCESS);
      for (let i = 0; i < maxTimestampCards; i++) {
        const card = storyCards[i];
        if (!card) continue;
        if (SYSTEM_CARD_TITLES.has(card.title)) {
          continue;
        }
        if (card.title && card.title.toLowerCase().includes('brain')) {
          continue;
        }
        if (processExclusionMarker(card)) {
          continue;
        }
        if (card.entry && !hasTimestamp(card) && isCardKeywordMentioned(card, combinedText)) {
          addTimestampToCard(card, getCurrentTimestampDisplay());
        }
      }
    }

    // Add turn data to WTG Data storycard if we found a player action and it's not a continue
    if (lastAction && actionType !== 'continue') {
      const timestamp = formatTurnTime(state.turnTime);
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
  globalThis.text = modifiedText;
  InnerSelf('output');
  modifiedText = globalThis.text;

  // Clean up turnTimeModifiedByCommand flag (set in input.js, read in context.js)
  delete state.turnTimeModifiedByCommand;

  return { text: ensureLeadingSpace(modifiedText) };
};

modifier(text);
