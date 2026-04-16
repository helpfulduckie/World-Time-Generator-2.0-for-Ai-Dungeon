// ========== INNER SELF + WTG 2.0 - CONTEXT SCRIPT ==========
// Paste this ONLY into the CONTEXT tab in AI Dungeon scripting
// ============================================================

// Combined Inner-Self + WTG Lightweight

const modifier = (text) => {
  // ========== WTG CONTEXT PROCESSING ==========
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  ensureWTGEras();

  let modifiedText = text;

  // Check if WTG is disabled entirely
  if (!getWTGBooleanSetting("Disable WTG Entirely")) {
    const turnData = getTurnData();

    // Handle adventure erasing based on action matching
    if (turnData.length > 0 && history.length > 1) {
      let previousAction = null;
      for (let i = history.length - 2; i >= 0; i--) {
        const action = history[i];
        if (action.type === 'do' || action.type === 'say' || action.type === 'story') {
          previousAction = action;
          break;
        }
      }

      if (previousAction) {
        const lastTurnData = turnData[turnData.length - 1];
        if (previousAction.text !== lastTurnData.actionText) {
          const {lastTT} = getLastTurnTimeAndChars(history);
          if (lastTT.years > 0 || lastTT.months > 0 || lastTT.days > 0 || lastTT.hours > 0 || lastTT.minutes > 0 || lastTT.seconds > 0) {
            cleanupWTGDataCardByTimestamp(lastTT);
          }
        }
      }
    }

    // Get turn data again after potential cleanup
    const currentTurnData = getTurnData();

    // Get keywords for dynamic time
    let lastKeywords = [];
    let secondLastKeywords = [];

    if (currentTurnData.length >= 1) {
      lastKeywords = extractKeywords(currentTurnData[currentTurnData.length - 1].actionText + ' ' + (currentTurnData[currentTurnData.length - 1].responseText || ''));
    }

    if (currentTurnData.length >= 2) {
      secondLastKeywords = extractKeywords(currentTurnData[currentTurnData.length - 2].actionText + ' ' + (currentTurnData[currentTurnData.length - 2].responseText || ''));
    }

    const currentKeywords = extractKeywords(modifiedText);
    const similarity1 = calculateKeywordSimilarity(lastKeywords, currentKeywords);
    const similarity2 = calculateKeywordSimilarity(secondLastKeywords, currentKeywords);

    // Check if a command (advance/sleep) just modified turnTime - if so, skip recalculation
    // The modified input isn't in history yet, so we'd incorrectly overwrite the command's value
    // Note: Don't delete the flag here - output.js also needs it and will clean it up
    const skipTimeRecalc = state.turnTimeModifiedByCommand;

    // Get character count from history for time adjustment
    const {lastTT, charsAfter, found: markerFound} = getLastTurnTimeAndChars(history);

    // Check if lastTT came from the most recent action
    let useLastTTDirectly = false;
    if (history.length > 0) {
      const lastActionText = history[history.length - 1].text;
      if (lastActionText.match(new RegExp(`\\[\\[(${WTG_TURN_TIME_PATTERN})\\]\\]$`))) {
        useLastTTDirectly = true;
      }
    }

    let additionalMinutes = 0;

    if (skipTimeRecalc) {
      // Command just set turnTime - don't overwrite it
      // state.turnTime, currentDate, currentTime are already correct from input.js
    } else if (useLastTTDirectly) {
      state.turnTime = lastTT;
      const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
      state.currentDate = currentDate;
      state.currentEra = currentEra;
      state.currentTime = currentTime;
      state.changed = true;
    } else if (markerFound) {
      const timeMultiplier = getTimeMultiplier();
      additionalMinutes = Math.floor((charsAfter / 700) * timeMultiplier);

      if (getWTGBooleanSetting("Enable Dynamic Time")) {
        if (similarity1 > 0.3 || similarity2 > 0.3) {
          additionalMinutes = Math.max(1, Math.floor(additionalMinutes * 0.7));
        } else if (similarity1 < 0.1 && similarity2 < 0.1) {
          additionalMinutes = Math.floor(additionalMinutes * 1.3);
        }
      }

      if (additionalMinutes > 0) {
        state.turnTime = addToTurnTime(lastTT, {minutes: additionalMinutes});
        state.changed = true;
      }
      const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
      state.currentDate = currentDate;
      state.currentEra = currentEra;
      state.currentTime = currentTime;
    } else {
      if (state.turnTime && state.startingTime !== 'Unknown') {
        const timeMultiplier = getTimeMultiplier();
        additionalMinutes = Math.floor((charsAfter / 700) * timeMultiplier);

        if (getWTGBooleanSetting("Enable Dynamic Time")) {
          if (similarity1 > 0.3 || similarity2 > 0.3) {
            additionalMinutes = Math.max(1, Math.floor(additionalMinutes * 0.7));
          } else if (similarity1 < 0.1 && similarity2 < 0.1) {
            additionalMinutes = Math.floor(additionalMinutes * 1.3);
          }
        }

        if (additionalMinutes > 0) {
          state.turnTime = addToTurnTime(state.turnTime, {minutes: additionalMinutes});
          const {currentDate, currentEra, currentTime} = computeCurrent(state.startingDate || '01/01/1900', state.startingTime || 'Unknown', state.turnTime, state.startingEra);
          state.currentDate = currentDate;
          state.currentEra = currentEra;
          state.currentTime = currentTime;
          state.changed = true;
        }
      }
    }

    // Clean up WTG Data card by removing entries with timestamps higher than current turn time
    cleanupWTGDataCardByTimestamp(state.turnTime);

    // Clean up storycards with future timestamps (only if date/time are initialized)
    if (state.currentDate && state.currentTime && state.currentDate !== '01/01/1900') {
      cleanupStoryCardsByTimestamp(state.currentDate, state.currentTime);
    }

    state.insertMarker = (charsAfter >= 7000);

    let instructions = `Do not recreate or reference any system commands such as [settime], [advance], or [reset].`;

    // Add scratchpad with AI command instructions if Dynamic Time is enabled
    if (getWTGBooleanSetting("Enable Dynamic Time")) {
      let sleepInstruction = "When the user decides to sleep on the previous turn, start the action with (sleep X units) where X is a number and units can be hours, minutes, days, weeks, months, or years.";
      let advanceInstruction = "When a notable chunk of time passes in the adventure, start the action with (advance X units) using the same format.";

      instructions = `${instructions} \n${sleepInstruction} \n${advanceInstruction}`;
    }

    // Add current date and time to context (only if settime has been initialized)
    let dateTimeInjection = '';
    if (state.settimeInitialized && state.currentDate !== '01/01/1900' && state.currentTime !== 'Unknown') {
      dateTimeInjection = `Current date: ${getCurrentDateDisplay()}; Current time: ${state.currentTime}`;
    }

    let additionalAuthorsNote = `${instructions}\n${dateTimeInjection}`;

    // Find the [Author's note: ...] section and inject the date/time info inside the [] if it exists, otherwise add one and insert it a paragraph back from the end of the text.
    const authorsNoteMatch = modifiedText.match(/\[Author's note:.*?\]/);
    if (authorsNoteMatch) {
      const fullMatch = authorsNoteMatch[0];
      const modifiedAuthorsNote = fullMatch.slice(0, -1) + `${additionalAuthorsNote}]`;
      modifiedText = modifiedText.replace(fullMatch, modifiedAuthorsNote);
    } else if (dateTimeInjection) {
      // Add a new [Author's note: ...] section with the date/time info a paragraph back from the end
      const paragraphs = modifiedText.split('\n\n');
      if (paragraphs.length > 1) {
        paragraphs.splice(paragraphs.length - 1, 0, `[Author's note: ${additionalAuthorsNote}]`);
        modifiedText = paragraphs.join('\n\n');
      } else {
        modifiedText += `\n\n[Author's note: ${additionalAuthorsNote}]`;
      }
    }
  }

  // ========== INNER-SELF CONTEXT PROCESSING ==========
  globalThis.text = modifiedText;
  InnerSelf('context');
  modifiedText = globalThis.text;

  return { text: modifiedText, stop };
};

modifier(text);
