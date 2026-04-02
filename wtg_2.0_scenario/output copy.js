// ========== WTG 2.0 SCENARIO - OUTPUT SCRIPT ==========
// Paste this ONLY into the OUTPUT tab in AI Dungeon scripting
// =======================================================

// output.js - Handle AI responses and update storycards for WTG with mode switching

// Performance safeguard: limit storycard processing for scenarios with many cards
const MAX_STORYCARDS_TO_PROCESS = 200;

// System card titles Set for O(1) lookups
const SYSTEM_CARD_TITLES = new Set([
  "WTG Data", "Current Date and Time", "World Time Generator Settings",
  "WTG Cooldowns", "WTG Exclusions", "WTG Time Config"
]);

const modifier = (text) => {
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  if (state.pendingTimeCommandOutput) {
    const pendingTimeCommandOutput = state.pendingTimeCommandOutput;
    delete state.pendingTimeCommandOutput;
    return { text: ensureLeadingSpace(pendingTimeCommandOutput) };
  }

  if (state.timeCommandUsed) {
    delete state.timeCommandUsed;
    const ttMarker = formatTurnTime(state.turnTime);
    const fallbackTimeMessage = `[SYSTEM] Current Date and Time: ${getCurrentDateDisplay()} ${state.currentTime}. [[${ttMarker}]]`;
    return { text: ensureLeadingSpace(fallbackTimeMessage) };
  }

  // Initialize mode if not set (default to lightweight)
  if (!state.wtgMode) {
    state.wtgMode = 'lightweight';
  }

  ensureWTGEras();

  // Mirror input.js initialization so startup settime detection works on a cold start.
  if (state.startingDate === undefined) {
    state.startingDate = '01/01/1900';
    state.startingEra = DEFAULT_WTG_ERA;
    state.startingTime = 'Unknown';
    state.currentDate = '01/01/1900';
    state.currentEra = DEFAULT_WTG_ERA;
    state.currentTime = 'Unknown';
    state.settimeInitialized = false;
  }

  let modifiedText = text;

  // Check if WTG is disabled entirely (Normal mode only)
  if (!isLightweightMode() && getWTGBooleanSetting("Disable WTG Entirely")) {
    return {text: text};
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
    }
  }

  // Fallback: Check for [settime] command in storycards at startup
  if (state.startingDate === '01/01/1900' && !state.settimeInitialized) {
    // Scan all storycards for a startup [settime] command.
    storycardLoop: for (const card of storyCards) {
      if (!card) continue;

      for (const field of ['entry', 'value']) {
        const cardText = typeof card[field] === 'string' ? card[field] : '';
        if (!cardText) continue;

        const settimeMatch = cardText.match(/\[settime\s+([^\]]+?)\]/i);
        if (!settimeMatch) continue;

        const settimeArgs = settimeMatch[1].trim().split(/\s+/);
        const dateStr = settimeArgs[0];
        const timeStr = settimeArgs.slice(1).join(' ');
        const parsedSettime = normalizeSettimeArgs(dateStr, timeStr, DEFAULT_WTG_ERA);

        if (!parsedSettime) continue;

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

        // Remove the [settime] command from the matched field.
        card[field] = cardText.replace(/\[settime\s+[^\]]+?\]/i, '').trim();

        // Skip the opening prompt and let AI respond
        // Don't return here, just continue to normal processing
        break storycardLoop;
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
    if (!isLightweightMode()) {
      getWTGDataCard();
    }
    state.changed = true;
  }

  // If settime has NOT been initialized and we're at the start, inject the prompt
  if (!hasSettimeBeenInitialized() && state.startingDate === '01/01/1900' && state.startingTime === 'Unknown') {
    state.initialMessageShown = true;
    modifiedText = ' Enter these commands as a story action. Use [settime MM/DD/YYYY H:MM AM/PM AD] to set a custom starting date, era, and time. Example: [settime 06/15/2023 8:00 AM AD]. For BC dates, use something like [settime 03/15/44 9:00 AM BC]. If you leave the era off, for example [settime 06/15/2023 8:00 AM], it defaults to AD. Years can be 1-6 digits (for example 7 or 44).\n\nUse [normal] to enable character/location detection, or [light] for simple time tracking. Lightweight mode is recommended for free users and Llama models.\n\nTo report bugs, message me on discord: thedenial. (it has a period at the end of it)';
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

    // Process any existing turn time marker in the text
    // NOTE: Time calculation is handled in context.js - do NOT recalculate here
    const ttMatch = modifiedText.match(/\[\[(.*?)\]\]$/);
    let parsedTT = ttMatch ? parseTurnTime(ttMatch[1]) : null;
    let narrative = ttMatch ? modifiedText.replace(/\[\[.*\]\]$/, '').trim() : modifiedText.trim();

    // Add warning if AI altered turn time metadata
    if (parsedTT) {
      const currentTTForm = formatTurnTime(state.turnTime);
      if (ttMatch[1] !== currentTTForm) {
        modifiedText += '\n[Warning: Turn time metadata altered by AI. Please retry.]';
      }
    }

    // Update text without turn time marker
    modifiedText = narrative;

    // Add timestamps to existing storycards that don't have them
    if (hasSettimeBeenInitialized()) {
      // Note: Current Date and Time card is updated via updateDateTimeCard(), not here
      // (It's a system card that displays time directly, not a discovery card)

      // Combine the player's action and AI's output for keyword detection
      const combinedText = (lastAction ? lastAction.text : '') + ' ' + modifiedText;

      // Limit storycard processing for performance (scenarios with many cards)
      const maxTimestampCards = Math.min(storyCards.length, MAX_STORYCARDS_TO_PROCESS);
      for (let i = 0; i < maxTimestampCards; i++) {
        const card = storyCards[i];
        if (!card) continue;
        // Skip system cards
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
      // Extract first two sentences of AI response for responseText
      const firstTwoSentences = narrative.match(/^[^.!?]*[.!?][^.!?]*[.!?]/) || [narrative.substring(0, 200)];
      const responseText = firstTwoSentences[0].trim();
      addTurnData(actionType, lastAction.text, timestamp, responseText);
    }

    // Update the Current Date and Time storycard if needed
    if (state.changed || info.actionCount === 1 || info.actionCount % 5 === 0) {
      updateDateTimeCard();
      delete state.changed;
    }

    delete state.insertMarker;
    // Clean up the command flag (set by input.js, used by context.js and output.js)
    delete state.turnTimeModifiedByCommand;

    return {text: ensureLeadingSpace(modifiedText)};
  }

  // ========================================================================
  // NORMAL MODE
  // ========================================================================

  // Update storycard entries for characters detected in the previous turn
  if (state.pendingCharacterEntries) {
    let lastAction = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const action = history[i];
      if (action.type === "do" || action.type === "say" || action.type === "story") {
        lastAction = action;
        break;
      }
    }
    
    if (lastAction) {
      const entryText = lastAction.text;
      let allProcessed = true;
      for (const name in state.pendingCharacterEntries) {
        if (state.pendingCharacterEntries[name]) {
          const card = storyCards.find(c => c.title === name);
          if (card) {
            card.entry = entryText.substring(0, 200) + (entryText.length > 200 ? '...' : '');
          }
          state.pendingCharacterEntries[name] = false;
        }
        if (state.pendingCharacterEntries[name]) {
          allProcessed = false;
        }
      }
      if (allProcessed) {
        delete state.pendingCharacterEntries;
      }
    }
  }

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
  
  let generatedEntities = [];

  // ========================================================================
  // ENTITY DETECTION AND STORYCARD CREATION (NORMAL MODE)
  // ========================================================================
  {
    let fullTurnOutput = "";
    if (lastAction) {
      fullTurnOutput = `Player: ${lastAction.text}\nAI: ${text}`;
    } else {
      fullTurnOutput = text;
    }

    const commandBlacklist = [
      'settime', 'advance', 'reset', 'sleep', 'help', 'status', 'time', 'date',
      'config', 'settings', 'debug', 'test', 'version', 'info', 'list', 'show',
      'clear', 'delete', 'remove', 'add', 'create', 'update', 'modify', 'change',
      'sleep', 'advance', 'light', 'normal',
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

    const isBlacklistedCommand = (entityName) => {
      const lowerName = entityName.toLowerCase().trim();
      // Check for exact match with blacklist (important for pronouns to avoid false positives)
      return commandBlacklist.some(cmd => lowerName === cmd);
    };

    const isDuplicateEntityName = (newName, existingCards) => {
      const newNameLower = newName.toLowerCase().trim();
      const newNameWords = newNameLower.split(/\s+/);

      for (const card of existingCards) {
        const existingNameLower = card.title.toLowerCase().trim();
        const existingNameWords = existingNameLower.split(/\s+/);

        if (existingNameLower.includes(newNameLower)) {
          return { isDuplicate: true, existingCard: card };
        }

        if (newNameLower.includes(existingNameLower)) {
          return { isDuplicate: true, existingCard: card };
        }

        const commonWords = newNameWords.filter(word =>
          existingNameWords.some(existingWord =>
            existingWord.includes(word) || word.includes(existingWord)
          )
        );

        if (commonWords.length > 0 && (commonWords.length / Math.max(newNameWords.length, existingNameWords.length)) > 0.5) {
          return { isDuplicate: true, existingCard: card };
        }
      }

      return { isDuplicate: false, existingCard: null };
    };

    const extractContextualSentences = (text, entityName, sentencesBefore = 2, sentencesAfter = 2) => {
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const entityIndex = sentences.findIndex(sentence =>
        sentence.toLowerCase().includes(entityName.toLowerCase())
      );

      if (entityIndex === -1) {
        return text.substring(0, 300) + (text.length > 300 ? '...' : '');
      }

      const startIndex = Math.max(0, entityIndex - sentencesBefore);
      const endIndex = Math.min(sentences.length - 1, entityIndex + sentencesAfter);
      const contextualSentences = sentences.slice(startIndex, endIndex + 1);

      return contextualSentences.join('. ').trim() + '.';
    };

    generatedEntities = [];
    const existingEntities = [];

    // Parse double-parentheses locations
    const enableLocationCards = getWTGBooleanSetting("Enable Generated Location Cards");
    if (enableLocationCards) {
      const doubleParenRegex = /(?<!\()(\(\()([^\(\)]+?)(\)\))(?!\))/g;
      let doubleParenMatch;
      while ((doubleParenMatch = doubleParenRegex.exec(text)) !== null) {
        const entity = doubleParenMatch[2];
        if (entity.length >= 2) {
          const sanitized = sanitizeEntityName(entity);
          const title = normalizeNameCase(sanitized);

          if (isBlacklistedCommand(title)) {
            continue;
          }

          const duplicateCheck = isDuplicateEntityName(title, storyCards.filter(c => c.type === "location"));
          if (duplicateCheck.isDuplicate) {
            existingEntities.push({name: title, type: "location", card: duplicateCheck.existingCard});
          } else {
            generatedEntities.push({name: title, type: "location"});
          }
        }
      }
    }

    // Parse single-parentheses characters
    const enableCharacterCards = getWTGBooleanSetting("Enable Generated Character Cards");
    if (enableCharacterCards) {
      const singleParenRegex = /(?<!\()(\()([^\(\)]+?)(\))(?!\))/g;
      let singleParenMatch;
      while ((singleParenMatch = singleParenRegex.exec(text)) !== null) {
        const entity = singleParenMatch[2];
        if (entity.length >= 2) {
          const sanitized = sanitizeEntityName(entity);
          const title = normalizeNameCase(sanitized);

          if (isBlacklistedCommand(title)) {
            continue;
          }

          const duplicateCheck = isDuplicateEntityName(title, storyCards.filter(c => c.type === "character"));
          if (duplicateCheck.isDuplicate) {
            existingEntities.push({name: title, type: "character", card: duplicateCheck.existingCard});
          } else {
            generatedEntities.push({name: title, type: "character"});
          }
        }
      }
    }

    // Create discovery card if multiple new entities are introduced
    if (generatedEntities.length > 1) {
      const entityNames = generatedEntities.map(e => e.name);
      const discoveryCardTitle = `${entityNames.join(', ')} Discovery Action`;

      const discoveryCard = findOrCreateCard(discoveryCardTitle);
      if (discoveryCard) {
        discoveryCard.type = "discovery";
        discoveryCard.keys = entityNames.join(',');
        discoveryCard.entry = fullTurnOutput;

        if (!hasTimestamp(discoveryCard)) {
          addTimestampToCard(discoveryCard, getCurrentTimestampDisplay(), true);
        }
      }

      for (const entity of generatedEntities) {
        const keys = normalizeKeysFor(entity.name);
        const card = findOrCreateCard(entity.name);
        if (card) {
          card.type = entity.type;
          card.keys = keys.join(',');
          card.entry = `Discovered in: ${discoveryCardTitle}`;
          if (!hasTimestamp(card)) {
            addTimestampToCard(card, getCurrentTimestampDisplay(), true);
          }
        }
      }
    } else if (generatedEntities.length === 1) {
      const entity = generatedEntities[0];
      const keys = normalizeKeysFor(entity.name);
      const card = findOrCreateCard(entity.name);
      if (card) {
        card.type = entity.type;
        card.keys = keys.join(',');
        card.entry = extractContextualSentences(text, entity.name, 2, 2);
        if (!hasTimestamp(card)) {
          addTimestampToCard(card, getCurrentTimestampDisplay(), true);
        }
      }
    }

    for (const entity of existingEntities) {
      if (!hasTimestamp(entity.card)) {
        addTimestampToCard(entity.card, getCurrentTimestampDisplay());
      }
    }

    // Parse triple-parentheses descriptions and inject into storycards
    const tripleParenRegex = /(?<!\()(\(\(\()([^\(\)]+?)(\)\)\))(?!\))/g;
    let tripleParenMatch;
    while ((tripleParenMatch = tripleParenRegex.exec(text)) !== null) {
      const content = tripleParenMatch[2];
      const entityDescMatch = content.match(/^(\([^()]+\)|\(\([^()]+\)\))\s+(.+)$/);
      if (entityDescMatch) {
        const entityPart = entityDescMatch[1];
        const description = entityDescMatch[2];

        let entityName = '';
        let entityType = '';

        if (entityPart.startsWith('((') && entityPart.endsWith('))')) {
          entityName = entityPart.substring(2, entityPart.length - 2);
          entityType = 'location';
        } else if (entityPart.startsWith('(') && entityPart.endsWith(')')) {
          entityName = entityPart.substring(1, entityPart.length - 1);
          entityType = 'character';
        }

        if (entityName) {
          const sanitizedName = sanitizeEntityName(entityName);
          const titleCaseName = normalizeNameCase(sanitizedName);
          const card = storyCards.find(c => c.title && c.title.toLowerCase() === titleCaseName.toLowerCase());

          if (card) {
            if (card.entry && !card.entry.includes(description)) {
              card.entry += `\n\n${description}`;
            }
          }
        }
      }
    }
  }

  // ========================================================================
  // TIME COMMANDS DETECTION (NORMAL MODE)
  // ========================================================================
  
  let leadingCommandDetected = false;
  const leadingCommandMatch = modifiedText.match(/^\s*\((sleep|advance)\s+(\d+)\s+(\w+)\)/i);
  
  if (leadingCommandMatch) {
    leadingCommandDetected = true;
    const commandType = leadingCommandMatch[1].toLowerCase();
    const amount = parseInt(leadingCommandMatch[2], 10);
    const unit = leadingCommandMatch[3].toLowerCase();

    const shouldProcessCommand = !(
      (commandType === 'sleep' && isSleepCooldownActive()) ||
      (commandType === 'advance' && isAdvanceCooldownActive())
    );

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
        const { currentDate, currentEra, currentTime } = computeCurrent(state.startingDate, state.startingTime, state.turnTime, state.startingEra);
        state.currentDate = currentDate;
        state.currentEra = currentEra;
        state.currentTime = currentTime;
        state.changed = true;

        if (commandType === 'sleep') {
          setSleepCooldown({hours: 8});
          state.aiCommandThisTurn = `sleep ${amount} ${unit}`;
        } else {
          setAdvanceCooldown({minutes: 5});
          state.aiCommandThisTurn = `advance ${amount} ${unit}`;
        }
      }
    }
  }

  // Remove commands if cooldown is active or debug mode is false
  const shouldRemoveAllCommands = !getWTGBooleanSetting("Debug Mode") || isSleepCooldownActive() || isAdvanceCooldownActive();
  
  if (leadingCommandDetected) {
    modifiedText = modifiedText.replace(/^\s*\((sleep|advance)\s+\d+\s+\w+\)\s*/i, '');
  }

  if (shouldRemoveAllCommands) {
    // Use broad regex to catch any (sleep ...) or (advance ...) commands,
    // including malformed ones like (sleep 00y00m00d00h00n03s)
    modifiedText = modifiedText
      .replace(/\((?:sleep|advance)[^)]*\)/gi, '')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  // Strip parentheses for display (unless debug mode is enabled)
  const debugMode = getWTGBooleanSetting("Debug Mode");
  if (!debugMode) {
    // First pass: Triple parentheses - extract entity name
    modifiedText = modifiedText.replace(/\(\(\(.*?\)\)\)/gs, function(match) {
      const innerMatch = match.match(/\(\(\(([^)]+?)\)/);
      return innerMatch ? innerMatch[1] : '';
    });

    // Second pass: Double parentheses - keep location name
    modifiedText = modifiedText.replace(/\(\(([^)]+?)\)\)/g, '$1');

    // Third pass: Single parentheses - keep character name
    modifiedText = modifiedText.replace(/\((?!(?:sleep|advance)\s)([^)]+?)\)/g, '$1');
  }

  // Add turn data record
  if (lastAction && actionType !== "continue") {
    const timestamp = formatTurnTime(state.turnTime);
    const firstTwoSentences = text.match(/^[^.!?]*[.!?][^.!?]*[.!?]/) || [''];
    const responseText = firstTwoSentences[0].trim();
    const triggerMentions = state.currentTurnTriggers ? state.currentTurnTriggers.map(trigger => ({
      cardTitle: 'Unknown',
      trigger: trigger
    })) : [];
    const aiCommand = state.aiCommandThisTurn || null;
    addTurnData(actionType, lastAction.text, timestamp, responseText, generatedEntities, triggerMentions, aiCommand);
    delete state.aiCommandThisTurn;
  }

  state.currentTurnTriggers = [];

  // Add timestamps to storycards whose keywords are mentioned
  if (hasSettimeBeenInitialized()) {
    // Combine the player's action and AI's output for keyword detection
    const combinedText = (lastAction ? lastAction.text : '') + ' ' + modifiedText;

    // Limit storycard processing for performance (scenarios with many cards)
    const maxTimestampCards = Math.min(storyCards.length, MAX_STORYCARDS_TO_PROCESS);
    for (let i = 0; i < maxTimestampCards; i++) {
      const card = storyCards[i];
      if (!card) continue;
      if (card.title === "WTG Data" || card.title === "Current Date and Time" || card.title === "World Time Generator Settings" || card.title === "WTG Cooldowns" || card.title === "WTG Exclusions") {
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

  // Update the Current Date and Time storycard if needed
  if (state.changed || info.actionCount === 1 || info.actionCount % 5 === 0) {
    updateDateTimeCard();
    delete state.changed;
  }

  // Insert turn time marker if needed
  if (state.insertMarker) {
    const ttForm = formatTurnTime(state.turnTime);
    modifiedText += ` [[${ttForm}]]`;
  }

  delete state.insertMarker;
  // Clean up the command flag (set by input.js, used by context.js and output.js)
  delete state.turnTimeModifiedByCommand;

  // Ensure the modified text starts with a space
  modifiedText = ensureLeadingSpace(modifiedText);

  return {text: modifiedText};
};

modifier(text);
