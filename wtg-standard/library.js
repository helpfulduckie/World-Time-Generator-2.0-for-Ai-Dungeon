// ============================================================
// ========== World Time Generator - 3.0.4 - library ==========
// ============================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.3
// - RevampedHistory@1.2.2
// - WorldTimeGenerator@3.0.4
// ============================================================
// Paste this ONLY into the library tab in AI Dungeon scripting
// ============================================================

class UnifiedSettings {
  static #lib = (() => {
    // In the AID built class, extractAllFunctions() skips these non-function lines;
    // a companion state file provides the same names in #lib and rewriteLibCalls()
    // rewrites all references to use #lib.name inside the class body.
    let _registry = {};
    // Shape: {
    //    [modName]: {
    //      description,
    //      card,
    //      field,     // 'entry' | 'description' | '' (empty = inherit default)
    //      position,  // 1–9 (decimals OK); render order on card; default 5; insertion order breaks ties
    //      groups: {
    //        [groupName]: {
    //          description,
    //          card,
    //          field,     // overrides mod field; '' = inherit
    //          position,  // 1–9 (decimals OK); render order within mod; default 5
    //          settings: [
    //            {internalKey, key, defaultValue, description, valueType}
    //          ]
    //        }
    //      }
    //    }
    //  }
    
    const _defaultCard  = "Configure WTG";
    const _defaultGroup = "main";
    const _defaultField = "entry";
    
    
    // ===========================================================================
    // CORE UTILITIES
    // ===========================================================================
    
    /**
     * Normalizes a raw value string against the canonical default for that setting.
     * Type is inferred from the default value:
     *   "true"/"false"      → boolean (synonyms accepted; normalised to "true"/"false")
     *   parseable as float  → numeric (preserved as-is if valid, else null)
     *   anything else       → string  (trimmed; always succeeds)
     * Returns null when the raw value is invalid for the inferred type.
     * @param {string} rawValue
     * @param {string} defaultValue
     * @returns {string|null}
     */
    function _normalizeValue(rawValue, defaultValue) {
      const raw = (rawValue ?? '').trim();
      const def = (defaultValue ?? '').trim();
    
      if (/^\[[\s\S]*\]$/.test(def)) {
        const parsed = _parseArray(raw);
        if (parsed === null) return null;
        return _serializeArray(parsed);
      }
    
      if (/^(true|false)$/i.test(def)) {
        if (/^(true|yes|on|t|1|enable|enabled)$/i.test(raw))    return 'true';
        if (/^(false|no|off|f|0|disable|disabled)$/i.test(raw)) return 'false';
        return null;
      }
    
      const defFloat = parseFloat(def);
      if (!isNaN(defFloat) && isFinite(defFloat)) {
        const n = parseFloat(raw);
        if (!isNaN(n) && isFinite(n)) return raw;
        return null;
      }
    
      // Backtick-wrapped string: strip the delimiters and preserve interior content.
      if (raw[0] === '`' && raw[raw.length - 1] === '`' && raw.length >= 2) {
        return raw.slice(1, -1);
      }
    
      return raw;
    }
    
    /**
     * Parses an array literal string into an array of strings.
     * Syntax: [ item1, "item, with comma", `item with "quote"` ]
     * Backtick-quoted items may contain double-quotes.
     * Double-quoted items may contain commas and brackets.
     * Unquoted items are trimmed.
     * Returns null on malformed input.
     * @param {string} raw
     * @returns {string[]|null}
     */
    function _parseArray(raw) {
      const s = (raw || '').trim();
      if (s[0] !== '[' || s[s.length - 1] !== ']') return null;
      const inner = s.slice(1, -1);
      if (inner.trim() === '') return [];
    
      const result = [];
      let i = 0;
    
      while (i <= inner.length) {
        // skip whitespace
        while (i < inner.length && /\s/.test(inner[i])) i++;
        if (i >= inner.length) break;
    
        const ch = inner[i];
        if (ch === '`') {
      // backtick-quoted: read until closing `
          i++;
          const start = i;
          while (i < inner.length && inner[i] !== '`') i++;
      if (i >= inner.length) return null; // unclosed
      result.push(inner.slice(start, i));
      i++; // consume closing `
        } else if (ch === '"') {
          // double-quoted: read until closing "
          i++;
          const start = i;
          while (i < inner.length && inner[i] !== '"') i++;
          if (i >= inner.length) return null; // unclosed
          result.push(inner.slice(start, i));
          i++; // consume closing "
        } else {
          // unquoted: read until comma
          const start = i;
          while (i < inner.length && inner[i] !== ',') i++;
          result.push(inner.slice(start, i).trim());
        }
    
        // after item: skip whitespace, then expect comma or end
        while (i < inner.length && /\s/.test(inner[i])) i++;
        if (i >= inner.length) break;
        if (inner[i] !== ',') return null; // unexpected character
        i++; // consume comma
      }
    
      return result;
    }
    
    /**
     * Serializes a string array to canonical array literal form.
     * Items containing newlines or " are backtick-quoted.
     * Items containing , [ or ] are double-quoted.
     * Other items are written bare.
     * @param {string[]} arr
     * @returns {string}
     */
    function _serializeArray(arr) {
      const parts = arr.map(function(item) {
        if (item.indexOf('\n') !== -1 || item.indexOf('"') !== -1)       return '`' + item + '`';
        if (item.indexOf(',') !== -1 || item.indexOf('[') !== -1 || item.indexOf(']') !== -1) return '"' + item + '"';
        return item;
      });
      return '[' + parts.join(', ') + ']';
    }
    
    // Strips a string to lowercase alpha only for fuzzy title comparison.
    function _simplify(s) {
      return (s || '').toLowerCase().replace(/[^a-z]+/g, '');
    }
    
    /**
     * Bargain-bin Levenshtein — adapted from Inner Self Config.get().
     * Returns true when current and target differ by at most maxMistakes
     * insertions, deletions, or substitutions (on the simplified strings).
     * @param {string} current   Simplified card title to test
     * @param {string} target    Simplified target title
     * @param {number} maxMistakes
     * @returns {boolean}
     */
    function _fuzzyMatchTitle(current, target, maxMistakes) {
      if (maxMistakes === undefined) maxMistakes = 2;
      let mistakes = 0;
      let t = 0;
      let c = 0;
      while (t < target.length && c < current.length) {
        if (current[c] === target[t]) {
          t++; c++;
          continue;
        }
        if (maxMistakes <= mistakes) return false;
        mistakes++;
        if      (current[c + 1] === target[t]) c++;
        else if (current[c] === target[t + 1]) t++;
        else { t++; c++; }
      }
      mistakes += (target.length - t) + (current.length - c);
      return mistakes <= maxMistakes;
    }
    
    /**
     * Finds a storycard whose title fuzzy-matches the given title.
     * Returns the card object or null if not found.
     * @param {string} title
     * @returns {Object|null}
     */
    function _fuzzyFindCard(title) {
      const target = _simplify(title);
      for (let i = 0; i < storyCards.length; i++) {
        const card = storyCards[i];
        if (!card || typeof card.title !== 'string') continue;
        if (_fuzzyMatchTitle(_simplify(card.title), target)) return card;
      }
      return null;
    }
    
    /**
     * Parses `> Key: Value` (and plain `Key: Value`) lines from card entry text.
     * First occurrence of each key wins (deduplicates).
     * Values that start with `[` but have no matching `]` on the same line are
     * continued across subsequent lines until the bracket is closed.
     * @param {string} entryText
     * @returns {Object} Plain key→rawValue map
     */
    function _parseCardEntry(entryText) {
      const parsed = {};
      const lines = (entryText || '').split('\n');
      let i = 0;
      while (i < lines.length) {
        const stripped = lines[i].replace(/^>\s*/, '');
        i++;
        const colon = stripped.indexOf(':');
        if (colon === -1) continue;
        const key = stripped.slice(0, colon).trim();
        let val = stripped.slice(colon + 1).trim();
        if (!key) continue;
    
        // Consume continuation lines for multi-line values.
        if (val[0] === '[') {
          // Array: keep reading until the closing ] appears.
          while (val.indexOf(']') === -1 && i < lines.length) {
            val += '\n' + lines[i];
            i++;
          }
        } else if (val[0] === '`') {
      // Backtick string: keep reading until a second ` appears.
          while (val.indexOf('`', 1) === -1 && i < lines.length) {
        val += '\n' + lines[i];
        i++;
      }
    }

    if (!(key in parsed)) parsed[key] = val;
  }
  return parsed;
}

/**
 * Parses a card field into sections keyed by mod name and group name.
 * Section boundaries are `- ModName` and `-- GroupName` header lines.
 * The `|` separator splits the name from an optional description.
 * Old-format cards using ` - ` as separator are also handled.
 * @param {string} entryText
 * @returns {Object} { [modName]: { [groupName]: { [key]: rawValue } } }
 */

function _parseCardSections(entryText) {
  const sections = {};
  let currentMod = null;
  let currentGroup = _defaultGroup;
  const lines = (entryText || '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]; i++;
    if (/^-(?!-)\s/.test(line)) {
      const rest = line.slice(line.indexOf(' ') + 1).trim();
      const sep = rest.indexOf(' | ');
      currentMod = sep !== -1 ? rest.slice(0, sep) : rest;
      currentGroup = _defaultGroup;
      if (!sections[currentMod]) sections[currentMod] = {};
      if (!sections[currentMod][currentGroup]) sections[currentMod][currentGroup] = {};
      continue;
    }
    if (/^--\s/.test(line)) {
      if (!currentMod) continue;
      const rest = line.slice(line.indexOf(' ') + 1).trim();
      const sep = rest.indexOf(' | ');
      currentGroup = sep !== -1 ? rest.slice(0, sep) : rest;
      if (!sections[currentMod][currentGroup]) sections[currentMod][currentGroup] = {};
      continue;
    }
    if (currentMod === null) continue;
    const stripped = line.replace(/^>\s*/, '');
    const colon = stripped.indexOf(':');
    if (colon === -1) continue;
    const key = stripped.slice(0, colon).trim();
    let val = stripped.slice(colon + 1).trim();
    if (!key) continue;
    if (val[0] === '[') {
      while (val.indexOf(']') === -1 && i < lines.length) { val += '\n' + lines[i]; i++; }
    } else if (val[0] === '`') {
          while (val.indexOf('`', 1) === -1 && i < lines.length) { val += '\n' + lines[i]; i++; }
    }
    const target = sections[currentMod][currentGroup];
    if (!(key in target)) target[key] = val;
  }
  return sections;
}

// Returns the string with all regex special characters escaped.

function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns the effective card title for a given mod+group pair.

function _effectiveCard(modName, groupName) {
  const modData   = _registry[modName];
  const groupData = modData && modData.groups && modData.groups[groupName];
  return (groupData && groupData.card) || (modData && modData.card) || _defaultCard;
}

// Returns the effective card field ('entry' or 'description') for a given mod+group pair.

function _effectiveField(modName, groupName) {
  const modData   = _registry[modName];
  const groupData = modData && modData.groups && modData.groups[groupName];
  return (groupData && groupData.field) || (modData && modData.field) || _defaultField;
}


// ===========================================================================
// STATE CACHE HELPERS
// ===========================================================================

function _ensureState() {
  if (!state.unifiedSettings || typeof state.unifiedSettings !== 'object') {
    state.unifiedSettings = {};
  }
  return state.unifiedSettings;
}

function _getCached(modName, groupName, internalKey) {
  const us = _ensureState();
  return (us[modName] && us[modName][groupName]) ? us[modName][groupName][internalKey] : undefined;
}

function _setCached(modName, groupName, internalKey, value) {
  const us = _ensureState();
  if (!us[modName])            us[modName] = {};
  if (!us[modName][groupName]) us[modName][groupName] = {};
  us[modName][groupName][internalKey] = value;
}


// ===========================================================================
// REGISTRY STATE ACCUMULATION
// ===========================================================================

/**
 * Merges state.unifiedSettings._registry into the module-level _registry.
 * Called at the top of ensureSettingCardsExist so registrations from prior
 * hooks (which reset the module-level _registry on re-evaluation) are
 * restored. Existing _registry entries are not overwritten.
 */

function _mergeStateRegistryIntoLocal() {
  const us = _ensureState();
  const sr = us._registry;
  if (!sr || typeof sr !== 'object') return;
  for (const modName of Object.keys(sr)) {
    const sm = sr[modName];
    if (!_registry[modName]) {
      _registry[modName] = {
        description: sm.description || '',
        card:        sm.card        || _defaultCard,
        field:       sm.field       || '',
        position:    typeof sm.position === 'number' ? sm.position : 5,
        groups:      {},
      };
    }
    const lm = _registry[modName];
    const sg = sm.groups || {};
    for (const groupName of Object.keys(sg)) {
      const sgroup = sg[groupName];
      if (!lm.groups[groupName]) {
        lm.groups[groupName] = {
          description: sgroup.description || '',
          card:        sgroup.card        || null,
          field:       sgroup.field       || '',
          position:    typeof sgroup.position === 'number' ? sgroup.position : 5,
          settings:    [],
        };
      }
      const lgroup = lm.groups[groupName];
      for (const setting of (sgroup.settings || [])) {
        if (!lgroup.settings.find(function(s) { return s.internalKey === setting.internalKey; })) {
          lgroup.settings.push({
            internalKey:  setting.internalKey,
            key:          setting.key,
            defaultValue: setting.defaultValue,
            description:  setting.description  || '',
            valueType:    setting.valueType     || null,
          });
        }
      }
    }
  }
}

/**
 * Serializes the current module-level _registry into state.unifiedSettings._registry.
 * Called after _mergeStateRegistryIntoLocal so this hook's new registrations
 * are persisted for future hooks.
 */

function _saveLocalRegistryToState() {
  const us = _ensureState();
  us._registry = JSON.parse(JSON.stringify(_registry));
}


// ===========================================================================
// CARD RENDERING
// ===========================================================================

/**
 * Builds the canonical text for the given card title and field.
 * Iterates the registry in insertion order; only includes mods/groups whose
 * effective card matches cardTitle AND effective field matches field.
 * Values are drawn from the state cache, falling back to the registered default.
 * @param {string} cardTitle
 * @param {string} [field]  'entry' or 'description'; defaults to _defaultField
 * @returns {string}
 */

function _renderCardField(cardTitle, field) {
  if (!field) field = _defaultField;
  const lines = [];

  // Build sorted mod entries.
  const modEntries = Object.keys(_registry)
    .map(function(modName, idx) { return { kind: 'mod', modName: modName, idx: idx }; })
    .filter(function(e) {
      return Object.keys(_registry[e.modName].groups).some(function(g) {
        return _effectiveCard(e.modName, g) === cardTitle &&
               _effectiveField(e.modName, g) === field &&
               _registry[e.modName].groups[g].settings.length > 0;
      });
    })
    .map(function(e) {
      const pos = _registry[e.modName].position !== undefined ? _registry[e.modName].position : 5;
      return { kind: 'mod', modName: e.modName, idx: e.idx, position: pos };
    });

  // Build sorted text block entries from state.
  // State shape: _textblocks[cardTitle][field][modName][key] = { text, position }
  const us = _ensureState();
  const tbState = us._textblocks;
  const byMod = (tbState && tbState[cardTitle] && tbState[cardTitle][field]) || {};
  const rawBlocks = [];
  for (const modName of Object.keys(byMod)) {
    for (const key of Object.keys(byMod[modName])) {
      rawBlocks.push(byMod[modName][key]);
    }
  }
  const textEntries = rawBlocks.map(function(b, idx) {
    return { kind: 'text', text: b.text, idx: modEntries.length + idx, position: typeof b.position === 'number' ? b.position : 5 };
  });

  // Merge and sort by position then insertion index.
  const allEntries = modEntries.concat(textEntries).sort(function(a, b) {
    return a.position !== b.position ? a.position - b.position : a.idx - b.idx;
  });

  for (let ei = 0; ei < allEntries.length; ei++) {
    const entry = allEntries[ei];
    if (ei > 0) { lines.push(''); lines.push(''); }

    if (entry.kind === 'text') {
      lines.push(entry.text);
      continue;
    }

    const modName = entry.modName;
    const modData = _registry[modName];

    const relevantGroups = Object.keys(modData.groups)
      .map(function(groupName, idx) { return { groupName: groupName, idx: idx }; })
      .filter(function(e) {
        return _effectiveCard(modName, e.groupName) === cardTitle &&
               _effectiveField(modName, e.groupName) === field &&
               modData.groups[e.groupName].settings.length > 0;
      })
      .sort(function(a, b) {
        const pa = modData.groups[a.groupName].position !== undefined ? modData.groups[a.groupName].position : 5;
        const pb = modData.groups[b.groupName].position !== undefined ? modData.groups[b.groupName].position : 5;
        return pa !== pb ? pa - pb : a.idx - b.idx;
      })
      .map(function(e) { return e.groupName; });

    lines.push('- ' + modName + (modData.description ? ' | ' + modData.description : ''));

    for (let gi = 0; gi < relevantGroups.length; gi++) {
      const groupName = relevantGroups[gi];
      const groupData = modData.groups[groupName];

      if (gi > 0) lines.push('');

      if (groupName !== _defaultGroup) {
        lines.push('-- ' + groupName + (groupData.description ? ' | ' + groupData.description : ''));
      }

      for (let si = 0; si < groupData.settings.length; si++) {
        const setting = groupData.settings[si];
        if (setting.description) lines.push(setting.description);
        const value = _getCached(modName, groupName, setting.internalKey);
        const display = value !== undefined ? value : setting.defaultValue;
        const rendered = (display.indexOf('\n') !== -1 && display[0] !== '[') ? '`' + display + '`' : display;
            lines.push('> ' + setting.key + ': ' + rendered);
          }
        }
      }
      return lines.join('\n');
    }
    return { _normalizeValue, _parseArray, _serializeArray, _simplify, _fuzzyMatchTitle, _fuzzyFindCard, _parseCardEntry, _parseCardSections, _escapeRegex, _effectiveCard, _effectiveField, _ensureState, _getCached, _setCached, _mergeStateRegistryIntoLocal, _saveLocalRegistryToState, _renderCardField, _registry, _defaultCard, _defaultGroup, _defaultField };
  })();

  static input(text) {
    UnifiedSettings.ensureSettingCardsExist();
    return { text };
  }

  static context(text) {
    UnifiedSettings.ensureSettingCardsExist();
    return {text};
  }

  static output(text) {
    UnifiedSettings.ensureSettingCardsExist();
    return { text };
  }

  static defineMod(modName, description, card, field, position) {
    if (!UnifiedSettings.#lib._registry[modName]) {
      UnifiedSettings.#lib._registry[modName] = {
        description: description || '',
        card:        card || UnifiedSettings.#lib._defaultCard,
        field:       field || '',
        position:    typeof position === 'number' ? position : 5,
        groups:      {},
      };
    } else {
      if (description !== undefined)        UnifiedSettings.#lib._registry[modName].description = description;
      if (card        !== undefined)        UnifiedSettings.#lib._registry[modName].card        = card;
      if (field       !== undefined)        UnifiedSettings.#lib._registry[modName].field       = field;
      if (typeof position === 'number')     UnifiedSettings.#lib._registry[modName].position    = position;
    }
  }

  static defineGroup(modName, groupName, description, card, field, position) {
    if (!UnifiedSettings.#lib._registry[modName]) UnifiedSettings.defineMod(modName, '', UnifiedSettings.#lib._defaultCard);
    const groups = UnifiedSettings.#lib._registry[modName].groups;
    if (!groups[groupName]) {
      groups[groupName] = {
        description: description || '',
        card:        card || null,
        field:       field || '',
        position:    typeof position === 'number' ? position : 5,
        settings:    [],
      };
    } else {
      if (description !== undefined)    groups[groupName].description = description;
      if (card        !== undefined)    groups[groupName].card        = card;
      if (field       !== undefined)    groups[groupName].field       = field;
      if (typeof position === 'number') groups[groupName].position    = position;
    }
  }

  static defineSettings(settingObj) {
    if (!settingObj || !settingObj.modName || !settingObj.setting) return;
    const modName   = settingObj.modName;
    const groupName = settingObj.group || UnifiedSettings.#lib._defaultGroup;
    const card      = settingObj.card  || null;
    const field     = settingObj.field || null;
  
    if (!UnifiedSettings.#lib._registry[modName]) UnifiedSettings.defineMod(modName, '', card || UnifiedSettings.#lib._defaultCard);
    if (!UnifiedSettings.#lib._registry[modName].groups[groupName]) UnifiedSettings.defineGroup(modName, groupName, '', card, field);
  
    const groupSettings = UnifiedSettings.#lib._registry[modName].groups[groupName].settings;
    for (const internalKey of Object.keys(settingObj.setting)) {
      const def = settingObj.setting[internalKey];
      if (!groupSettings.find(function(s) { return s.internalKey === internalKey; })) {
        groupSettings.push({
          internalKey:  internalKey,
          key:          def.key,
          defaultValue: String(def.defaultValue != null ? def.defaultValue : ''),
          description:  def.description || '',
          valueType:    def.valueType   || null,
        });
      }
    }
  }

  static ensureSettingCardsExist() {
    // Restore registrations from prior hooks (module-level UnifiedSettings.#lib._registry resets each hook).
    UnifiedSettings.#lib._mergeStateRegistryIntoLocal();
  
    // Collect unique card titles and the set of fields used on each card.
    const cardFields = {}; // cardTitle → Set of field strings
    for (const modName of Object.keys(UnifiedSettings.#lib._registry)) {
      for (const groupName of Object.keys(UnifiedSettings.#lib._registry[modName].groups)) {
        if (UnifiedSettings.#lib._registry[modName].groups[groupName].settings.length > 0) {
          const cardTitle = UnifiedSettings.#lib._effectiveCard(modName, groupName);
          const field     = UnifiedSettings.#lib._effectiveField(modName, groupName);
          if (!cardFields[cardTitle]) cardFields[cardTitle] = new Set();
          cardFields[cardTitle].add(field);
        }
      }
    }
  
    // Also include fields that have text blocks but no settings registrations,
    // so text-only fields are rendered even when no settings exist for them.
    const usForTB = UnifiedSettings.#lib._ensureState();
    if (usForTB._textblocks) {
      for (const cardTitle of Object.keys(usForTB._textblocks)) {
        for (const field of Object.keys(usForTB._textblocks[cardTitle])) {
          if (!cardFields[cardTitle]) cardFields[cardTitle] = new Set();
          cardFields[cardTitle].add(field);
        }
      }
    }
  
    // Persist complete registry to state so future hooks (which re-evaluate the
    // module) can restore all registrations via UnifiedSettings.#lib._mergeStateRegistryIntoLocal.
    UnifiedSettings.#lib._saveLocalRegistryToState();
  
    // Track every card+field we have ever managed so removals still trigger a
    // re-render (clearing stale content) even when the registry is now empty
    // for that card.
    const usForManaged = UnifiedSettings.#lib._ensureState();
    if (!usForManaged._managedCards) usForManaged._managedCards = {};
    for (const ct of Object.keys(cardFields)) {
      if (!usForManaged._managedCards[ct]) usForManaged._managedCards[ct] = [];
      for (const f of cardFields[ct]) {
        if (usForManaged._managedCards[ct].indexOf(f) === -1) usForManaged._managedCards[ct].push(f);
      }
    }
    for (const ct of Object.keys(usForManaged._managedCards)) {
      if (!cardFields[ct]) cardFields[ct] = new Set();
      for (const f of usForManaged._managedCards[ct]) cardFields[ct].add(f);
    }
  
    for (const cardTitle of Object.keys(cardFields)) {
      const fields = cardFields[cardTitle];
      let card = UnifiedSettings.#lib._fuzzyFindCard(cardTitle);
      const us = UnifiedSettings.#lib._ensureState();
      const byMod = (us._cardkeys && us._cardkeys[cardTitle]) || {};
      const cardKeys = Object.keys(byMod).map(function(m) { return byMod[m]; }).filter(Boolean).join(', ');
  
      if (!card) {
        addStoryCard(cardTitle);
        card = storyCards[storyCards.length - 1];
        if (card) {
          card.type = 'zz_Settings';
          card.keys = cardKeys;
          for (const field of fields) {
            card[field] = UnifiedSettings.#lib._renderCardField(cardTitle, field);
          }
        }
        continue;
      }
  
      // Parse each field and sync valid values into the state cache.
      for (const field of fields) {
        const cardText = card[field] || '';
        const sections   = UnifiedSettings.#lib._parseCardSections(cardText);
        const flatParsed = UnifiedSettings.#lib._parseCardEntry(cardText);
        for (const modName of Object.keys(UnifiedSettings.#lib._registry)) {
          const modData = UnifiedSettings.#lib._registry[modName];
          for (const groupName of Object.keys(modData.groups)) {
            if (UnifiedSettings.#lib._effectiveCard(modName, groupName) !== cardTitle) continue;
            if (UnifiedSettings.#lib._effectiveField(modName, groupName) !== field) continue;
            const groupData = modData.groups[groupName];
            const scopedParsed = (sections[modName] && sections[modName][groupName]) || {};
            for (let si = 0; si < groupData.settings.length; si++) {
              const setting  = groupData.settings[si];
              const rawValue = scopedParsed[setting.key] !== undefined
                ? scopedParsed[setting.key]
                : flatParsed[setting.key];
              if (rawValue !== undefined) {
                const normalized = UnifiedSettings.#lib._normalizeValue(rawValue, setting.defaultValue);
                if (normalized !== null) {
                  UnifiedSettings.#lib._setCached(modName, groupName, setting.internalKey, normalized);
                }
                // Invalid value: keep whatever is already in the cache (last-known-good).
              }
            }
          }
        }
        card[field] = UnifiedSettings.#lib._renderCardField(cardTitle, field);
      }
  
      card.keys = cardKeys;
  
      // Delete the card if it is now completely empty (no settings, no text
      // blocks, no keys). Also purge it from _managedCards so future hook calls
      // do not attempt to re-create it.
      const allFieldsEmpty = Array.from(fields).every(function(f) { return !card[f]; });
      if (allFieldsEmpty && !cardKeys) {
        const idx = storyCards.indexOf(card);
        if (idx !== -1) storyCards.splice(idx, 1);
        delete usForManaged._managedCards[cardTitle];
      }
    }
  }

  static getSetting(modName, groupName, internalKey) {
    const cached = UnifiedSettings.#lib._getCached(modName, groupName, internalKey);
    if (cached !== undefined) return cached;
    const groups = UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups;
    const setting = groups && groups[groupName] && groups[groupName].settings.find(function(s) {
      return s.internalKey === internalKey;
    });
    return setting ? setting.defaultValue : null;
  }

  static setSetting(modName, groupName, internalKey, rawValue) {
    const groups  = UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups;
    const setting = groups && groups[groupName] && groups[groupName].settings.find(function(s) {
      return s.internalKey === internalKey;
    });
    if (!setting) return;
  
    const normalized = UnifiedSettings.#lib._normalizeValue(String(rawValue != null ? rawValue : ''), setting.defaultValue);
    const value = normalized !== null ? normalized : String(rawValue != null ? rawValue : '');
    UnifiedSettings.#lib._setCached(modName, groupName, internalKey, value);
  
    const card = UnifiedSettings.#lib._fuzzyFindCard(UnifiedSettings.#lib._effectiveCard(modName, groupName));
    if (!card) return;
  
    const field = UnifiedSettings.#lib._effectiveField(modName, groupName);
    card[field] = UnifiedSettings.#lib._renderCardField(UnifiedSettings.#lib._effectiveCard(modName, groupName), field);
  }

  static resetSetting(modName, groupName, internalKey) {
    const groups  = UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups;
    const setting = groups && groups[groupName] && groups[groupName].settings.find(function(s) {
      return s.internalKey === internalKey;
    });
    if (!setting) return;
    UnifiedSettings.setSetting(modName, groupName, internalKey, setting.defaultValue);
  }

  static getSettingArray(modName, groupName, internalKey) {
    const raw = UnifiedSettings.getSetting(modName, groupName, internalKey);
    if (raw === null) return null;
    return UnifiedSettings.#lib._parseArray(raw);
  }

  static getModSetting(modName, internalKey) {
    return UnifiedSettings.getSetting(modName, UnifiedSettings.#lib._defaultGroup, internalKey);
  }

  static getModSettingArray(modName, internalKey) {
    return UnifiedSettings.getSettingArray(modName, UnifiedSettings.#lib._defaultGroup, internalKey);
  }

  static setModSetting(modName, internalKey, rawValue) {
    UnifiedSettings.setSetting(modName, UnifiedSettings.#lib._defaultGroup, internalKey, rawValue);
  }

  static resetModSetting(modName, internalKey) {
    UnifiedSettings.resetSetting(modName, UnifiedSettings.#lib._defaultGroup, internalKey);
  }

  static defineText(obj) {
    if (!obj || !obj.modName || !obj.key || obj.text == null) return;
    const cardTitle = obj.card || UnifiedSettings.#lib._defaultCard;
    const field     = obj.field     || UnifiedSettings.#lib._defaultField;
    const position  = typeof obj.position === 'number' ? obj.position : 5;
    const us = UnifiedSettings.#lib._ensureState();
    if (!us._textblocks)                                          us._textblocks = {};
    if (!us._textblocks[cardTitle])                               us._textblocks[cardTitle] = {};
    if (!us._textblocks[cardTitle][field])                        us._textblocks[cardTitle][field] = {};
    if (!us._textblocks[cardTitle][field][obj.modName])           us._textblocks[cardTitle][field][obj.modName] = {};
    us._textblocks[cardTitle][field][obj.modName][obj.key] = { text: obj.text, position: position };
  }

  static removeText(modName, key) {
    const us = UnifiedSettings.#lib._ensureState();
    if (!us._textblocks) return;
    for (const cardTitle of Object.keys(us._textblocks)) {
      for (const field of Object.keys(us._textblocks[cardTitle])) {
        const byMod = us._textblocks[cardTitle][field];
        if (byMod[modName]) {
          delete byMod[modName][key];
        }
      }
    }
  }

  static defineCardKeys(modName, cardTitle, text) {
    const us = UnifiedSettings.#lib._ensureState();
    if (!us._cardkeys)              us._cardkeys = {};
    if (!us._cardkeys[cardTitle])   us._cardkeys[cardTitle] = {};
    us._cardkeys[cardTitle][modName] = text;
  }

  static removeCardKeys(modName, cardTitle) {
    const us = UnifiedSettings.#lib._ensureState();
    if (us._cardkeys && us._cardkeys[cardTitle]) {
      delete us._cardkeys[cardTitle][modName];
    }
  }

  static removeSetting(modName, groupName, internalKey) {
    const groups = UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups;
    const settings = groups && groups[groupName] && groups[groupName].settings;
    if (settings) {
      const idx = settings.findIndex(function(s) { return s.internalKey === internalKey; });
      if (idx !== -1) settings.splice(idx, 1);
    }
    const us = UnifiedSettings.#lib._ensureState();
    const sr = us.UnifiedSettings.#lib._registry;
    const sgroups = sr && sr[modName] && sr[modName].groups;
    const ssettings = sgroups && sgroups[groupName] && sgroups[groupName].settings;
    if (ssettings) {
      const idx = ssettings.findIndex(function(s) { return s.internalKey === internalKey; });
      if (idx !== -1) ssettings.splice(idx, 1);
    }
  }

  static removeGroup(modName, groupName) {
    if (UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups) {
      delete UnifiedSettings.#lib._registry[modName].groups[groupName];
    }
    const us = UnifiedSettings.#lib._ensureState();
    const sr = us.UnifiedSettings.#lib._registry;
    if (sr && sr[modName] && sr[modName].groups) {
      delete sr[modName].groups[groupName];
    }
  }

  static removeMod(modName) {
    delete UnifiedSettings.#lib._registry[modName];
    const us = UnifiedSettings.#lib._ensureState();
    const sr = us.UnifiedSettings.#lib._registry;
    if (sr) delete sr[modName];
  }
}

class DuckieDebug {
  static #lib = (() => {
    let _duckieDebugLevel = 0;
    
    const DUCKIE_DEBUG_CARD = 'Duckie Debug Data';
    const DUCKIE_DEBUG_TYPE = 'zz_Debug';
    const DUCKIE_DEBUG_MODE = 1;
    const DUCKIE_MOD_NAME = "DuckieDebug";
    const DUCKIE_SETTING_KEY = 'Debug Mode';
    const DUCKIE_FIELD = 'description';
    
    
    const DEFAULT_SETTINGS = {
      modName: 'DuckieDebug',
      setting: {
        debugMode: { key: DUCKIE_SETTING_KEY, defaultValue: DUCKIE_DEBUG_MODE, valueType: 'num' },
      }
    };
    
    function preHook(){
        UnifiedSettings.defineMod(DUCKIE_MOD_NAME, 'Debug output level', undefined, DUCKIE_FIELD, 9);
        UnifiedSettings.defineSettings(DEFAULT_SETTINGS);
    }
    return { preHook, _duckieDebugLevel, DUCKIE_DEBUG_CARD, DUCKIE_DEBUG_TYPE, DUCKIE_DEBUG_MODE, DUCKIE_MOD_NAME, DUCKIE_SETTING_KEY, DUCKIE_FIELD, DEFAULT_SETTINGS };
  })();

  static duckieDebugMode = { OFF: 0, ERROR: 1, INFORM: 2 };

  static input(text) {
    DuckieDebug.applyDebugLevel ('Input', DuckieDebug.getLevel());
  
    return { text };
  }

  static context(text) {
    DuckieDebug.applyDebugLevel ('Context', DuckieDebug.getLevel());
  
    return { text };
  }

  static output(text) {
    DuckieDebug.applyDebugLevel ('Output', DuckieDebug.getLevel());
    
    return { text };
  }

  static preInput(text) {
    DuckieDebug.#lib.preHook();
  }

  static preContext(text) {
    DuckieDebug.#lib.preHook();
  }

  static preOutput(text) {
    DuckieDebug.#lib.preHook();
  }

  static applyDebugLevel (modifierName, level) {
    DuckieDebug.#lib._duckieDebugLevel = typeof level === 'number' ? level : (level ? 2 : 0);
    DuckieDebug.duckieDebug(`Turn ${info.actionCount} - ${modifierName}`, DuckieDebug.duckieDebugMode.ERROR);
  }

  static duckieDebug(msg, level = DuckieDebug.duckieDebugMode.INFORM) {
    if (DuckieDebug.#lib._duckieDebugLevel === 0 || level > DuckieDebug.#lib._duckieDebugLevel) return;
  
    // 1. Built-in AID console (stable fallback)
    log(msg);
  
    // 2. Debug Data storycard (convenient to read)
    let card = storyCards.find(c => c.title === DuckieDebug.#lib.DUCKIE_DEBUG_CARD);
    if (!card) {
      addStoryCard(DuckieDebug.#lib.DUCKIE_DEBUG_CARD);
      card = storyCards[storyCards.length - 1];
      if (card) {
        card.type        = DuckieDebug.#lib.DUCKIE_DEBUG_TYPE;
        card.keys        = '';
        card.description = 'duckie debug DuckieDebug.output — set Debug Mode to 0 in Settings to hide';
      }
    }
    if (card) {
      card.entry = card.entry ? card.entry + '\n' + msg : msg;
    }
  }

  static getLevel() {
    return UnifiedSettings.getModSetting(DuckieDebug.#lib.DUCKIE_MOD_NAME, "debugMode");
  }
}

class RevampedHistory {
  static #lib = (() => {
    const DEBUG_CARD_TYPE = 'zz_Debug';
    
    function updateDebugCard() {
      const history = state.rvh?.history;
      if (!history) return;
    
      const lines = history.map((entry, i) => {
        const retryCount = entry.retries?.length ?? 0;
        const preview = entry.text.slice(0, 80).replace(/\n/g, ' ');
        let line = `[${i}] ${entry.actionType}: "${preview}"`;
        if (retryCount > 0) {
          line += ` (${retryCount} retr${retryCount === 1 ? 'y' : 'ies'})`;
          for (const [ri, r] of entry.retries.entries()) {
            const rPreview = r.text.slice(0, 60).replace(/\n/g, ' ');
            line += `\n  retry[${ri}] ${r.actionType}: "${rPreview}"`;
          }
        }
        if (entry.scriptData && Object.keys(entry.scriptData).length > 0) {
          line += `\n  scriptData: ${JSON.stringify(entry.scriptData)}`;
        }
        return line;
      });
    
      const body = lines.length
        ? `count: ${history.length} | actions: ${state.rvh.actionCount}\n\n${lines.join('\n')}`
        : `(empty) | actions: ${state.rvh.actionCount}`;
    
      getOrCreateCard('[RVH Debug]',
        {
          description: body,
          type: DEBUG_CARD_TYPE
        }
      )
    }
    
    
    function updateAidDebugCard() {
      if (!history) return;
    
      const lines = history.map((entry, i) => {
        const preview = (entry.text ?? '').slice(0, 80).replace(/\n/g, ' ');
        return `[${i}] ${entry.type ?? entry.actionType ?? '?'}: "${preview}"`;
      });
    
      const body = lines.length
        ? `count: ${history.length} | actions: ${info.actionCount}\n\n${lines.join('\n')}`
        : `(empty) | actions: ${info.actionCount}`;
    
      getOrCreateCard('[AID Debug]', { description: body, type: DEBUG_CARD_TYPE });
    }
    
    /**
     * Returns an existing storycard by title, creating and initializing it if absent.
     *
     * @param {string} title - The card title to find or create.
     * @param {Object} defaults - Fields to set on the card when first created.
     *   All fields are optional; unspecified fields are left at addStoryCard() defaults.
     * @param {function(Object): void} [onRepair] - Optional callback invoked on every
     *   call (create or find) for post-creation or repair logic. Receives the card.
     * @returns {Object|null} The storycard, or null if creation failed.
     */
    function getOrCreateCard(title, defaults = {}, onRepair = null) {
      let card = getStoryCardEntryByTitle(title);
      if (!card) {
        addStoryCard(title);
        card = getStoryCardEntryByTitle(title);
      }
      if (card) {
        Object.assign(card, defaults);
      }
      if (card && onRepair) onRepair(card);
      return card;
    }
    
    function getStoryCardEntryByTitle(title) {
      const card = storyCards.find(c => c.title === title);
      return card ? card : null;
    }
    
    
    function updateHistoryDebugCards() {
      if (DuckieDebug.getLevel() > DuckieDebug.duckieDebugMode.OFF) {
        updateDebugCard();
        updateAidDebugCard();
      }
    }
    
    
    
    
    // --- classify ---
    
    const MATCH_CONFIDENCE_RATIO = 0.70;
    const LOOKBACK_WINDOW = 10;
    const MAX_CONSECUTIVE_MISMATCHES = 2; 
    const AID_HISTORY_CAP = 100;
    
    function inferActionType(text) {
      if (text.startsWith('> You say')) return 'say';
      if (text.startsWith('>'))         return 'do';
      return 'story';
    }
    
    // Walks backwards through both histories and counts matching entries via Jaccard similarity.
    // rvhOffset skips that many entries from the end of rvhHistory before comparing
    // (used for retry detection where AID has already removed the last AI response).
    function findHistoryMatch(aidHistory, rvhHistory, rvhOffset, window, threshold) {
      const limit = Math.min(
        window,
        aidHistory.length,
        Math.max(0, rvhHistory.length - rvhOffset)
      );
      const edits = [];
      let matchedCount = 0;
      let consecutiveMismatches = 0;
    
      for (let i = 0; i < limit; i++) {
        const aidEntry = aidHistory[aidHistory.length - 1 - i];
        const rvhEntry = rvhHistory[rvhHistory.length - 1 - rvhOffset - i];
        const sim = jaccardSimilarity(aidEntry.text, rvhEntry.text);
    
        if (sim >= threshold) {
          matchedCount++;
          consecutiveMismatches = 0;
          if (sim < 0.95) {
            edits.push({ rvhIdx: rvhHistory.length - 1 - rvhOffset - i, newText: aidEntry.text });
          }
        } else {
          consecutiveMismatches++;
          edits.push({ rvhIdx: rvhHistory.length - 1 - rvhOffset - i, newText: aidEntry.text });
          if (consecutiveMismatches > MAX_CONSECUTIVE_MISMATCHES) break;
        }
      }
    
      const needed = Math.ceil(limit * MATCH_CONFIDENCE_RATIO);
      return { matchedCount, edits, confident: limit === 0 || matchedCount >= needed };
    }
    
    // Classifies the current state change at the beginning of the input hook.
    // At this point AID has already incremented info.actionCount once (before input fires).
    function classifyStateChange(info, state, aidHistory) {
      if(info.actionCount === 0) return { changeType: 'start', edits: [] };
    
      const aidCount = info.actionCount;
      const rvhCount = state.rvh.actionCount;
    
      if (aidCount < rvhCount) return { changeType: 'rewind', edits: [] };
      if (aidCount > rvhCount + 1) return { changeType: 'redo', edits: [] };
    
      // aidCount === rvhCount → presumed retry (AID net-zeroed: -1 after output, +1 before input)
      // aidCount === rvhCount + 1 → presumed new action
      const presumed = aidCount === rvhCount ? 'retry' : 'new';
    
      // For retry, AID removed the last AI response from its history, so we skip our last entry.
      const rvhOffset = presumed === 'retry' ? 1 : 0;
      const result = findHistoryMatch(
        aidHistory, state.rvh.history, rvhOffset, LOOKBACK_WINDOW, SIMILARITY_THRESHOLD
      );
    
      if (!result.confident) return { changeType: 'redo', edits: result.edits };
      return { changeType: presumed, edits: result.edits };
    }
    
    function trailingContinueCount(aidHistory) {
      let count = 0;
      for (let i = aidHistory.length - 1; i >= 0; i--) {
        if (aidHistory[i].type !== 'continue') break;
        count++;
      }
      return count;
    }
    
    
    
    // --- history ops ---
    
    
    
    const AMBIGUOUS_DELTA = 0.20;
    
    function pushAction(state, text, actionType, scriptData = {}) {
      state.rvh.history.push({ text, actionType, retries: [], scriptData });
      if (state.rvh.history.length > state.rvh.historyMaxLength) {
        state.rvh.history.shift();
      }
    }
    
    
    function trimToIndex(state, index) {
      return state.rvh.history.splice(index);
    }
    
    function saveAltHistory(state, firstTurn, tail) {
      state.rvh.altHistory.unshift({ firstTurn, history: tail });
      if (state.rvh.altHistory.length > state.rvh.maxAltHistories) {
        state.rvh.altHistory.pop();
      }
    }
    
    function restoreAltHistory(state, aidCount, aidHistory) {
      let bestBranch = null;
      let bestScore = -1;
    
      for (const branch of state.rvh.altHistory) {
        const branchEndCount = branch.firstTurn + branch.history.length;
        if (Math.abs(branchEndCount - aidCount) > 4) continue;
    
        const result = findHistoryMatch(aidHistory, branch.history, 0, 5, SIMILARITY_THRESHOLD);
        if (result.confident && result.matchedCount > bestScore) {
          bestScore = result.matchedCount;
          bestBranch = branch;
        }
      }
    
      if (!bestBranch) return false;
    
      state.rvh.history = state.rvh.history.slice(0, bestBranch.firstTurn).concat(bestBranch.history);
      state.rvh.actionCount = bestBranch.firstTurn + bestBranch.history.length;
      state.rvh.altHistory = state.rvh.altHistory.filter(b => b !== bestBranch);
      return true;
    }
    
    // When the player stops retrying, AID's history reveals which response they picked.
    // If it matches a stored retry rather than the current winner, swap it in.
    // Sets rvh.ambiguous if the match is low-confidence (scores within AMBIGUOUS_DELTA of each other).
    // Prioritizes the canonical entry, then retries with scriptData, as tiebreakers.
    function resolveRetryWinner(state, aidHistory) {
      const last = state.rvh.history[state.rvh.history.length - 1];
      if (!last || last.retries.length === 0) return;
    
      const aidLast = aidHistory[aidHistory.length - 1];
      if (!aidLast) return;
    
      // Score canonical and all retries
      const canonicalSim = jaccardSimilarity(aidLast.text, last.text);
    
      const retrySims = last.retries.map((r, i) => ({
        index: i,
        sim: jaccardSimilarity(aidLast.text, r.text),
        hasScriptData: r.scriptData && Object.keys(r.scriptData).length > 0,
      }));
    
      // Find the best retry score
      const bestRetry = retrySims.reduce((best, r) => r.sim > best.sim ? r : best, retrySims[0]);
    
      // Canonical wins unless a retry beats it clearly
      if (bestRetry.sim <= canonicalSim) {
        // Canonical is best or tied — check for ambiguity among close competitors
        const considered = retrySims.filter(r => r.sim >= bestRetry.sim - AMBIGUOUS_DELTA);
        if (considered.length > 0 && bestRetry.sim >= canonicalSim - AMBIGUOUS_DELTA) {
          state.rvh.ambiguous = {
            index: state.rvh.history.length - 1,
            chosenAction: { text: last.text, scriptData: last.scriptData },
            consideredAlts: considered.map(r => ({
              text: last.retries[r.index].text,
              scriptData: last.retries[r.index].scriptData,
            })),
          };
        }
        return;
      }
    
      // A retry beats canonical — find the best among close competitors,
      // preferring retries with scriptData as tiebreaker
      const candidates = retrySims.filter(r => r.sim >= bestRetry.sim - AMBIGUOUS_DELTA);
      const winner = candidates.reduce((best, r) => {
        if (r.sim > best.sim) return r;
        if (r.sim === best.sim && r.hasScriptData && !best.hasScriptData) return r;
        return best;
      }, candidates[0]);
    
      // Flag ambiguity if canonical or other retries were close
      const otherCandidates = [
        { text: last.text, scriptData: last.scriptData, sim: canonicalSim },
        ...retrySims
          .filter(r => r.index !== winner.index && r.sim >= bestRetry.sim - AMBIGUOUS_DELTA)
          .map(r => ({ text: last.retries[r.index].text, scriptData: last.retries[r.index].scriptData, sim: r.sim })),
      ].filter(c => c.sim >= bestRetry.sim - AMBIGUOUS_DELTA);
    
      if (otherCandidates.length > 0) {
        DuckieDebug.duckieDebug("Ambiguous Action Found", DuckieDebug.duckieDebugMode.ERROR);
        state.rvh.ambiguous = {
          index: state.rvh.history.length - 1,
          chosenAction: { text: last.retries[winner.index].text, scriptData: last.retries[winner.index].scriptData },
          consideredAlts: otherCandidates.map(c => ({ text: c.text, scriptData: c.scriptData })),
        };
      }
    
      // Promote the winner
      const promoted = last.retries.splice(winner.index, 1)[0];
      last.retries.push({ text: last.text, actionType: last.actionType, scriptData: last.scriptData });
      last.text = promoted.text;
      last.actionType = promoted.actionType;
      last.scriptData = promoted.scriptData;
    }
    
    function freshenText(state, edits) {
      const last = state.rvh.history.length - 1;
      const secondLast = state.rvh.history.length - 2;
      const safeSwapFrom = (secondLast >= 0 && state.rvh.history[secondLast].actionType !== 'continue')
        ? secondLast
        : last;
    
      for (const { rvhIdx, newText } of edits) {
        const entry = state.rvh.history[rvhIdx];
        if (!entry) continue;
    
        if (rvhIdx < safeSwapFrom) {
          // Older entry: update text only, never promote a retry
          entry.text = newText;
          continue;
        }
    
        // Recent entry: allow retry promotion as before
        let bestSim = jaccardSimilarity(newText, entry.text);
        let bestRetryIdx = -1;
    
        for (let i = 0; i < entry.retries.length; i++) {
          const sim = jaccardSimilarity(newText, entry.retries[i].text);
          if (sim > bestSim) {
            bestSim = sim;
            bestRetryIdx = i;
          }
        }
    
        if (bestRetryIdx !== -1) {
          const winner = entry.retries.splice(bestRetryIdx, 1)[0];
          entry.retries.push({ text: entry.text, actionType: entry.actionType, scriptData: entry.scriptData });
          entry.actionType = winner.actionType;
          entry.scriptData = winner.scriptData;
        }
    
        entry.text = newText;
      }
    }
    
    function backfillFromAidHistory(state, aidHistory, fromIdx) {
      for (let i = fromIdx; i < aidHistory.length; i++) {
        const entry = aidHistory[i];
        if (entry) pushAction(state, entry.text, entry.type, {});
      }
    }
    
    
    
    // --- init ---
    
    function rvhEnsureInit(state) {
      if (state.rvh) return;
      state.rvh = {
        history: [],
        actionCount: 0,
        historyMaxLength: 1000,
        altHistory: [],
        maxAltHistories: 5,
        playerAction: null,
        aiAction: null,
        expectedAidContinueDepth: 0,
      };
    }
    
    
    
    //--- similarity ---
    
    const SIMILARITY_THRESHOLD = 0.60;
    
    function computeBigrams(text) {
      const words = (text || '').toLowerCase().match(/\b\w+\b/g) || [];
      const bigrams = new Set();
      for (let i = 0; i < words.length - 1; i++) {
        bigrams.add(`${words[i]} ${words[i + 1]}`);
      }
      return bigrams;
    }
    
    function jaccardSimilarity(text1, text2) {
      if (!text1 && !text2) return 1.0;
      const set1 = computeBigrams(text1);
      const set2 = computeBigrams(text2);
      if (set1.size === 0 && set2.size === 0) return 1.0;
      let intersectionCount = 0;
      for (const b of set1) {
        if (set2.has(b)) intersectionCount++;
      }
      const unionCount = set1.size + set2.size - intersectionCount;
      return unionCount === 0 ? 0 : intersectionCount / unionCount;
    }
    return { updateDebugCard, updateAidDebugCard, getOrCreateCard, getStoryCardEntryByTitle, updateHistoryDebugCards, inferActionType, findHistoryMatch, classifyStateChange, trailingContinueCount, pushAction, trimToIndex, saveAltHistory, restoreAltHistory, resolveRetryWinner, freshenText, backfillFromAidHistory, rvhEnsureInit, computeBigrams, jaccardSimilarity, DEBUG_CARD_TYPE, MATCH_CONFIDENCE_RATIO, LOOKBACK_WINDOW, MAX_CONSECUTIVE_MISMATCHES, AID_HISTORY_CAP, AMBIGUOUS_DELTA, SIMILARITY_THRESHOLD };
  })();

  static preInput(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
    const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
    RevampedHistory.#lib.resolveRetryWinner(state, history);
    RevampedHistory.#lib.freshenText(state, edits);
  
    if (changeType === 'rewind') {
      const divergeIdx = info.actionCount - 1;
      const tail = RevampedHistory.#lib.trimToIndex(state, divergeIdx);
      RevampedHistory.#lib.saveAltHistory(state, divergeIdx, tail);
      state.rvh.actionCount = divergeIdx;
      state.rvh.actionCount++;
    } else if (changeType === 'redo') {
      const restored = RevampedHistory.#lib.restoreAltHistory(state, info.actionCount - 1, history);
      if (!restored) {
        state.rvh.actionCount = info.actionCount - 1;
      }
      state.rvh.actionCount++;
    } else if (changeType === 'new') {
      state.rvh.actionCount++;
    }
  
    let actionType = RevampedHistory.#lib.inferActionType(text);
    if (changeType === 'start') {
      actionType = 'start';
    }
    state.rvh.playerAction = { changeType, actionType, text, scriptData: {} };
  }

  static popRetryAiEntry(state) {
    const popped = state.rvh.history.pop();
    state.rvh.aiAction = {
      actionType: popped.actionType,
      text:       null,
      scriptData: {},
      retries:    [...popped.retries, { text: popped.text, actionType: popped.actionType, scriptData: popped.scriptData }],
    };
  }

  static preContext(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
    state.rvh.aiAction = { actionType: 'continue', text: null, scriptData: {} };
  
    if (state.rvh.playerAction) {
      if (state.rvh.playerAction.changeType !== 'retry') {
        DuckieDebug.duckieDebug("Player Action", 2);
        state.rvh.actionCount++;
      } else {
        RevampedHistory.popRetryAiEntry(state);
      }
    } else {
  
      const aidCount = info.actionCount;
      const rvhCount = state.rvh.actionCount;
  
     if (aidCount < rvhCount || aidCount > rvhCount + 1) {
        const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
        RevampedHistory.#lib.resolveRetryWinner(state, history);
        RevampedHistory.#lib.freshenText(state, edits);
        state.rvh.aiAction.changeType = changeType;
  
        if (changeType === 'rewind') {
          const divergeIdx = aidCount - 1;
          const tail = RevampedHistory.#lib.trimToIndex(state, divergeIdx);
          RevampedHistory.#lib.saveAltHistory(state, divergeIdx, tail);
          state.rvh.actionCount = divergeIdx;
        } else if (changeType === 'redo') {
          const restored = RevampedHistory.#lib.restoreAltHistory(state, aidCount - 1, history);
          if (!restored) {
            RevampedHistory.#lib.backfillFromAidHistory(state, history, state.rvh.history.length);
            state.rvh.actionCount = aidCount - 1;
          }
        }
        state.rvh.actionCount++;
      } else {
        let aidTrailing = 0;
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].type !== 'continue') break;
          aidTrailing++;
        }
        if (aidTrailing < state.rvh.expectedAidContinueDepth) {
          RevampedHistory.popRetryAiEntry(state);
          state.rvh.playerAction = { changeType: 'retry', actionType: 'continue', text: null, scriptData: {} };
        } else {
          const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
          RevampedHistory.#lib.resolveRetryWinner(state, history);
          RevampedHistory.#lib.freshenText(state, edits);
          state.rvh.aiAction.changeType = changeType;
          state.rvh.actionCount++;
        }
      }
    }
  }

  static postInput(text) {
    state.rvh.playerAction.text = text;
  }

  static postOutput(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
    const playerAction = state.rvh.playerAction;
    const aiAction     = state.rvh.aiAction;
  
    if (!playerAction) {
      if (aiAction) {
        aiAction.text = text;
        RevampedHistory.#lib.pushAction(state, aiAction.text, aiAction.actionType, aiAction.scriptData);
        state.rvh.aiAction = null;
      }
      state.rvh.ambiguous = null;
      state.rvh.expectedAidContinueDepth = Math.min(RevampedHistory.#lib.trailingContinueCount(history) + 1, RevampedHistory.#lib.AID_HISTORY_CAP);
      RevampedHistory.#lib.updateHistoryDebugCards();
    } else {
      aiAction.text = text;
  
      if (playerAction.changeType === 'retry') {
        state.rvh.history.push({ text: aiAction.text, actionType: aiAction.actionType, scriptData: aiAction.scriptData, retries: aiAction.retries });
        if (state.rvh.history.length > state.rvh.historyMaxLength) state.rvh.history.shift();
      } else {
        const lastEntry = history[history.length - 1];
        if (lastEntry && lastEntry.type && lastEntry.type !== playerAction.actionType) {
          playerAction.actionType = lastEntry.type;
        }
        RevampedHistory.#lib.pushAction(state, playerAction.text, playerAction.actionType, playerAction.scriptData);
        RevampedHistory.#lib.pushAction(state, aiAction.text,     aiAction.actionType,     aiAction.scriptData);
      }
  
      state.rvh.playerAction = null;
      state.rvh.aiAction     = null;
      state.rvh.ambiguous    = null;
  
      state.rvh.expectedAidContinueDepth = Math.min(RevampedHistory.#lib.trailingContinueCount(history) + 1, RevampedHistory.#lib.AID_HISTORY_CAP);
      RevampedHistory.#lib.updateHistoryDebugCards();
    }
  }

  static getPendingPlayerAction() {
    const pa = state.rvh?.playerAction;
    if (!pa) return null;
    return { changeType: pa.changeType, actionType: pa.actionType, text: pa.text };
    // scriptData intentionally excluded from snapshot — use RevampedHistory.setPlayerScriptData to write
  }

  static getPendingAIAction() {
    const aa = state.rvh?.aiAction;
    if (!aa) return null;
    return { changeType: aa.changeType, actionType: aa.actionType, text: aa.text };
    // scriptData intentionally excluded from snapshot — use RevampedHistory.setAiScriptData to write
  }

  static getCurrentActionType() {
    return state.rvh?.playerAction ? state.rvh.playerAction.actionType : 'continue';
  }

  static getCurrentChangeType() {
    if (state.rvh?.playerAction) return state.rvh.playerAction.changeType;
    if (state.rvh?.aiAction)     return state.rvh.aiAction.changeType;
    return null;
  }

  static setPlayerScriptData(namespace, key, value) {
    if (!state.rvh?.playerAction?.scriptData) return;
    if (namespace === '__proto__' || namespace === 'constructor' || namespace === 'prototype') return;
    const sd = state.rvh.playerAction.scriptData;
    if (!Object.prototype.hasOwnProperty.call(sd, namespace)) sd[namespace] = Object.create(null);
    sd[namespace][key] = value;
  }

  static setAiScriptData(namespace, key, value) {
    if (!state.rvh?.aiAction?.scriptData) return;
    if (namespace === '__proto__' || namespace === 'constructor' || namespace === 'prototype') return;
    const sd = state.rvh.aiAction.scriptData;
    if (!Object.prototype.hasOwnProperty.call(sd, namespace)) sd[namespace] = Object.create(null);
    sd[namespace][key] = value;
  }

  static getScriptData(index, namespace, key) {
    if (namespace === undefined) return undefined;
    const hist = state.rvh?.history;
    if (!hist) return undefined;
    const resolved = index < 0 ? hist.length + index : index;
    const entry = hist[resolved];
    if (!entry?.scriptData) return undefined;
    return key !== undefined ? entry.scriptData[namespace]?.[key] : entry.scriptData[namespace];
  }

  static getHistoryLength() {
    return state.rvh?.history?.length ?? 0;
  }

  static getActionCount() {
    return state.rvh?.actionCount ?? 0;
  }

  static _entrySnapshot(e) {
    return { text: e.text, actionType: e.actionType };
  }

  static getEntry(index) {
    const hist = state.rvh?.history;
    if (!hist) return null;
    const resolved = index < 0 ? hist.length + index : index;
    const e = hist[resolved];
    return e ? RevampedHistory._entrySnapshot(e) : null;
  }

  static findEntry(predicate, fromIndex) {
    const hist = state.rvh?.history;
    if (!hist) return null;
    const start = fromIndex !== undefined
      ? (fromIndex < 0 ? hist.length + fromIndex : fromIndex)
      : hist.length - 1;
    for (let i = start; i >= 0; i--) {
      const snap = RevampedHistory._entrySnapshot(hist[i]);
      if (predicate(snap, i)) return { entry: snap, index: i };
    }
    return null;
  }

  static getEntries(start, end) {
    const hist = state.rvh?.history;
    if (!hist) return [];
    return hist.slice(start, end).map(RevampedHistory._entrySnapshot);
  }

  static haveAmbiguous() {
    return !!state.rvh?.ambiguous;
  }

  static getAmbiguousIndex() {
    return state.rvh?.ambiguous?.index ?? null;
  }

  static getAmbiguousText() {
    return state.rvh?.ambiguous?.consideredAlts.map(a => a.text) ?? [];
  }

  static getAmbiguousScriptData(namespace, key) {
    const alts = state.rvh?.ambiguous?.consideredAlts;
    if (!alts) return [];
    return alts.map(a => {
      if (!a.scriptData) return null;
      const ns = a.scriptData[namespace];
      if (!ns) return null;
      return key !== undefined ? (ns[key] ?? null) : ns;
    });
  }
}

function worldTimeGenerator(hook, text) {
  // cooldown.js - Sleep and Advance cooldown tracking (stored in state.wtg.cooldowns)
  
  
  
  // ====================================================================================
  // COOLDOWN HELPERS  (Dynamic Time Only)
  // ====================================================================================
  
  /**
   * Returns true if the [sleep] command is currently on cooldown
   * (i.e. state.turnTime has not yet reached state.sleepAvailableAtTT).
   * @returns {boolean}
   */
  function isSleepCooldownActive() {
    const cd = state.wtg.cooldowns;
    if (!cd.sleepAvailableAtTT || !state.wtg.time.turnTime) return false;
    const available = parseTurnTime(cd.sleepAvailableAtTT);
    return available ? compareTurnTime(state.wtg.time.turnTime, available) < 0 : false;
  }
  
  /**
   * Returns true if the [advance] command is currently on cooldown.
   * @returns {boolean}
   */
  function isAdvanceCooldownActive() {
    const cd = state.wtg.cooldowns;
    if (!cd.advanceAvailableAtTT || !state.wtg.time.turnTime) return false;
    const available = parseTurnTime(cd.advanceAvailableAtTT);
    return available ? compareTurnTime(state.wtg.time.turnTime, available) < 0 : false;
  }
  
  /**
   * Sets the sleep cooldown to expire after the given TurnTime duration from now.
   * @param {{ years?, months?, days?, hours?, minutes? }} duration
   */
  function setSleepCooldown(duration) {
    const tt = addToTurnTime(state.wtg.time.turnTime, duration);
    state.wtg.cooldowns.sleepAvailableAtTT = formatTurnTime(tt);
  }
  
  /**
   * Sets the advance cooldown to expire after the given TurnTime duration from now.
   * @param {{ years?, months?, days?, hours?, minutes? }} duration
   */
  function setAdvanceCooldown(duration) {
    const tt = addToTurnTime(state.wtg.time.turnTime, duration);
    state.wtg.cooldowns.advanceAvailableAtTT = formatTurnTime(tt);
  }
  
  /**
   * Clears both sleep and advance cooldowns.
   * @param {string} [_source] - Ignored; kept for call-site documentation purposes.
   */
  function clearCommandCooldowns(_source) {
    state.wtg.cooldowns.sleepAvailableAtTT   = null;
    state.wtg.cooldowns.advanceAvailableAtTT = null;
  }
  
  /**
   * Clears any cooldowns whose threshold is now in the future relative to newTT.
   * Called after a time rewind so cooldowns that were set beyond the new current
   * time don't become permanently stuck active.
   * @param {{ years, months, days, hours, minutes }} newTT - The new (rewound) TurnTime object.
   */
  function clearFutureCooldowns(newTT) {
    const cd = state.wtg.cooldowns;
    if (cd.sleepAvailableAtTT) {
      const sleepTT = parseTurnTime(cd.sleepAvailableAtTT);
      if (compareTurnTime(sleepTT, newTT) > 0) cd.sleepAvailableAtTT = null;
    }
    if (cd.advanceAvailableAtTT) {
      const advTT = parseTurnTime(cd.advanceAvailableAtTT);
      if (compareTurnTime(advTT, newTT) > 0) cd.advanceAvailableAtTT = null;
    }
  }
  
  
  
  // currentDateTimeCard.js - Manages the "Current Date and Time" storycard, which displays the current in-game date and time and provides command help.
  
  
  
  
  
  
  
  
  
  // ====================================================================================
  // STORYCARD
  // ====================================================================================
  
  
  /**
   * Returns the "Current Date and Time" storycard, creating it if absent.
   * This card is the main user-visible card with the current timestamp and command help.
   * @returns {Object} The storycard object.
   */
  function getCurrentDateTimeCard() {
    return getOrCreateCard(SYSTEM_CARD_TITLES.CURRENT_DATE_TIME, {
      type:        CARD_TYPES.current,
      keys:        "date,time,current date,current time,clock,hour",
      description: "Commands:\n[setStartTime mm/dd/year time AD] - Set starting date, era, and time\n[advance N minutes|hours|days|months|years] - Advance time\n[adv N mi|h|d|mo|y] - Advance time\n[goTo date|time|both] - Advance to a specific date/time\n[goBack date|time|both] - Rewind to a specific date/time (must still be after the initial start t\n[sleep] - Sleep to next morning\n[sleepUntil date|time|both] - Sleep until a specific date/time\n[reset] - Reset to most recent mention in history",
    });
  }
  
  /**
   * Rewrites the "Current Date and Time" card entry with the latest state values.
   * Called after any time change to keep the card in sync.
   */
  function updateDateTimeCard() {
    const card    = getCurrentDateTimeCard();
    const t       = state.wtg.time;
    const dateStr = t.current.date || '01/01/1900';
    const era     = getCurrentEra();
    const day     = getDayOfWeek(dateStr, era);
  
    let dateDisplay = formatDateForDisplay(dateStr, era);
    if (day) dateDisplay += ` ${day}`;
  
    let entry = `Current date: ${dateDisplay}\nCurrent time: ${formatTimeForDisplay(t.current.time || 'Unknown')}`;
    if (getDtCardShowPhase() && t.current.time && t.current.time !== 'Unknown') {
      const phase = getCurrentPhase(t.current.time);
      if (phase) entry += `\nCurrent phase: ${phase}`;
    }
    card.entry = entry;
  }
  
  
  
  // entities.js - Normal-mode entity management, system init, input/output markers, legacy stubs
  
  
  
  
  
  
  
  
  
  
  
  
  
  /**
   * Title-cases a name (e.g. 'john doe' → 'John Doe').
   * @param {string} name
   * @returns {string}
   */
  function normalizeNameCase(name) {
    if (!name) return name;
    return name.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
  }
  
  /**
   * Strips leading/trailing non-alphanumeric characters from an entity name.
   * @param {string} name
   * @returns {string}
   */
  function sanitizeEntityName(name) {
    if (!name) return '';
    return name.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
  }
  
  /**
   * Generates storycard key variants for an entity name: lowercase and kebab-case.
   * @param {string} entityName
   * @returns {string[]}
   */
  function normalizeKeysFor(entityName) {
    if (!entityName) return [];
    const lower = entityName.toLowerCase();
    const kebab = lower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const uniqueKeys = new Set([lower, kebab].filter(k => k.length > 0));
  
    return  [...uniqueKeys];
  }
  
  /**
   * Returns an existing storycard with the given title, or creates and returns a new one.
   * Returns null for empty titles or protected system card names.
   * @param {string} title
   * @returns {Object|null}
   */
  function getOrCreateEntityCard(title, type = null) {
    if (!title || title.trim() === '') return null;
    const trimmed = title.trim();
    const lower   = trimmed.toLowerCase();
  
    if (Object.values(SYSTEM_CARD_TITLES).some(t => t.toLowerCase() === lower)) {
      DuckieDebug.duckieDebug(`findOrCreateCard: refusing to create/overwrite system card "${trimmed}"`, DuckieDebug.duckieDebugMode.ERROR);
      return null;
    }
  
    if (type) {
      // Find an existing card matching both title and type so that same-named cards of
      // different types (e.g. "Eden" character vs "Eden" location) coexist correctly.
      const existing = storyCards.find(c => c.title.toLowerCase() === lower && c.type === type);
      if (existing) return existing;
      addStoryCard(trimmed);
      return storyCards[storyCards.length - 1];
    }
  
    return getOrCreateCard(trimmed);
  }
  
  
  const ENTITY_BLACKLIST = new Set([
    'sleep','advance',
    'i','me','my','mine','myself','you','your','yours','yourself','yourselves',
    'he','him','his','himself','she','her','hers','herself','it','its','itself',
    'we','us','our','ours','ourselves','they','them','their','theirs','themselves',
    'this','that','these','those','who','whom','whose','which','what',
    'someone','somebody','something','somewhere','anyone','anybody','anything','anywhere',
    'everyone','everybody','everything','everywhere','no one','nobody','nothing','nowhere',
    'one','ones','other','others','another','each','every','either','neither','both',
    'all','some','any','none','few','many','several','much','more','most','less','least',
    'whoever','whomever','whatever','whichever'
  ]);
   
  const _STOPWORDS = new Set([
    'a','an','the',
    'of','in','on','at','to','for','with','by','from','into','about',
    'and','or','but','nor','so','yet',
  ]);
  
  /**
   * Checks whether a new entity name substantially overlaps with any existing card title.
   * When fuzzy=false, only exact title match (case-insensitive) is used.
   * @param {string} name
   * @param {Object[]} cards - Storycards to check against (pre-filtered by type).
   * @param {boolean} fuzzy
   * @returns {{ isDuplicate: boolean, existingCard: Object|null }}
   */
  function _isDuplicate(name, cards, fuzzy) {
    const nl = name.toLowerCase().trim();
    for (const card of cards) {
      const el = card.title.toLowerCase().trim();
      if (nl === el) return { isDuplicate: true, existingCard: card };
      if (!fuzzy) continue;
      // Substring containment
      if (el.includes(nl) || nl.includes(el)) return { isDuplicate: true, existingCard: card };
      // Word overlap — filter stopwords before comparing
      const nw = nl.split(/\s+/).filter(w => !_STOPWORDS.has(w));
      const ew = el.split(/\s+/).filter(w => !_STOPWORDS.has(w));
      if (nw.length === 0 || ew.length === 0) continue;
      const common = nw.filter(w => ew.some(e => e.includes(w) || w.includes(e)));
      if (common.length > 0 && common.length / Math.max(nw.length, ew.length) > 0.5) {
        return { isDuplicate: true, existingCard: card };
      }
    }
    return { isDuplicate: false, existingCard: null };
  }
  
  function builtRegex(depth){
    let openGuard = `(?<!\\()`;
    let open = `\\({${depth}}`;
    open = `${openGuard}(?:${open})`;
    let content = `([^\\(]+?)`;
    let close = `\\){${depth}}`;
    let closeGuard = `(?!\\))`;
    close = `(?:${close})${closeGuard}`;
    let full = `${open}${content}${close}`;
  
    return new RegExp(full, 'g');
  }
  
  
  function getParens(text){
    const matches = [];
  
    for (let depth = 3; depth >= 1; depth--) {
      const re = builtRegex(depth);
      matches.push([...text.matchAll(re)]);
    }
  
    matches.reverse();
    return matches;
  }
  
  function extractContent(fullSnippet){
    const split = fullSnippet.split(')');
  
    let name, type, description = '';
    if ( split.length == 0 || split.length > 3 ) return null;
  
    name = split[0].trim();
    if (split.length == 3){
      type = 'location';
      description = `${split[0]}${split[2]}`.trim();
    }else if (split.length == 2){
      type = 'character';
      description = `${split[0]}${split[1]}`.trim();
    }
  
    return { fullSnippet: `(((${fullSnippet})))`, name, type, description };
  }
  
  // Inner Self thought blocks always contain '=' (key=value delimiter) and/or backticks.
  // Valid entity names never contain either. Filter them out to avoid creating garbage cards
  // when WTG runs before Inner Self in the output hook.
  const isThoughtBlock = (s) => s.includes('=') || s.includes('`');

function labelContent(matches){
  const labeled = [];

  labeled.push(...matches[0].filter(m => !isThoughtBlock(m[1])).map(m=> {return { fullSnippet: `(${m[1]})`, name: m[1], type: 'character', description: m[1]}}));
  labeled.push(...matches[1].filter(m => !isThoughtBlock(m[1])).map(m=> {return { fullSnippet: `((${m[1]}))`, name: m[1], type: 'location', description: m[1]}}));
  labeled.push(...matches[2].filter(m => !isThoughtBlock(m[1])).map(m=> {return extractContent(m[1])}));

  return labeled;
}

function regexEscape(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Creates or updates a single entity story card from a labeled entity object.
 * Respects the per-type setting flags and runs duplicate detection.
 * @param {{ name: string, type: string, description: string }} entity
 */

function makeEntityCard(entity) {
  const { name, type, description } = entity;
  const charEnabled = getWTGBooleanSetting("Enable Generated Character Cards");
  const locEnabled  = getWTGBooleanSetting("Enable Generated Location Cards");
  if ((type === 'character' && !charEnabled) || (type === 'location' && !locEnabled)) return;

  DuckieDebug.duckieDebug(`makeEntityCard: ${JSON.stringify(entity)}`, DuckieDebug.duckieDebugMode.INFORM);
  const typeCards = storyCards.filter(c => c.type === type);
  const dup = _isDuplicate(name, typeCards, getWTGBooleanSetting("Enable Fuzzy Duplicate Matching"));

  if (dup.isDuplicate) {
    const card = dup.existingCard;
    if (description) {
      card.entry = card.entry ? card.entry + '\n' + description : description;
    }
  } else {
    const card = getOrCreateEntityCard(name, type);
    if (!card) return;
    card.type  = type;
    card.keys  = normalizeKeysFor(name).join(',');
    card.entry = description;
    DuckieDebug.duckieDebug(`card: ${JSON.stringify(card)}`, DuckieDebug.duckieDebugMode.INFORM);
  }
}

/**
 * Detects entity paren syntax in output text and returns command objects for
 * each enabled entity type, ready to flow through the command pipeline.
 * @param {string} text
 * @returns {Object[]}
 */

function getEntityCommands(text) {
  const charEnabled = getWTGBooleanSetting("Enable Generated Character Cards");
  const locEnabled  = getWTGBooleanSetting("Enable Generated Location Cards");
  if (!charEnabled && !locEnabled) return [];

  const parens  = getParens(text);
  const labeled = labelContent(parens);

  const toCommand = item => ({
    full:           item.fullSnippet,
    commandName:    'gencard',
    rawArgs:        [],
    args:           { name: item.name, type: item.type, description: item.description },
    regexString:    regexEscape(item.fullSnippet),
    replacement:    item.name,
    isAutoDetected: true,
  });

  // All syntactically valid entities — used to clean searchText in repairBrokenParens so the
  // repair regex is not confused by properly-closed entities whose type happens to be disabled.
  const allValidCommands = labeled.filter(item => item && item.name).map(toCommand);

  const validCommands = allValidCommands.filter(cmd =>
    (cmd.args.type === 'character' && charEnabled) || (cmd.args.type === 'location' && locEnabled)
  );

  const repairedCommands = repairBrokenParens(text, allValidCommands);
  return validCommands.concat(repairedCommands);
}

/**
 * Detects and salvages truncated entity paren syntax at the end of text (token cutoff).
 * Returns command objects in the same shape as getEntityCommands, ready for handleCommands.
 * @param {string} text
 * @param {Object[]} validCommands - already-detected valid commands (to avoid double-processing)
 * @returns {Object[]}
 */

function repairBrokenParens(text, validCommands) {
  const charEnabled = getWTGBooleanSetting("Enable Generated Character Cards");
  const locEnabled  = getWTGBooleanSetting("Enable Generated Location Cards");

  // Run repair on text with valid entities already removed — prevents the repair regex from
  // greedily matching a valid entity's opening parens followed by trailing text after its close.
  let searchText = text;
  for (const cmd of validCommands) {
    searchText = searchText.replace(new RegExp(cmd.regexString, 'g'), cmd.replacement ?? '');
  }

  // Regexes anchored to end of string, ordered depth 3→1.
  // Depth-3 content allows ')' (name/desc separator); depths 1-2 disallow '(' and ')'.
  // Depth-2 allows one optional partial closing ')' at end (e.g. "((Name)" = 1 of 2 closes).
  const patterns = [
    { depth: 3, re: /(?<!\()(?:\({3})([^(]+?)\s*$/         },
    { depth: 2, re: /(?<!\()(?:\({2})([^()]+?)\){0,1}\s*$/ },
    { depth: 1, re: /(?<!\()(?:\()([^()]+?)\s*$/           },
  ];

  for (const { depth, re } of patterns) {
    const match = searchText.match(re);
    if (!match) continue;

    const fullBroken = match[0].trimEnd();
    let innerContent = match[1].trimEnd();

    // Depth-3 content may contain partial closing parens (up to 2) — strip them before parsing
    if (depth === 3) {
      innerContent = innerContent.replace(/\){0,2}$/, '').trimEnd();
    }

    // Skip Inner Self thought blocks (always contain '=' or backticks)
    if (isThoughtBlock(innerContent)) return [];

    let name, type, description;

    if (depth === 3) {
      const parsed = extractContent(innerContent);
      if (!parsed || !parsed.name || !parsed.type) {
        // split.length === 1: name was cut before the first ')' separator — default character
        name        = sanitizeEntityName(innerContent);
        type        = 'character';
        description = name;
      } else {
        name        = parsed.name;
        type        = parsed.type;
        description = parsed.description || name;
      }
    } else if (depth === 2) {
      name        = sanitizeEntityName(innerContent);
      type        = 'location';
      description = name;
    } else {
      name        = sanitizeEntityName(innerContent);
      type        = 'character';
      description = name;
    }

    name = sanitizeEntityName(name);
    if (!name || ENTITY_BLACKLIST.has(name.toLowerCase())) {
      // Blacklisted or empty: strip the broken syntax but create no card.
      // Use commandName 'gencard' with null args so executeCommands skips makeEntityCard
      // but cleanUpCommands still replaces the text.
      return [{
        full:           fullBroken,
        commandName:    'gencard',
        rawArgs:        [],
        args:           null,
        regexString:    regexEscape(fullBroken),
        replacement:    '',
        isAutoDetected: true,
        isRepaired:     true,
      }];
    }

    if ((type === 'character' && !charEnabled) || (type === 'location' && !locEnabled)) continue;

    DuckieDebug.duckieDebug(`repairBrokenParens: salvaged depth=${depth} name="${name}" type="${type}"`, DuckieDebug.duckieDebugMode.INFORM);

    return [{
      full:           fullBroken,
      commandName:    'gencard',
      rawArgs:        [],
      args:           { name, type, description },
      regexString:    regexEscape(fullBroken),
      replacement:    name,
      isAutoDetected: true,
      isRepaired:     true,
    }];
  }

  return [];
}



// exclusion.js - Processes exclusion markers on storycards, moving them from entry to description.

/**
 * Checks for a [e] or [wtg-no-timestamp] exclusion marker in either the card
 * entry or description. If found: strips all marker variants from entry (and
 * the /] placeholder), strips them from description, writes the canonical
 * [wtg-no-timestamp] into description. [e] is treated as an alias and upgraded
 * on first encounter.
 * @param {Object} card - A storycard object.
 * @returns {boolean} True if a marker was found and processed.
 */

function processExclusionMarker(card) {
  if (!card) return false;
  const MARKER = /\[wtg-no-timestamp\]|\[e\]/gi;
  const inEntry = card.entry       && MARKER.test(card.entry);
  MARKER.lastIndex = 0;
  const inDesc  = card.description && MARKER.test(card.description);
  if (!inEntry && !inDesc) return false;

  if (card.entry) {
    card.entry = card.entry.replace(/\[wtg-no-timestamp\]|\[e\]/gi, '')
                           .replace(/\/\]/g, '').trim();
  }
  if (card.description) {
    card.description = card.description.replace(/\[wtg-no-timestamp\]|\[e\]/gi, '').trim();
  }
  card.description = card.description
    ? card.description + '\n[wtg-no-timestamp]'
    : '[wtg-no-timestamp]';

  return true;
}


// Story card manipulation utilities for WTG. These functions abstract away the details of how story cards are stored and manipulated, providing a simpler interface for common operations like finding, creating, and deleting story cards by title.

function deleteStoryCardByTitle(title) {
  const index = storyCards.findIndex(c => c.title === title);
  DuckieDebug.duckieDebug(`Attempting to delete story card with title "${title}". Found index: ${index}`, DuckieDebug.duckieDebugMode.INFORM);
  if (index !== -1) {
    removeStoryCard(index);
  }
}

/**
 * Returns an existing storycard by title, creating and initializing it if absent.
 *
 * @param {string} title - The card title to find or create.
 * @param {Object} defaults - Fields to set on the card when first created.
 *   All fields are optional; unspecified fields are left at addStoryCard() defaults.
 * @param {function(Object): void} [onRepair] - Optional callback invoked on every
 *   call (create or find) for post-creation or repair logic. Receives the card.
 * @returns {Object|null} The storycard, or null if creation failed.
 */

function getOrCreateCard(title, defaults = {}, onRepair = null) {
  let card = getStoryCardEntryByTitle(title);
  if (!card) {
    addStoryCard(title);
    card = getStoryCardEntryByTitle(title);
    if (card) {
      Object.assign(card, defaults);
    }
  }
  if (card && onRepair) onRepair(card);
  return card;
}

function getStoryCardEntryByTitle(title) {
  const card = storyCards.find(c => c.title === title);
  return card ? card : null;
}



// storycards.js - Storycard CRUD, timestamps, exclusions, settings, and cooldowns 






// ====================================================================================
// CONSTANTS
// ====================================================================================

const TIMESTAMP_VERBS = {
  CHARACTER: 'Met on',
  LOCATION:  'Visited',
  DEFAULT:   'Discovered on',
};

/** Card keys that identify a location-type card even without an explicit type field. */
const LOCATION_KEYS = ['location', 'place', 'city', 'town', 'village', 'building'];

/** Placeholder timestamp values written before the real date is known. */
const PLACEHOLDER_TIMESTAMPS = ['Unknown', '01/01/1900'];

/** Marker text embedded in generated-character card descriptions. */
const GENERATED_CHAR_MARKER   = 'Generated character';
const UNDISCOVERED_CHAR_LABEL = 'Character not currently discovered';



// ====================================================================================
// INTERNAL HELPERS
// ====================================================================================

/**
 * Returns true if the card is a generated character that has not yet been
 * discovered in the story (i.e. should be skipped for timestamping).
 * @param {Object} card
 * @returns {boolean}
 */

function isUndiscoveredGeneratedCard(card) {
  return card && card.description &&
    card.description.includes(GENERATED_CHAR_MARKER) &&
    card.description.includes('not yet discovered in story');
}

/**
 * Chooses the appropriate timestamp verb for a card based on its type and keys.
 * @param {Object} card
 * @returns {string}
 */

function resolveTimestampVerb(card) {
  if (
    card.type === 'character' ||
    (card.description && card.description.includes(GENERATED_CHAR_MARKER))
  ) {
    return TIMESTAMP_VERBS.CHARACTER;
  }

  const isLocationType = ['location', 'place', 'area'].includes(card.type);
  const hasLocationKey = card.keys &&
    LOCATION_KEYS.some(k => card.keys.includes(k));

  if (isLocationType || hasLocationKey) {
    return TIMESTAMP_VERBS.LOCATION;
  }

  return TIMESTAMP_VERBS.DEFAULT;
}

/**
 * Returns true if the timestamp string contains a known placeholder value.
 * @param {string} timestamp
 * @returns {boolean}
 */

function isPlaceholderTimestamp(timestamp) {
  return PLACEHOLDER_TIMESTAMPS.some(p => timestamp.includes(p));
}



// ====================================================================================
// TIMESTAMPS
// ====================================================================================

/**
 * Appends a discovery/visit timestamp line to a storycard entry if none exists yet.
 * Chooses verb ('Met on' / 'Visited' / 'Discovered on') based on card type.
 * No-op if the card is excluded, undiscovered (generated/not yet found), or timestamp is Unknown.
 * @param {Object} card - The storycard to stamp.
 * @param {string} timestamp - Display-format datetime string.
 * @param {boolean} [isGenerated=false] - Appends '(generated)' label in normal mode.
 */

function addTimestampToCard(card, timestamp, isGenerated = false) {
  if (!getEnableCardTimestamps()) return;
  if (card?.description?.includes('[wtg-no-timestamp]')) return;

  const bothGeneratedModesEnabled =
    getIsGeneratedCharacterCardsEnabled() && getIsGeneratedLocationCardsEnabled();

  if (bothGeneratedModesEnabled && isUndiscoveredGeneratedCard(card)) return;
  if (timestamp && isPlaceholderTimestamp(timestamp)) return;

  if (card && card.entry != null && !hasTimestamp(card)) {
    const verb     = resolveTimestampVerb(card);
    const genLabel = (bothGeneratedModesEnabled && isGenerated) ? ' (generated)' : '';

    if (card.entry.includes('/]')) {
      card.entry = card.entry.replace('/]', `${verb} ${timestamp}${genLabel}`);
    } else {
      const trimmed = card.entry.trimEnd();
      const first   = trimmed[0];
      const last    = trimmed[trimmed.length - 1];
      const isBracketed =
        (first === '[' && last === ']') ||
        (first === '{' && last === '}');

      if (isBracketed) {
        card.entry = trimmed.slice(0, -1) + `\n${verb} ${timestamp}${genLabel}\n` + last;
      } else {
        card.entry = card.entry
          ? card.entry + `\n${verb} ${timestamp}${genLabel}`
          : `${verb} ${timestamp}${genLabel}`;
      }
    }
  }
}

/**
 * Returns true if the storycard entry already contains a discovery/visit timestamp.
 * @param {Object} card
 * @returns {boolean}
 */

function hasTimestamp(card) {
  return card && card.entry && (
    card.entry.includes(TIMESTAMP_VERBS.DEFAULT) ||
    card.entry.includes(TIMESTAMP_VERBS.CHARACTER) ||
    card.entry.includes(TIMESTAMP_VERBS.LOCATION)
  );
}

/**
 * Returns true if any of the card's comma-separated keys appear as a whole word in text.
 * @param {Object} card @param {string} text
 * @returns {boolean}
 */

function isCardKeywordMentioned(card, text) {
  if (!card || !card.keys || !text) return false;
  for (const rawKey of card.keys.split(',')) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    if (new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) return true;
  }
  return false;
}

/**
 * Replaces placeholder timestamps (Unknown / 01/01/1900) on all story cards
 * with the given date/time. Only touches cards that already have a timestamp line.
 * @param {string} newDate - Storage-format date.
 * @param {string} newTime - Display-format time.
 */

function updateAllStoryCardTimestamps(newDate, newTime) {
  if (!getEnableCardTimestamps()) return;
  const timestamp = formatDateTimeForDisplay(newDate, newTime, getCurrentEra());
  const lineRegex = /((?:Discovered on|Met on|Visited)) [^\n]+?(\s+\(generated\))?$/m;

  for (const card of storyCards) {
    if (card.title === SYSTEM_CARD_TITLES.WTG_DATA ||
        card.title === SYSTEM_CARD_TITLES.CURRENT_DATE_AND_TIME) continue;

    if (hasTimestamp(card) && isPlaceholderTimestamp(card.entry)) {
      card.entry = card.entry.replace(lineRegex, (_, verb, gen = '') => `${verb} ${timestamp}${gen}`);
    }
  }
}

/**
 * Resets all generated character cards to "not yet discovered" status.
 * Strips timestamp lines and normalizes their description text.
 * Called on [reset] to clear future discovery state after a rewind.
 */

function markAllCharactersAsNotDiscovered() {
  for (const card of storyCards) {
    if (card.title === SYSTEM_CARD_TITLES.WTG_DATA ||
        card.title === SYSTEM_CARD_TITLES.CURRENT_DATE_TIME) continue;

    if (card.description && card.description.includes(GENERATED_CHAR_MARKER)) {
      card.description = card.description
        .replace(/Generated character discovered on .+/, UNDISCOVERED_CHAR_LABEL)
        .replace(/\nGenerated character \(not yet discovered in story\)/, `\n${UNDISCOVERED_CHAR_LABEL}`);

      if (!card.description.includes(UNDISCOVERED_CHAR_LABEL)) {
        card.description += `\n${UNDISCOVERED_CHAR_LABEL}`;
      }

      if (card.entry) {
        card.entry = card.entry.replace(/\n\nDiscovered on .+/, '');
      }
    }
  }
}



// timePhasesCard.js - Manages the "WTG Time Phases" storycard and phase parsing.


const PHASE_LINE_RE = /^([^:]+):\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s*$/i;

// ====================================================================================
// TIME CONVERSION HELPER
// ====================================================================================

/**
 * Converts a display-format 12-hour time string (e.g. '4:00 AM') to minutes since
 * midnight (0–1439). Returns -1 if unparseable.
 * @param {string} str
 * @returns {number}
 */

function _timeStrToMinutes(str) {
  if (!str) return -1;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return -1;
  let hour = parseInt(m[1], 10);
  const min  = parseInt(m[2], 10);
  const per  = m[3].toUpperCase();
  if (per === 'PM' && hour !== 12) hour += 12;
  if (per === 'AM' && hour === 12) hour = 0;
  return hour * 60 + min;
}

// ====================================================================================
// DEFAULT ENTRY BUILDER
// ====================================================================================

function _buildDefaultEntry() {
  return DEFAULT_TIME_PHASES
    .map(p => `${p.name}: ${p.start} - ${p.end}`)
    .join('\n');
}

// ====================================================================================
// STORYCARD
// ====================================================================================

/**
 * Returns the "WTG Time Phases" storycard, creating it with defaults if absent.
 * Does NOT set keys — this is scripting data, not AI context. Any keys the user
 * manually adds are preserved unchanged.
 * @returns {Object} The storycard object.
 */

function getTimePhasesCard() {
  return getOrCreateCard(SYSTEM_CARD_TITLES.WTG_TIME_PHASES, {
    type:        CARD_TYPES.system,
    keys:        '',
    description: 'Time phase definitions used by WTG. Format each line as:\nPhase Name: H:MM AM - H:MM PM\nPhase names can be multiple words. Gaps between phases are allowed.',
    entry:       _buildDefaultEntry(),
  });
}

// ====================================================================================
// PHASE PARSING
// ====================================================================================

/**
 * Parses the "WTG Time Phases" storycard into an array of phase objects.
 *
 * Fallback chain (last-known-good):
 *   1. Successful parse → saved to state.wtg.phases, returned.
 *   2. Failed/empty parse → state.wtg.phases if present, returned.
 *   3. state.wtg.phases absent → DEFAULT_TIME_PHASES converted to parsed form.
 *
 * Each returned object: { name: string, startMinutes: number, endMinutes: number }
 * @returns {Array<{name: string, startMinutes: number, endMinutes: number}>}
 */

function getParsedTimePhases() {
  const card  = getTimePhasesCard();
  const lines = (card.entry || '').split('\n');
  const parsed = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(PHASE_LINE_RE);
    if (!m) continue;
    const name         = m[1].trim();
    const startMinutes = _timeStrToMinutes(m[2]);
    const endMinutes   = _timeStrToMinutes(m[3]);
    if (startMinutes < 0 || endMinutes < 0) continue;
    parsed.push({ name, startMinutes, endMinutes });
  }

  if (parsed.length > 0) {
    if (state.wtg) state.wtg.phases = parsed;
    return parsed;
  }

  if (state.wtg?.phases?.length > 0) return state.wtg.phases;

  return DEFAULT_TIME_PHASES.map(p => ({
    name:         p.name,
    startMinutes: _timeStrToMinutes(p.start),
    endMinutes:   _timeStrToMinutes(p.end),
  }));
}


// -------------------------------------------------
// Utility functions for parsing and executing commands from input and output text
// -------------------------------------------------

function makeCommandRegexString(isPlayerCommand) {
  const openParen  = isPlayerCommand ? `\\[` : `\\(`;
  const closeParen = isPlayerCommand ? `\\]` : `\\)`;
  return `${openParen}([^${closeParen}]*)${closeParen}`;
}

function splitArguments(commandString) {
  const commandParts = commandString.split(/\s+/);
  const commandName  = commandParts[0] ? commandParts[0].toLowerCase() : '';
  const rawArgs      = commandParts.slice(1);
  return { commandName, rawArgs };
}

function regexEscape(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// -------------------------------------------------
// Command Parsing
// -------------------------------------------------

/* parseCommandsBroad takes in text and returns an array of command objects:
* {
*   full: the full command string as it appeared in the text (e.g. "[advance 2 hours]"),
*   commandName: the name of the command (e.g. "advance"),
*   rawArgs: an array of the raw arguments as strings (e.g. ["2", "hours"]),
*   regexString: regex-escaped version of full, for text replacement
* }
*/

function parseCommandsBroad(text, isPlayerCommand = false) {
  const regex = new RegExp(makeCommandRegexString(isPlayerCommand), 'g');
  const bracketCommands = [...text.matchAll(regex)].map(match => {
    const { commandName, rawArgs } = splitArguments(match[1]);
    const cmd = { full: match[0], commandName, rawArgs, regexString: regexEscape(match[0]) };
    if (commandName === 'gencard') cmd.args = extractContent(match[0]);
    return cmd;
  });

  const validBracketFulls = new Set(
    bracketCommands.filter(c => ALLOWED_COMMANDS[0].includes(c.commandName)).map(c => c.full)
  );
  const entityCommands = getEntityCommands(text);
  return bracketCommands.concat(entityCommands.filter(c => !validBracketFulls.has(c.full)));
}

/* parseCommandsSpecific filters to allowed commands and preprocesses args into a dict.
* Adds command.args (preprocessed dict) and optionally command.error.
*/

function parseCommandsSpecific(commands, allowedCommands) {
  commands = commands.filter(cmd => allowedCommands.includes(cmd.commandName));

  for (const command of commands) {
    if (command.commandName === 'adv') command.commandName = 'advance';
    if (command.commandName === 'setstarttime') {
      command.args = parseSetStartTimeCommand(command);
    } else if (command.commandName === 'advance') {
      command.args = parseAdvanceSleepCommand(command);
    } else if (command.commandName === 'sleep') {
      command.args = command.rawArgs.length > 0
        ? parseAdvanceSleepCommand(command)
        : parseRandomSleepCommand();
    } else if (command.commandName === 'goto' || command.commandName === 'goback' || command.commandName === 'sleepuntil') {
      command.args = parseGoToCommand(command);
    } else if (command.commandName === 'reset') {
      command.args = {};
    } else if (command.commandName === 'time') {
      command.args = {};
    }
  }

  return commands;
}

/* parseSetStartTimeCommand: rawArgs is already an array like ["01/01/2023", "AD", "8:00", "AM"].
* Returns a normalised dict { startingDate, startingTime, startingEra } or sets command.error.
*/

function parseSetStartTimeCommand(command) {
  const parts   = command.rawArgs;
  const dateStr = parts[0];
  const timeStr = parts.slice(1).join(' ');

  const parsed = normalizeSettimeArgs(dateStr, timeStr, DEFAULT_WTG_ERA);

  if (!dateStr || !parsed) {
    command.error = `${command.full} contains an invalid date/time. Correct example: [setStartTime 06/15/2023 AD 8:00 AM]`;
    return { startingDate: '', startingTime: '', startingEra: '' };
  }
  return parsed;
}

/* parseGoToCommand: accepts a date (MM/DD/YYYY), a time (H:MM AM/PM or military), or both in
* any order. Returns { targetDate, targetTime, targetEra, ambiguousTime } or sets command.error.
* ambiguousTime is true when no AM/PM was given and the hour is ≤ 12 (not clearly military);
* execution resolves AM vs PM by picking whichever candidate is nearer the current time.
*/

function parseGoToCommand(command) {
  const rawArgs = command.rawArgs;

  // Separate the date token (contains two '/') from the remaining time tokens, in any order.
  const dateTokenIdx = rawArgs.findIndex(t => /^\d+\/\d+\/\d+$/.test(t));
  let targetDate     = null;
  let timeTokens;

  if (dateTokenIdx !== -1) {
    targetDate = rawArgs[dateTokenIdx];
    timeTokens = rawArgs.filter((_, i) => i !== dateTokenIdx);
  } else {
    timeTokens = [...rawArgs];
  }

  const targetTimeRaw = timeTokens.join(' ').trim();

  if (!targetDate && !targetTimeRaw) {
    command.error = `${command.full} requires a date (MM/DD/YYYY), a time (H:MM AM/PM or military), phase name, day of week, or both.`;
    return {};
  }

  // If there's no date token and no numeric time, check for a phase name or day-of-week.
  if (!targetDate && targetTimeRaw && !/\d/.test(targetTimeRaw)) {
    const lower  = targetTimeRaw.toLowerCase();
    const phases = getParsedTimePhases();
    const sorted = [...phases].sort((a, b) => b.name.length - a.name.length);
    const phase  = sorted.find(p => p.name.toLowerCase() === lower);
    if (phase) return { targetPhase: phase.name };

    const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const ABBR = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
    if (DAYS.includes(lower) || lower.slice(0,3) in ABBR) {
      return { targetDOW: targetTimeRaw };
    }

    command.error = `${command.full}: "${targetTimeRaw}" is not a recognised time, phase name, or day of week.`;
    return {};
  }

  // Validate date if present.
  if (targetDate) {
    const parsed = parseDateString(targetDate, DEFAULT_WTG_ERA);
    if (!parsed || !isValidDate(parsed.month, parsed.day, parsed.year, parsed.era)) {
      command.error = `${command.full} contains an invalid date. Example: [goTo 06/15/2025 8:00 AM]`;
      return {};
    }
  }

  // Parse time if present.
  let targetTime    = '';
  let targetEra     = DEFAULT_WTG_ERA;
  let ambiguousTime = false;

  if (targetTimeRaw) {
    const extracted = parseTimeAndEraInput(targetTimeRaw, DEFAULT_WTG_ERA);
    targetEra  = extracted.era;
    targetTime = extracted.time;

    const { hour } = parseTime(targetTime);
    if (isNaN(hour)) {
      command.error = `${command.full} contains an invalid time. Example: [goTo 8:00 AM] or [goTo 14:30]`;
      return {};
    }

    const hasMeridiem = /\b(am|pm)\b/i.test(targetTimeRaw);
    ambiguousTime = !hasMeridiem && hour !== 0 && hour <= 12;
  }

  return { targetDate, targetTime, targetEra, ambiguousTime };
}

/* parseAdvanceSleepCommand: rawArgs is already an array like ["2", "hours"].
* Returns a time-delta dict e.g. { hours: 2 } or sets command.error.
*/

function parseAdvanceSleepCommand(command) {
  const parts  = command.rawArgs;
  const amount = parseInt(parts[0], 10);
  const unit   = parts[1] ? parts[1].toLowerCase() : '';

  if (isNaN(amount) || amount <= 0 || unit === '') {
    command.error = `${command.full} is an invalid command. Example: [advance 2 hours]`;
    return {};
  }

  let add = {};
  // accept liberal spelling — check just enough prefix to identify the unit
  if      (unit.startsWith('y'))  add.years   = amount;
  else if (unit.startsWith('mo')) add.months  = amount;
  else if (unit.startsWith('w'))  add.days    = amount * 7;
  else if (unit.startsWith('d'))  add.days    = amount;
  else if (unit.startsWith('h'))  add.hours   = amount;
  else if (unit.startsWith('mi')) add.minutes = amount;
  else {
    command.error = `${command.full}: unrecognised unit "${unit}". Example: [advance 2 hours]`;
    return {};
  }

  return add;
}

/* parseRandomSleepCommand: generates a random 6-9 hour sleep duration. */

function parseRandomSleepCommand() {
  return {
    hours:   Math.floor(Math.random() * 3) + 6,
    minutes: Math.floor(Math.random() * 60),
  };
}


// -------------------------------------------------
// Command Execution
// -------------------------------------------------

/* executeCommands applies state side-effects for each parsed command.
* Nudge strings are generated separately by generateStoryNudge.
* For AI commands (isPlayer = false), cooldown checks suppress duplicate advances.
* Returns { commands, timeModified } — timeModified is true if any command changed the time.
*/

function executeCommands(commands, isPlayer) {
  let timeModified = false;
  for (const command of commands) {
    if (command.error) continue;

    if (command.commandName === 'setstarttime') {
      playerCommandSetStartTime(command.args);
      timeModified = true;
    } else if (command.commandName === 'advance') {
      if (isPlayer || !isAdvanceCooldownActive()) {
        playerCommandAdvance(command.args);
        timeModified = true;
      } else {
        command.skipped = true;
      }
    } else if (command.commandName === 'sleep') {
      if (isPlayer || !isSleepCooldownActive()) {
        playerCommandSleep(command.args);
        timeModified = true;
      } else {
        command.skipped = true;
      }
    } else if (command.commandName === 'goto') {
      const result = playerCommandGoTo(command.args);
      if (result.error) command.storyNudge = result.error;
      else { command.args = result.diff; timeModified = true; }
    } else if (command.commandName === 'goback') {
      const result = playerCommandGoBack(command.args);
      if (result.error) command.storyNudge = result.error;
      else { command.args = result.diff; timeModified = true; }
    } else if (command.commandName === 'sleepuntil') {
      const result = playerCommandSleepUntil(command.args);
      if (result.error) command.storyNudge = result.error;
      else { command.args = result.diff; timeModified = true; }
    } else if (command.commandName === 'reset') {
      playerCommandReset();
      timeModified = true;
    } else if (command.commandName === 'time') {
      // read-only — no state change
    } else if (command.commandName === 'gencard') {
      if (command.args && !command.error) {
        makeEntityCard(command.args);
      }
    }
  }
  return { commands, timeModified };
}


// -------------------------------------------------
// Command Cleanup and Text Manipulation
// -------------------------------------------------

/* cleanUpCommands removes/replaces commands in text and inserts story nudges.
*
* cleanMode:
*   'full'     — remove commands entirely, no nudges
*   'prepend'  — remove commands, prepend all nudges as a block
*   'in-place' — replace each command (or adjacent group) with its nudge
*
* mergeMode:
*   'none'          — each command produces its own nudge
*   'command-based' — adjacent same-type commands are merged into one nudge
*   'all'           — all nudges are merged into one bracketed string
*/

function cleanUpCommands(text, commands, cleanMode, mergeMode, locCache) {
  if (!commands.length) return text;
  for (const cmd of commands) {
  }

  let groupedCommands = [];

  if (cleanMode === 'in-place') {
    groupedCommands = inPlaceCommandGrouping(text, commands);
  } else {
    groupedCommands.push(commands);
  }

  for (const group of groupedCommands) {
    text = cleanUpGroupedCommands(text, group, cleanMode, mergeMode, locCache);
  }

  return text;
}

function cleanUpGroupedCommands(text, groupedCommands, cleanMode, mergeMode, locCache) {
  const originalCommands = [...groupedCommands];

  groupedCommands = generateNudgeForCommandGroup(groupedCommands, mergeMode, locCache);

  // Remove commands from text for full-removal or prepend modes
  if (cleanMode === 'prepend' || cleanMode === 'full') {
    for (const cmd of originalCommands) {
      text = text.replace(new RegExp(cmd.regexString, 'g'), cmd.replacement ?? '');
    }
    text = text.replace(/ {2,}/g, ' ').trim();
  }

  // Build nudge string from non-skipped commands
  const activeCommands = groupedCommands.filter(cmd => !cmd.skipped && cmd.storyNudge);
  let nudges = '';
  if (activeCommands.length > 0) {
    if (mergeMode === 'all') {
      nudges = `[${activeCommands.map(cmd => cmd.storyNudge).join(' ')}]`;
    } else {
      nudges = activeCommands.map(cmd => `[${cmd.storyNudge}]`).join('\n');
    }
  }

  if (cleanMode === 'prepend' && nudges) {
    text = nudges + (text ? '\n' + text : '');
  } else if (cleanMode === 'in-place') {
    const re = new RegExp(
      groupedCommands.map(cmd => cmd.regexString || regexEscape(cmd.full)).join('\\s*')
    );
    text = text.replace(re, nudges);
  }

  return text;
}

function generateNudgeForCommandGroup(commands, mergeMode, locCache) {
  if (mergeMode === 'command-based' || mergeMode === 'all') {
    commands = mergeAdjacentCommands(commands);
  }
  return commands.map(cmd => generateStoryNudge(cmd, locCache));
}


// --- Merging ---

function inPlaceCommandGrouping(text, commands) {
  const escaped         = commands.map(c => regexEscape(c.full));
  const splitOnCommands = text.split(new RegExp(escaped.join('|'), 'g'));

  const groupedCommands = [];
  let groupNumber = 0;

  for (let i = 0; i < commands.length; i++) {
    groupedCommands[groupNumber] = groupedCommands[groupNumber] || [];
    groupedCommands[groupNumber].push(commands[i]);

    // start a new group when there is non-whitespace text between commands
    const between = splitOnCommands[i + 1] || '';
    if (!between.match(/^\s*$/)) {
      groupNumber++;
    }
  }

  return groupedCommands;
}

function mergeAdjacentCommands(commands) {
  commands = discardEverythingBeforeLastOverrideCommand(commands);

  const mergedCommands = [];
  let lastCommand = commands[0];
  let patterns    = [];

  for (const command of commands.slice(1)) {
    if (
      command.commandName === lastCommand.commandName &&
      (command.commandName === 'advance' || command.commandName === 'sleep')
    ) {
      // merge time amounts
      for (const unit in command.args) {
        lastCommand.args[unit] = (lastCommand.args[unit] || 0) + command.args[unit];
      }
      patterns.push(command.full);
    } else {
      if (!lastCommand.skipped) {
        lastCommand.regexString = [regexEscape(lastCommand.full), ...patterns.map(p => regexEscape(p))].join('[^\\[\\(]*');
      }
      mergedCommands.push(lastCommand);
      lastCommand = command;
      patterns    = [];
    }
  }

  if (!lastCommand.skipped) {
    lastCommand.regexString = [regexEscape(lastCommand.full), ...patterns.map(p => regexEscape(p))].join('[^\\[\\(]*');
  }
  mergedCommands.push(lastCommand);

  return mergedCommands;
}

function discardEverythingBeforeLastOverrideCommand(commands) {
  let resetIdx   = commands.findLastIndex(cmd => cmd.commandName === 'reset');
  let setStartTimeIdx = commands.findLastIndex(cmd => cmd.commandName === 'setstarttime');
  resetIdx        = resetIdx        === -1 ? 0 : resetIdx;
  setStartTimeIdx = setStartTimeIdx === -1 ? 0 : setStartTimeIdx;

  const overrideIdx      = Math.max(resetIdx, setStartTimeIdx);
  const filteredCommands = commands.slice(overrideIdx);

  if (overrideIdx > 0) {
    const deletedRegex = commands.slice(0, overrideIdx).map(cmd => regexEscape(cmd.full)).join('[^\\[\\(]*');
    filteredCommands.unshift({ commandName: 'deleted', regexString: deletedRegex, args: {}, skipped: true });
  }

  return filteredCommands;
}


// -------------------------------------------------
// Generating Story Nudges
// -------------------------------------------------

function _buildNudgeDateTimeStr(dateStr, era, timeStr) {
  const parts = [];
  if (getNudgeShowDate()) {
    parts.push(formatDateForDisplay(dateStr, era, getNudgeShowEra()));
  } else if (getNudgeShowEra()) {
    parts.push(era);
  }
  if (getNudgeShowDay()) {
    const day = getDayOfWeek(dateStr, era);
    if (day) parts.push(day);
  }
  if (getNudgeShowTime() && timeStr !== 'Unknown') {
    parts.push(formatTimeForDisplay(timeStr));
  }
  if (getNudgeShowPhase() && timeStr && timeStr !== 'Unknown') {
    const phase = getCurrentPhase(timeStr);
    if (phase) parts.push(`(${phase})`);
  }
  return parts.join(' ');
}

function generateStoryNudge(command, locCache) {
  if (command.skipped || command.storyNudge || command.commandName === 'deleted') return command;
  if (command.error) {
    if (command.commandName === 'goto' || command.commandName === 'sleepuntil') command.storyNudge = command.error;
    return command;
  }

  if (command.commandName === 'setstarttime') {
    const dt = _buildNudgeDateTimeStr(state.wtg.time.start.date, getStartingEra(), state.wtg.time.start.time);
    const tmpl = getLocalizedString('Nudge Set Start', LOC_DEFAULTS['Nudge Set Start'], locCache);
    command.storyNudge = applyNudgeTemplate(tmpl, '', dt);

  } else if (command.commandName === 'advance' || command.commandName === 'sleep' || command.commandName === 'goto' || command.commandName === 'goback' || command.commandName === 'sleepuntil') {
    const timeUnits = ['years', 'months', 'days', 'hours', 'minutes'];
    let timePassage = '';

    for (const unit of timeUnits) {
      if (command.args[unit]) {
        const count = command.args[unit];
        const unitKey = count > 1 ? `Unit ${unit.charAt(0).toUpperCase() + unit.slice(1)}` : `Unit ${unit.charAt(0).toUpperCase() + unit.slice(1, -1)}`;
        const unitLabel = getLocalizedString(unitKey, count > 1 ? unit : unit.slice(0, -1), locCache);
        timePassage += `${count} ${unitLabel} `;
      }
    }
    timePassage = timePassage.trim();

    const dt = _buildNudgeDateTimeStr(state.wtg.time.current.date, getCurrentEra(), state.wtg.time.current.time);
    if (command.commandName === 'goback') {
      const tmpl = getLocalizedString('Nudge Rewind', LOC_DEFAULTS['Nudge Rewind'], locCache);
      command.storyNudge = applyNudgeTemplate(tmpl, timePassage, dt);
    } else if (command.commandName === 'advance' || command.commandName === 'goto') {
      const tmpl = getLocalizedString('Nudge Advance', LOC_DEFAULTS['Nudge Advance'], locCache);
      command.storyNudge = applyNudgeTemplate(tmpl, timePassage, dt);
    } else {
      const tmpl = getLocalizedString('Nudge Sleep', LOC_DEFAULTS['Nudge Sleep'], locCache);
      command.storyNudge = applyNudgeTemplate(tmpl, timePassage, dt);
    }

  } else if (command.commandName === 'reset') {
    const dt = _buildNudgeDateTimeStr(state.wtg.time.current.date, getCurrentEra(), state.wtg.time.current.time);
    const tmpl = getLocalizedString('Nudge Reset', LOC_DEFAULTS['Nudge Reset'], locCache);
    command.storyNudge = applyNudgeTemplate(tmpl, '', dt);

  } else if (command.commandName === 'time') {
    const dt = _buildNudgeDateTimeStr(state.wtg.time.current.date, getCurrentEra(), state.wtg.time.current.time);
    const tmpl = getLocalizedString('Nudge Time Query', LOC_DEFAULTS['Nudge Time Query'], locCache);
    command.storyNudge = applyNudgeTemplate(tmpl, '', dt);

  } else if (command.commandName === 'gencard') {
    if (!command.isAutoDetected && command.args) {
      const tmpl = getLocalizedString('Nudge Card Generated', LOC_DEFAULTS['Nudge Card Generated'], locCache);
      command.storyNudge = applyNudgeTemplate(tmpl, '', '', command.args.name);
    } else {
      command.storyNudge = '';
    }
  }

  return command;
}


// -------------------------------------------------
// Main
// -------------------------------------------------

const ALLOWED_COMMANDS = [
  ['advance', 'sleep', 'gencard'],                       // 0: AI commands
  ['setstarttime', 'advance', 'adv', 'sleep', 'goto', 'goback', 'sleepuntil', 'reset', 'time'],  // 1: player commands
];

function handleCommands(text, isPlayer, cleanMode, mergeMode, locCache) {
  let commands = parseCommandsBroad(text, isPlayer);
  commands = parseCommandsSpecific(commands, ALLOWED_COMMANDS[isPlayer ? 1 : 0]);
  if (!commands.length) return { text, timeModified: false };

  DuckieDebug.duckieDebug(`Handling commands:[${commands.map(c => c.commandName).join(";")}]`, DuckieDebug.duckieDebugMode.INFORM)

  // Build loc cache lazily if caller didn't supply one (e.g. player commands from input.js).
  const cache = locCache !== undefined ? locCache : (getEnableLocalization() ? buildLocCache() : null);

  const { commands: executed, timeModified } = executeCommands(commands, isPlayer);
  return { text: cleanUpCommands(text, executed, cleanMode, mergeMode, cache), timeModified };
}


// compat.js - One-shot compatibility migration for sessions created under the deprecated
// monolithic WTG scripts. Called automatically by _oldSessionMigration() in initialization.js
// when old flat state keys (state.startingDate, etc.) are detected.
//
// Also exports rebuildRvhFromHistory() for rewind recovery — called by context.js when a
// deep rewind leaves no surviving anchor in state.rvh.history.






// Old [[TurnTime]] marker format — handles both with and without trailing seconds field.
const OLD_MARKER_RE     = /\[\[(\d+)y(\d{2})m(\d{2})d(\d{2})h(\d{2})n(?:\d{2}s)?\]\]/;
// Legacy seconds suffix on raw TurnTime strings (e.g. cooldown values).
const OLD_TT_SECONDS_RE = /^(\d+y\d{2}m\d{2}d\d{2}h\d{2}n)\d{2}s$/;

// Approximate minute conversions used for sparse-anchor interpolation.
const _MINS_PER_HOUR  = 60;
const _MINS_PER_DAY   = 24 * _MINS_PER_HOUR;
const _MINS_PER_MONTH = 30 * _MINS_PER_DAY;
const _MINS_PER_YEAR  = 365 * _MINS_PER_DAY;

// ====================================================================================
// MATH HELPERS  (local — not exported)
// ====================================================================================

function _ttStrToMinutes(ttStr) {
  const m = ttStr && ttStr.match(/^(\d+)y(\d{2})m(\d{2})d(\d{2})h(\d{2})n$/);
  if (!m) return 0;
  return parseInt(m[1]) * _MINS_PER_YEAR
       + parseInt(m[2]) * _MINS_PER_MONTH
       + parseInt(m[3]) * _MINS_PER_DAY
       + parseInt(m[4]) * _MINS_PER_HOUR
       + parseInt(m[5]);
}

function _minutesToTT(totalMins) {
  totalMins     = Math.max(0, Math.round(totalMins));
  const years   = Math.floor(totalMins / _MINS_PER_YEAR);   totalMins -= years   * _MINS_PER_YEAR;
  const months  = Math.floor(totalMins / _MINS_PER_MONTH);  totalMins -= months  * _MINS_PER_MONTH;
  const days    = Math.floor(totalMins / _MINS_PER_DAY);    totalMins -= days    * _MINS_PER_DAY;
  const hours   = Math.floor(totalMins / _MINS_PER_HOUR);   totalMins -= hours   * _MINS_PER_HOUR;
  return { years, months, days, hours, minutes: totalMins };
}

// ====================================================================================
// SETTINGS CARD MIGRATION
// ====================================================================================

/**
 * Maps the three old settings entries that were renamed or had their boolean sense
 * inverted. Must run before getWTGSettingsCard() is called, since that function drops
 * unrecognised entry names.
 */

function _migrateSettingsCard() {
  const card = getStoryCardEntryByTitle(SYSTEM_CARD_TITLES.LEGACY_WTG_SETTINGS);
  if (!card || !card.entry) return;

  const oldValues = {};
  for (const line of card.entry.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key) oldValues[key] = val;
  }

  const overrides  = {};
  const isOldTrue  = v => /^(true|yes|on|1|enable|enabled)$/i.test(v);

  if ('Disable Generated Card Deletion' in oldValues)
    overrides['Enable Generated Card Deletion'] = isOldTrue(oldValues['Disable Generated Card Deletion']) ? 'false' : 'true';
  if ('Disable WTG Entirely' in oldValues)
    overrides['Enable WTG'] = isOldTrue(oldValues['Disable WTG Entirely']) ? 'false' : 'true';

  if (Object.keys(overrides).length > 0) {
    applySettingsOverrides(overrides);
    DuckieDebug.duckieDebug(`Compat: remapped settings entries: ${JSON.stringify(overrides)}`, DuckieDebug.duckieDebugMode.INFORM);
  }
}

// ====================================================================================
// COOLDOWN FORMAT MIGRATION
// ====================================================================================

/**
 * Strips the legacy seconds suffix from cooldown TurnTime strings so parseTurnTime()
 * can read them. Old format: 00y00m01d08h00n30s. New format: 00y00m01d08h00n.
 */

function _migrateCooldownFormat() {
  const cd = state.wtg?.cooldowns;
  if (!cd) return;
  for (const key of ['sleepAvailableAtTT', 'advanceAvailableAtTT']) {
    const val = cd[key];
    if (typeof val !== 'string') continue;
    const m = val.match(OLD_TT_SECONDS_RE);
    if (m) {
      cd[key] = m[1];
      DuckieDebug.duckieDebug(`Compat: stripped seconds from cooldown ${key}: ${val} → ${m[1]}`, DuckieDebug.duckieDebugMode.INFORM);
    }
  }
}

// ====================================================================================
// RVH HISTORY RECONSTRUCTION
// ====================================================================================

/**
 * Core builder: populates state.rvh.history from the current AID history[] global.
 * Safe to call at any time — does not check whether history is already populated.
 *
 * Three phases:
 *   1. Build entries, extracting [[TurnTime]] markers into scriptData.tt.
 *   2. Optionally pin the last entry to state.wtg.time.turnTime (initial migration only —
 *      not used during rewind recovery, where the pre-rewind turnTime is stale).
 *   3. Sparse-fill: ensure an anchor at index 0 and at most 80 entries before the last
 *      known anchor, interpolating timestamps backwards by character count.
 *
 * @param {boolean} applyStateFallback
 */

function _doBuildRvhHistory(applyStateFallback) {
  const cpm = getCharsPerMinute();

  // ── Phase 1: build entries ─────────────────────────────────────────────────
  const entries = [];
  for (const entry of history) {
    if (!entry) continue;
    const rawText     = entry.text || '';
    const markerMatch = rawText.match(OLD_MARKER_RE);
    let scriptData    = {};
    let cleanText     = rawText;

    if (markerMatch) {
      const tt   = `${markerMatch[1]}y${markerMatch[2]}m${markerMatch[3]}d${markerMatch[4]}h${markerMatch[5]}n`;
      scriptData = { wtg: { tt, tm: 1.0, cpm } };
      cleanText  = rawText.replace(OLD_MARKER_RE, '').trimEnd();
    }
    entries.push({ text: cleanText, actionType: entry.type || 'story', retries: [], scriptData });
  }

  // ── Phase 2: state fallback anchor on the last entry (initial migration) ───
  if (applyStateFallback && entries.length > 0) {
    const tt      = state.wtg?.time?.turnTime;
    const nonZero = tt && (tt.years || tt.months || tt.days || tt.hours || tt.minutes);
    const last    = entries[entries.length - 1];
    if (nonZero && !last.scriptData.wtg?.tt) {
      last.scriptData = { wtg: { tt: formatTurnTime(tt), tm: 1.0, cpm } };
    }
  }

  // ── Phase 3: sparse fill anchors ──────────────────────────────────────────
  // Find the last explicit anchor so we can interpolate backwards from it.
  let lastAnchorIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].scriptData?.wtg?.tt) { lastAnchorIdx = i; break; }
  }

  // Place fill anchors at: index 0 and (lastAnchorIdx - 80) when those differ.
  // Timestamps are interpolated by subtracting character-based minutes from the anchor.
  if (lastAnchorIdx > 0) {
    const anchorMins  = _ttStrToMinutes(entries[lastAnchorIdx].scriptData.wtg.tt);
    const fillTargets = new Set([0]);
    if (lastAnchorIdx > 80) fillTargets.add(lastAnchorIdx - 80);

    let cumChars = 0;
    for (let i = lastAnchorIdx - 1; i >= 0; i--) {
      cumChars += (entries[i + 1].text || '').length; // chars between i and lastAnchorIdx
      if (fillTargets.has(i) && !entries[i].scriptData?.wtg?.tt) {
        const fillMins    = Math.max(0, anchorMins - Math.floor(cumChars / cpm));
        entries[i].scriptData = { wtg: { tt: formatTurnTime(_minutesToTT(fillMins)), tm: 1.0, cpm } };
      }
    }
  }

  // ── Phase 4: commit ────────────────────────────────────────────────────────
  // Direct writes: compat bootstraps state.rvh before RVH's own hooks run.
  // No public API exists for bulk history population.
  for (const e of entries) state.rvh.history.push(e);
  // info.actionCount is already incremented for the current turn, so the count
  // of completed actions before this turn is info.actionCount - 1.
  state.rvh.actionCount = Math.max(0, info.actionCount - 1);
  DuckieDebug.duckieDebug(`Compat: built RVH history (${RevampedHistory.getHistoryLength()} entries, actionCount=${state.rvh.actionCount})`, DuckieDebug.duckieDebugMode.INFORM);
}

/**
 * Initial migration: populates state.rvh.history from AID history[] if it is empty.
 * Applies the state-fallback anchor so there is always at least one reference point
 * after migration.
 */

function _buildRvhFromHistory() {
  if (state.rvh?.history?.length > 0) return;

  if (!state.rvh) {
    state.rvh = {
      history:          [],
      actionCount:      0,
      historyMaxLength: 1000,
      altHistory:       [],
      maxAltHistories:  5,
      playerAction:     null,
      aiAction:         null,
    };
  }

  _doBuildRvhHistory(true);
}

/**
 * Rewind recovery: clears state.rvh.history and rebuilds from the current AID history[],
 * which always reflects the narrative at the rewind target. Called from context.js when
 * a rewind leaves no surviving anchor. Does NOT apply the state-fallback anchor, since
 * the pre-rewind turnTime does not correspond to the rewound position.
 */

function rebuildRvhFromHistory() {
  // Direct writes: no public API for bulk history reset (see _doBuildRvhHistory comment).
  state.rvh.history     = [];
  state.rvh.actionCount = 0;
  _doBuildRvhHistory(false);
  DuckieDebug.duckieDebug('Compat: RVH rebuilt from AID history after deep rewind', DuckieDebug.duckieDebugMode.INFORM);
}

// ====================================================================================
// OBSOLETE CARD CLEANUP
// ====================================================================================

/**
 * Removes system cards that are either unused by the new code or will be regenerated
 * correctly. The WTG Commands Guide is deleted then immediately recreated so it carries
 * current new-format content.
 */

function _cleanupObsoleteCards() {
  for (const title of [SYSTEM_CARD_TITLES.WTG_DATA, SYSTEM_CARD_TITLES.WTG_COOLDOWNS]) {
    if (storyCards.some(c => c.title === title)) {
      deleteStoryCardByTitle(title);
      DuckieDebug.duckieDebug(`Compat: deleted obsolete card "${title}"`, DuckieDebug.duckieDebugMode.INFORM);
    }
  }
  deleteStoryCardByTitle(SYSTEM_CARD_TITLES.LEGACY_WTG_COMMANDS_GUIDE);
  DuckieDebug.duckieDebug(`Compat: refreshed "${SYSTEM_CARD_TITLES.WTG_COMMANDS_GUIDE}"`, DuckieDebug.duckieDebugMode.INFORM);
}

// ====================================================================================
// ENTRY POINTS
// ====================================================================================

/**
 * Full one-shot migration for a session created under the deprecated monolithic scripts.
 * Called once from _oldSessionMigration() in initialization.js.
 */

function runCompatMigration() {
  DuckieDebug.duckieDebug('Compat: starting deprecated-session migration', DuckieDebug.duckieDebugMode.INFORM);
  _migrateSettingsCard();
  _migrateCooldownFormat();
  _buildRvhFromHistory();
  _cleanupObsoleteCards();
  DuckieDebug.duckieDebug('Compat: migration complete', DuckieDebug.duckieDebugMode.INFORM);
}



// config.js - Mode checking and WTG Time Config card parsing
/*
* The WTG Time Config card allows scenario creators to set a custom starting date, time, era, and
* settings overrides for their game. It must have the following attribute:
*   Title: "WTG Time Config"
* It should have the following content in the entry field:
*   Starting Date: MM/DD/year   (1-6 digit year)
*   Starting Era: AD | BC (optional, defaults to AD if not provided)
*   Starting Time: HH:MM AM/PM
*   Initialized: true | false (must be true for the config to take effect)
*
* Any DEFAULT_SETTINGS fields may also be included to override their default values, e.g.:
*   Enable WTG: true
*   Debug Mode: false
*   Time Duration Multiplier: 1.5
*   Text Characters per Turn: 1400
*   Number of Turns per Hour: 30
*   Enable Generated Character Cards: true
*   Enable Generated Location Cards: true
*   Enable Generated Card Deletion: false
*   Enable Dynamic Time: true
*   Exclude Card Types: character, location
*
* If the card is present and valid, WTG will use the specified starting date/time/era instead of the defaults,
* and any included settings fields will override the values in the WTG Settings card.
* If the card is missing, malformed, or not marked as Initialized, WTG will fall back to default values.
*/






/**
 * Get the WTG Time Config storycard if it exists.
 * Simple direct scan - no caching to avoid state serialization issues.
 * @returns {Object|null}
 */

function getWTGTimeConfigCard() {
  for (let i = 0; i < storyCards.length; i++) {
    const card = storyCards[i];
    if (card && card.title === SYSTEM_CARD_TITLES.WTG_TIME_CONFIG) return card;
  }
  return null;
}

/**
 * Parse the WTG Time Config storycard.
 *
 * Expected card format:
 *   Starting Date: MM/DD/year   (1-6 digit year)
 *   Starting Era:  AD | BC      (optional, defaults to AD)
 *   Starting Time: HH:MM AM/PM
 *   Initialized:   true | false
 *
 * Returns null if the card is absent, malformed, or Initialized is not true.
 *
 * @returns {Object|null} { startingDate, startingEra, startingTime, defaultMode, initialized }
 */

function parseWTGTimeConfig() {
  const configCard = getWTGTimeConfigCard();
  if (!configCard) return null;

  // AI Dungeon JSON exports use 'value'; runtime uses 'entry'
  const content = configCard.entry || configCard.value;
  if (!content) return null;

  const dateMatch = content.match(/Starting Date:\s*([^\n]+)/i);
  const eraMatch  = content.match(/Starting Era:\s*([^\n]+)/i);
  const timeMatch = content.match(/Starting Time:\s*([^\n]+)/i);
  const initMatch = content.match(/Initialized:\s*(true|false)/i);

  if (!dateMatch || !timeMatch) return null;

  const parsedDate = parseDateString(dateMatch[1].trim(), eraMatch ? eraMatch[1].trim() : DEFAULT_WTG_ERA);

  if (!parsedDate || !isValidDate(parsedDate.month, parsedDate.day, parsedDate.year, parsedDate.era)) {
    return null;
  }

  const timeInfo   = parseTimeAndEraInput(timeMatch[1].trim(), parsedDate.era);
  const rawTime    = timeInfo.time ? normalizeTime(timeInfo.time) : null;
  // Validate: a well-formed normalized time must look like 'H:MM [AM/PM]'.
  // Bad input (e.g. a plain word) sets startingTime to null; callers treat
  // null as Unknown rather than invalidating the whole config card.
  const TIME_VALID = /^\d{1,2}:\d{2}(:\d{2})?\s*[AP]M$/i;
  const startingTime = (rawTime && TIME_VALID.test(rawTime)) ? rawTime : null;

  const settingsOverrides = {};
  for (const { entry } of Object.values(DEFAULT_SETTINGS)) {
    const m = content.match(new RegExp(`^${entry}:\\s*([^\\n]+)`, 'im'));
    if (m) settingsOverrides[entry] = m[1].trim();
  }

  return {
    startingDate: formatDateForStorage(parsedDate),
    startingEra:  parsedDate.era,
    startingTime,
    initialized: initMatch ? initMatch[1].toLowerCase() === 'true' : false,
    settingsOverrides,
  };
}



// constants.js - Shared constants, maps, and regex patterns for WTG

const LOCALIZATION_DEFAULT = "false";
const VERSION = '3.0.4';
const GITHUB = 'https://github.com/helpfulduckie/World-Time-Generator-3.0';

/*
# Main Settings Card
-- Main Setting:
> Enable WTG
> time mult
> Char/Turn
> Turns/Hour
> Enable Localization

-- Format:
> Clock Format
> Date Format

-- Nudge Settings:
> Player Command Clean Mode
> Player Command Merge Mode
> Nudge Show ...

-- Author's Note (AN) Injection Settings:
> AN Show ...

-- Current Date/Time Card Settings:
> DT Show ...

-- AI Card Generation Settings:
> Enable Generating Char Cards
> Enable Generating Loc Cards
> Enable Fuzzy Duplicate Matching

-- TimeStamp Settings:
> Enable Card TimeStamps
> Exclude Card Types

# Localization Card
-- AN Labels
-- Nudge Messages
-- Units
-- Injected AI Instructions
*/

const DEFAULT_SETTINGS = {
  // -- Main Setting
  enableWTG:              { entry: 'Enable WTG',                        value: 'true',    group: 'Main Setting'                          },
  timeMult:               { entry: 'Time Duration Multiplier',          value: '1.0',     group: 'Main Setting',                         desc: 'Scales time elapsed per turn. 2.0 = time passes twice as fast.'                                                                  },
  textCharsPerTurn:       { entry: 'Text Characters per Turn',          value: '600',     group: 'Main Setting',                         desc: 'Expected story characters per turn. Combined with Turns/Hour to derive time-per-character (dynamic time mode).'                 },
  turnsPerHour:           { entry: 'Number of Turns per Hour',          value: '30',      group: 'Main Setting',                         desc: 'Baseline turns per hour. Used to calculate characters-per-minute alongside Text Characters per Turn.'                          },
  enableDynamicTime:      { entry: 'Enable Dynamic Time',               value: 'true',    group: 'Main Setting',                         desc: 'When true, time advances based on story text length. When false, only explicit commands advance time.'                          },
  enableLocalization:     { entry: 'Enable Localization',               value: LOCALIZATION_DEFAULT,   group: 'Main Setting',            desc: 'Enables custom labels for time output via the WTG: Localization card.'                                                        },
  // -- Format
  clockFormat:            { entry: 'Clock Format',                      value: '12h',     group: 'Format',                               desc: 'Valid: 12h, 24h'                                                                                                              },
  dateFormat:             { entry: 'Date Format',                       value: 'american', group: 'Format',                              desc: 'Valid: american (MM/DD/YYYY), european (DD/MM/YYYY)'                                                                          },
  // -- Nudge Settings
  playerCleanMode:        { entry: 'Player Command Clean Mode',         value: 'prepend', group: 'Nudge Settings',                       desc: 'How player commands appear in output. Valid: full (remove silently), prepend (nudge before output), in-place (nudge replaces command).' },
  playerMergeMode:        { entry: 'Player Command Merge Mode',         value: 'all',     group: 'Nudge Settings',                       desc: 'How nudges from multiple commands are grouped. Valid: none, command-based (merge same-type adjacent), all (merge into one).'   },
  aiCommandNudge:         { entry: 'AI Command Nudge',                  value: 'false',   group: 'Nudge Settings',                       desc: 'When true, AI-issued commands generate nudges using the player clean/merge mode settings.'                                    },
  nudgeShowDate:          { entry: 'Nudge Show Date',                   value: 'true',    group: 'Nudge Settings'                        },
  nudgeShowEra:           { entry: 'Nudge Show Era',                    value: 'true',    group: 'Nudge Settings'                        },
  nudgeShowTime:          { entry: 'Nudge Show Time',                   value: 'true',    group: 'Nudge Settings'                        },
  nudgeShowDay:           { entry: 'Nudge Show Day of Week',            value: 'true',    group: 'Nudge Settings'                        },
  nudgeShowPhase:         { entry: 'Nudge Show Phase',                  value: 'true',    group: 'Nudge Settings'                        },
  // -- Author's Note (AN) Injection Settings
  anShowDate:             { entry: 'AN Show Date',                      value: 'true',    group: "Author's Note (AN) Injection Settings" },
  anShowEra:              { entry: 'AN Show Era',                       value: 'true',    group: "Author's Note (AN) Injection Settings" },
  anShowTime:             { entry: 'AN Show Time',                      value: 'true',    group: "Author's Note (AN) Injection Settings" },
  anShowDay:              { entry: 'AN Show Day of Week',               value: 'true',    group: "Author's Note (AN) Injection Settings" },
  anShowPhase:            { entry: 'AN Show Phase',                     value: 'true',    group: "Author's Note (AN) Injection Settings" },
  // -- Current Date/Time Card Settings
  dtCardShowPhase:        { entry: 'DateTime Card Show Phase',          value: 'true',    group: 'Current Date/Time Card Settings'       },
  // -- AI Card Generation Settings
  enableGenCharCards:     { entry: 'Enable Generated Character Cards',  value: 'true',    group: 'AI Card Generation Settings'           },
  enableGenLocCards:      { entry: 'Enable Generated Location Cards',   value: 'true',    group: 'AI Card Generation Settings'           },
  enableCardDeletion:     { entry: 'Enable Generated Card Deletion',    value: 'false',   group: 'AI Card Generation Settings',          desc: 'When true, AI may delete generated character/location cards when entities leave the scene.'                                    },
  enableFuzzyDuplicates:  { entry: 'Enable Fuzzy Duplicate Matching',   value: 'false',   group: 'AI Card Generation Settings',          desc: 'When true, uses substring and word-overlap matching to detect near-duplicate generated cards.'                                },
  // -- TimeStamp Settings
  enableCardTimestamps:   { entry: 'Enable Card Timestamps',            value: 'true',    group: 'TimeStamp Settings'                    },
  excludeCardTypes:       { entry: 'Exclude Card Types',                value: '',        group: 'TimeStamp Settings',                   desc: 'Comma-separated card types to skip when adding timestamps. E.g.: character,location'                                          },
};

// Authoritative set of system card titles — used to guard all storycard loops.
// Includes Inner Self and AutoCards integration cards so they are never timestamped.
const SYSTEM_CARD_TITLES = {
  // Current Cards:
  CURRENT_DATE_TIME:          "Current Date and Time",
  WTG_SETTINGS:               "Configure WTG",
  WTG_TIME_CONFIG:            "WTG Time Config",
  WTG_COMMANDS_GUIDE:         "Commands Guide (WTG)",
  WTG_TIME_PHASES:            "WTG Time Phases",
  DEBUG_DATA:                 "Debug Data",
  RVH_DEBUG:                  "[RVH Debug]",
  RVH_AID_DEBUG:              "[AID Debug]",
  // Legacy Cards:
  WTG_DATA:                   "WTG Data",
  LEGACY_WTG_SETTINGS:        "World Time Generator Settings",
  WTG_COOLDOWNS:              "WTG Cooldowns",
  LEGACY_WTG_COMMANDS_GUIDE:  "WTG Commands Guide",
  // External Cards:
  CONFIGURE_INNER_SELF:       "Configure Inner Self",
  CONFIGURE_AUTO_CARDS:       "Configure Auto-Cards",
  // Localization:
  WTG_LOCALIZATION:           "WTG: Localization",
};

const  CARD_TYPES = {
  system:   "zz_Settings",
  current:  "_WTG",
  debug:    "zz_Debug",
}

// Fixed-meaning time words with no phase equivalent. Phase-mapped words (morning,
// afternoon, evening, night, dawn, dusk, etc.) are handled by getParsedTimePhases().
const DESCRIPTIVE_MAP = new Map([
  ['noon',     '12:00 PM'],
  ['midday',   '12:00 PM'],
  ['midnight', '12:00 AM'],
]);

// Default time phases used when no "WTG Time Phases" storycard exists and no
// last-known-good set is stored in state.wtg.phases.
const DEFAULT_TIME_PHASES = [
  { name: 'Predawn',       start: '4:00 AM',  end: '5:00 AM'  },
  { name: 'Dawn',          start: '5:00 AM',  end: '7:00 AM'  },
  { name: 'Morning',       start: '7:00 AM',  end: '9:00 AM'  },
  { name: 'Late Morning',  start: '9:00 AM',  end: '11:00 AM' },
  { name: 'Midday',        start: '11:00 AM', end: '2:00 PM'  },
  { name: 'Afternoon',     start: '2:00 PM',  end: '4:00 PM'  },
  { name: 'Evening',       start: '6:00 PM',  end: '8:00 PM'  },
  { name: 'Night',         start: '8:00 PM',  end: '12:00 AM' },
  { name: 'After Midnight',start: '12:00 AM', end: '4:00 AM'  },
];

const DEFAULT_WTG_ERA      = 'AD';
const WTG_ERA_TOKEN_PATTERN = '(?:AD|A\\.D\\.|CE|C\\.E\\.|BC|B\\.C\\.|BCE|B\\.C\\.E\\.)';
const WTG_TURN_TIME_PATTERN = '(\\d+)y(\\d{2})m(\\d{2})d(\\d{2})h(\\d{2})n';
const WTG_DATE_PATTERN      = `\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,6}(?:\\s*${WTG_ERA_TOKEN_PATTERN})?`;

// Performance safeguard: cap storycard iteration for very large scenarios.
const MAX_STORYCARDS_TO_PROCESS = 200;



// initialization.js - State initialization, first-run time setup, and session migration
//
// DEFAULT OWNERSHIP — two sources, each owns a distinct domain:
//   _DEFAULT_WTG()              → runtime state shape (time, cmd, cooldowns, flags)
//   getWTGSettingsCard() DEFAULTS → all user-facing settings ("Enable X", multipliers, etc.)
//
// Never add a feature-flag boolean to _DEFAULT_WTG(); it won't be read by any hook.
// Feature flags are read exclusively through getWTGBooleanSetting() → storycard.

 











// ====================================================================================
// DEFAULT FACTORIES
// ====================================================================================

const _ZERO_TURNTIME = () => ({ years: 0, months: 0, days: 0, hours: 0, minutes: 0 });
const _DEFAULT_TIME  = () => ({ date: '01/01/1900', era: DEFAULT_WTG_ERA, time: 'Unknown' });
const _DEFAULT_WTG   = () => ({
  initialized: false,
  changed:     false,
  phases:      null,
  time: {
    start:    _DEFAULT_TIME(),
    current:  _DEFAULT_TIME(),
    turnTime: _ZERO_TURNTIME(),
  },
  cmd: {
    insertMarker: false,
  },
  cooldowns: {
    sleepAvailableAtTT:   null,
    advanceAvailableAtTT: null,
  },
});

// ====================================================================================
// SINGLE ENTRY POINT — call this at the top of every hook instead of the old trio:
//   ensureWTGState() + ensureWTGEras() + ensureTimeInitialization()
// ====================================================================================

/**
 * Guarantees that state.wtg is fully shaped, era strings are normalized, and
 * first-run time initialization has been performed (exactly once per session).
 *
 * Safe to call at the top of every hook — fully idempotent after the first call.
 */

function ensureWTGReady() {
  // ── 1. Guarantee state shape ────────────────────────────────────────────
  if (!state.wtg) {
    // Old session with flat keys: migrate and return — shape is fully set by migrator.
    if (state.startingDate !== undefined) {
      _oldSessionMigration();
      // Still fall through so era normalization and initialization run below.

    } else {
      state.wtg = _DEFAULT_WTG();
    }
  } else {
    // Existing session: patch any missing sub-objects without overwriting live values.
    const t = state.wtg.time = state.wtg.time || {};
    t.start    = t.start    || _DEFAULT_TIME();
    t.current  = t.current  || _DEFAULT_TIME();
    t.turnTime = t.turnTime || _ZERO_TURNTIME();

    state.wtg.cmd = state.wtg.cmd || {
      insertMarker: false,
    };
    state.wtg.cooldowns = state.wtg.cooldowns || {
      sleepAvailableAtTT:   null,
      advanceAvailableAtTT: null,
    };
    if (!('phases' in state.wtg)) state.wtg.phases = null;
  }

  // ── 2. Normalize era strings ─────────────────────────────────────────────
  // Safe now that time sub-objects are guaranteed to exist.
  const t = state.wtg.time;
  t.start.era   = normalizeEra(t.start.era   || DEFAULT_WTG_ERA);
  t.current.era = normalizeEra(t.current.era || t.start.era);

  // ── 3. First-run time initialization (runs once, then state.wtg.initialized = true) ──
  if (!state.wtg.initialized) {
    _initializeTime();
  }
}

// ====================================================================================
// FIRST-RUN TIME INITIALIZATION  (private — called only by ensureWTGReady)
// ====================================================================================

/**
 * Resolves the starting date/time on the first turn of a session.
 * Priority order:
 *   1. WTG Time Config storycard (set externally, e.g. by scenario setup)
 *   2. A [settime …] command embedded in any storycard entry/value field
 *   3. Today's real-world date at 9:00 AM as a sensible fallback
 *
 * Creates all required system storycards exactly once via _initSystemCards().
 */

function _initializeTime() {
  const wtg = state.wtg;
  const t   = wtg.time;

  // Option 1: explicit WTG Time Config card
  const timeConfig = parseWTGTimeConfig();
  if (timeConfig) {
    DuckieDebug.duckieDebug(`Found WTG Time Config card with content:\n${timeConfig.startingDate} ${timeConfig.startingEra} ${timeConfig.startingTime}`, DuckieDebug.duckieDebugMode.INFORM);
    applyStartingTime(t, wtg, timeConfig.startingDate, timeConfig.startingEra, timeConfig.startingTime);
    if (timeConfig.settingsOverrides && Object.keys(timeConfig.settingsOverrides).length > 0) {
      applySettingsOverrides(timeConfig.settingsOverrides);
    }
    deleteStoryCardByTitle(SYSTEM_CARD_TITLES.WTG_TIME_CONFIG);
  }else{

    // Option 2: [settime] embedded in a storycard
    const { scannedConfig, scannedCard, scannedField } = _findSettimeInStoryCards();
    if (scannedConfig) {
      applyStartingTime(t, wtg, scannedConfig.startingDate, scannedConfig.startingEra, scannedConfig.startingTime || t.start.time);
      scannedCard[scannedField] = scannedCard[scannedField]
        .replace(/\[(?:settime|setStartTime)\s+[^\]]+?\]/i, '')
        .trim();

    }else {
      // Option 3: today's date as fallback
      const now  = new Date();
      const date = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
      applyStartingTime(t, wtg, date, DEFAULT_WTG_ERA, '9:00 AM'); 
    }
  }
}

// ====================================================================================
// applyStartingTime — time-state only, no card creation side-effects
// ====================================================================================

/**
 * Applies a new starting date/time to the WTG time state and resets turnTime to zero.
 * Marks the session as initialized and triggers a DateTime card update.
 *
 * Card creation (settings, cooldowns, commands, data) happens in _initSystemCards(),
 * which is called here exactly once. All subsequent calls to applyStartingTime
 * (e.g. from a [settime] command mid-session) skip card creation.
 *
 * @param {Object} t   - state.wtg.time
 * @param {Object} wtg - state.wtg
 * @param {string} date  - Storage-format date ('MM/DD/YYYY')
 * @param {string} era   - 'AD' | 'BC'
 * @param {string} time  - Display-format time or 'Unknown'
 */

function applyStartingTime(t, wtg, date, era, time) {
  const isFirstInit = !wtg.initialized;

  t.start.date = date;
  t.start.era  = era;
  t.start.time = time;
  t.turnTime   = _ZERO_TURNTIME();

  const { currentDate, currentEra, currentTime } = computeCurrent(
    t.start.date, t.start.time, t.turnTime, t.start.era
  );
  t.current.date = currentDate;
  t.current.era  = currentEra;
  t.current.time = currentTime;

  markSettimeAsInitialized();
  updateDateTimeCard();

  // Create system storycards on first initialization only.
  if (isFirstInit) {
    _initSystemCards();
  }

  DuckieDebug.duckieDebug(`Starting time initialized to: ${t.start.date} ${t.start.era} ${t.start.time}`, DuckieDebug.duckieDebugMode.INFORM);

  wtg.initialized = true;
  wtg.changed     = true;
}

// ====================================================================================
// SYSTEM CARD CREATION  (private — called once by applyStartingTime on first init)
// ====================================================================================

/**
 * Creates all required system storycards.
 * Called exactly once per session, from applyStartingTime, when wtg.initialized is
 * still false. Mid-session [settime] commands re-use already-existing cards.
 */

function _initSystemCards() {
  getWTGSettingsCard();
  getTimePhasesCard();
}

// ====================================================================================
// STORYCARD SCANNING  (private helper)
// ====================================================================================

/**
 * Scans all storycards for an embedded [settime …] command.
 * Returns the parsed config and the card+field it was found in so the caller
 * can strip the command after applying it.
 *
 * @returns {{ scannedConfig: Object|null, scannedCard: Object|null, scannedField: string|null }}
 */

function _findSettimeInStoryCards() {
  for (const card of storyCards) {
    if (!card) continue;
    for (const field of ['entry', 'value']) {
      const content = typeof card[field] === 'string' ? card[field] : '';
      if (!content) continue;
      const settimeMatch = content.match(/\[(?:settime|setStartTime)\s+([^\]]+?)\]/i);
      if (!settimeMatch) continue;
      const args   = settimeMatch[1].trim().split(/\s+/);
      const parsed = normalizeSettimeArgs(args[0], args.slice(1).join(' '), DEFAULT_WTG_ERA);
      if (!parsed) continue;
      return { scannedConfig: parsed, scannedCard: card, scannedField: field };
    }
  }
  return { scannedConfig: null, scannedCard: null, scannedField: null };
}

// ====================================================================================
// LEGACY SESSION MIGRATION  (private)
// ====================================================================================

/**
 * Migrates flat pre-namespacing state keys (state.startingDate, etc.) to state.wtg.
 * Called automatically by ensureWTGReady when the old shape is detected.
 * The migrated state should be treated as already-initialized.
 */

function _oldSessionMigration() {
  state.wtg = {
    initialized: !!state.settimeInitialized,
    changed:     !!state.changed,
    phases:      null,
    time: {
      start: {
        date: state.startingDate,
        era:  state.startingEra  || DEFAULT_WTG_ERA,
        time: state.startingTime || 'Unknown',
      },
      current: {
        date: state.currentDate  || state.startingDate,
        era:  state.currentEra   || state.startingEra || DEFAULT_WTG_ERA,
        time: state.currentTime  || 'Unknown',
      },
      turnTime: state.turnTime || _ZERO_TURNTIME(),
    },
    cmd: {
      insertMarker: false,
    },
    cooldowns: {
      sleepAvailableAtTT:   state.sleepAvailableAtTT   || null,
      advanceAvailableAtTT: state.advanceAvailableAtTT || null,
    },
  };

  const OLD_KEYS = [
    'startingDate', 'startingEra', 'startingTime',
    'currentDate',  'currentEra',  'currentTime', 'turnTime',
    'wtgMode', 'settimeInitialized', 'initialMessageShown', 'changed',
    'turnTimeModifiedByCommand', 'insertMarker', 'pendingTimeCommandOutput', // turnTimeModifiedByCommand kept in OLD_KEYS to migrate away sessions that still have it
    'timeCommandUsed',
    'sleepAvailableAtTT', 'advanceAvailableAtTT',
  ];
  for (const k of OLD_KEYS) delete state[k];

  runCompatMigration();
}



// localization.js - Optional AI-facing string overrides via "WTG: Localization" story card.
// All strings default to English; scenario creators can translate them by enabling
// "Enable Localization" in Configure WTG and editing the card fields.

// NOTE: WTG should run before LoLa, as Author's Note Injection looks for the words "Author's Note:"
// specifically and LoLa translates that phrase. It shouldn't *break* anything to do it in the other
// order, but it does mean English will sneak in and the user may end up with a second AN block,
// neither of which are ideal

// ====================================================================================
// DEFAULT STRINGS
// ====================================================================================

const LOC_DEFAULTS = {
  'Sleep Instruction':
    "\nWhen the user decides to sleep on the previous turn, start the action with (sleep X units) where X is a number and units can be hours, minutes, days, weeks, months, or years.",
  'Advance Instruction':
    "\nWhen a notable chunk of time passes, start the action with (advance X units) using the same format.",
  'Character Card Instruction':
    `When introducing ANY character (person, creature, NPC):
  - REQUIRED: Format their name in single parentheses on first mention: (CharacterName) followed by a brief, standalone description. Format the entire introduction in a single paragraph, with the description immediately following the name and enclosed in triple parentheses: (((CharacterName) description text)))
  - Example: "A warrior named (((Marcus) Marcus is a broad-shouldered man with a weathered face. He carries a long sword.))) approached" or "(((The Innkeeper) The Innkeeper is a friendly, middle-aged woman with a warm smile.))) greeted you"`,
  'Location Card Instruction':
    `When introducing ANY location (place, building, area):
  - REQUIRED: Format the location in double parentheses on first mention: ((LocationName)) followed by a brief, standalone description in triple parentheses: (((LocationName)) description text)))
  - Example: "You entered (((The Golden Tavern)) The Golden Tavern is a bustling establishment with a warm atmosphere.)))" or "The path led to (((Silverwood Forest)) The Silverwood Forest is a dense, mystical place filled with ancient trees.)))"`,
  'AN Date Label':    'Current date',
  'AN Era Label':     'Current era',
  'AN Time Label':    'Current time',
  'AN Phase Label':   'Current phase',
  'Nudge Sleep':      'You go to sleep and wake up {timePassage} later on {dt}.',
  'Nudge Advance':    '{timePassage} passed. Now: {dt}.',
  'Nudge Rewind':     'Time rewound by {timePassage}. Now: {dt}.',
  'Nudge Reset':      'The current date and time have been reset to {dt}.',
  'Nudge Set Start':  'Starting date and time set to {dt}.',
  'Nudge Time Query': 'Current date and time: {dt}.',
  'Nudge Card Generated': 'A new story card has been generated: {name}.',
  'Unit Minute':  'minute',
  'Unit Minutes': 'minutes',
  'Unit Hour':    'hour',
  'Unit Hours':   'hours',
  'Unit Day':     'day',
  'Unit Days':    'days',
  'Unit Month':   'month',
  'Unit Months':  'months',
  'Unit Year':    'year',
  'Unit Years':   'years',
};

// ====================================================================================
// UNIFIED SETTINGS REGISTRATION
// ====================================================================================

// Internal key → { key (display label), defaultValue } for each localization group.
// Groups and their target card field:
//   AN Labels, Nudge Messages, Units  → entry
//   Injected AI Instructions          → description

const _LOC_AN_LABELS = {
  locAnDate:  { key: 'AN Date Label',  defaultValue: LOC_DEFAULTS['AN Date Label']  },
  locAnEra:   { key: 'AN Era Label',   defaultValue: LOC_DEFAULTS['AN Era Label']   },
  locAnTime:  { key: 'AN Time Label',  defaultValue: LOC_DEFAULTS['AN Time Label']  },
  locAnPhase: { key: 'AN Phase Label', defaultValue: LOC_DEFAULTS['AN Phase Label'] },
};

const _LOC_NUDGE_MESSAGES = {
  locNudgeSleep:         { key: 'Nudge Sleep',          defaultValue: LOC_DEFAULTS['Nudge Sleep']          },
  locNudgeAdvance:       { key: 'Nudge Advance',        defaultValue: LOC_DEFAULTS['Nudge Advance']        },
  locNudgeRewind:        { key: 'Nudge Rewind',         defaultValue: LOC_DEFAULTS['Nudge Rewind']         },
  locNudgeReset:         { key: 'Nudge Reset',          defaultValue: LOC_DEFAULTS['Nudge Reset']          },
  locNudgeSetStart:      { key: 'Nudge Set Start',      defaultValue: LOC_DEFAULTS['Nudge Set Start']      },
  locNudgeTimeQuery:     { key: 'Nudge Time Query',     defaultValue: LOC_DEFAULTS['Nudge Time Query']     },
  locNudgeCardGenerated: { key: 'Nudge Card Generated', defaultValue: LOC_DEFAULTS['Nudge Card Generated'] },
};

const _LOC_UNITS = {
  locUnitMinute:  { key: 'Unit Minute',  defaultValue: LOC_DEFAULTS['Unit Minute']  },
  locUnitMinutes: { key: 'Unit Minutes', defaultValue: LOC_DEFAULTS['Unit Minutes'] },
  locUnitHour:    { key: 'Unit Hour',    defaultValue: LOC_DEFAULTS['Unit Hour']    },
  locUnitHours:   { key: 'Unit Hours',   defaultValue: LOC_DEFAULTS['Unit Hours']   },
  locUnitDay:     { key: 'Unit Day',     defaultValue: LOC_DEFAULTS['Unit Day']     },
  locUnitDays:    { key: 'Unit Days',    defaultValue: LOC_DEFAULTS['Unit Days']    },
  locUnitMonth:   { key: 'Unit Month',   defaultValue: LOC_DEFAULTS['Unit Month']   },
  locUnitMonths:  { key: 'Unit Months',  defaultValue: LOC_DEFAULTS['Unit Months']  },
  locUnitYear:    { key: 'Unit Year',    defaultValue: LOC_DEFAULTS['Unit Year']    },
  locUnitYears:   { key: 'Unit Years',   defaultValue: LOC_DEFAULTS['Unit Years']   },
};

const _LOC_AI_INSTRUCTIONS = {
  locSleepInstruction:   { key: 'Sleep Instruction',           defaultValue: LOC_DEFAULTS['Sleep Instruction']           },
  locAdvanceInstruction: { key: 'Advance Instruction',         defaultValue: LOC_DEFAULTS['Advance Instruction']         },
  locCharCardInstruction:{ key: 'Character Card Instruction',  defaultValue: LOC_DEFAULTS['Character Card Instruction']  },
  locLocCardInstruction: { key: 'Location Card Instruction',   defaultValue: LOC_DEFAULTS['Location Card Instruction']   },
};

const LOC_CARD = 'WTG: Localization';

function locPrehook() {
  UnifiedSettings.defineMod('WTG', 'World Time Generator', 'Configure WTG');
  UnifiedSettings.defineGroup('WTG', 'AN Labels',                'AN Labels',                LOC_CARD, 'entry');
  UnifiedSettings.defineGroup('WTG', 'Nudge Messages',           'Nudge Messages',           LOC_CARD, 'entry');
  UnifiedSettings.defineGroup('WTG', 'Units',                    'Units',                    LOC_CARD, 'entry');
  UnifiedSettings.defineGroup('WTG', 'Injected AI Instructions', 'Injected AI Instructions', LOC_CARD, 'description');
  UnifiedSettings.defineSettings({ modName: 'WTG', group: 'AN Labels',                card: LOC_CARD, field: 'entry',       setting: _LOC_AN_LABELS        });
  UnifiedSettings.defineSettings({ modName: 'WTG', group: 'Nudge Messages',           card: LOC_CARD, field: 'entry',       setting: _LOC_NUDGE_MESSAGES   });
  UnifiedSettings.defineSettings({ modName: 'WTG', group: 'Units',                    card: LOC_CARD, field: 'entry',       setting: _LOC_UNITS            });
  UnifiedSettings.defineSettings({ modName: 'WTG', group: 'Injected AI Instructions', card: LOC_CARD, field: 'description', setting: _LOC_AI_INSTRUCTIONS  });
}

// ====================================================================================
// CACHE
// ====================================================================================

/**
 * Returns a key→value dict of all localization strings from the UnifiedSettings cache.
 * Shape matches LOC_DEFAULTS so all getLocalizedString() call sites are unchanged.
 * @returns {Object}
 */

function buildLocCache() {
  const g = (group, key) => UnifiedSettings.getSetting('WTG', group, key);
  return {
    'AN Date Label':              g('AN Labels',                'locAnDate'),
    'AN Era Label':               g('AN Labels',                'locAnEra'),
    'AN Time Label':              g('AN Labels',                'locAnTime'),
    'AN Phase Label':             g('AN Labels',                'locAnPhase'),
    'Nudge Sleep':                g('Nudge Messages',           'locNudgeSleep'),
    'Nudge Advance':              g('Nudge Messages',           'locNudgeAdvance'),
    'Nudge Rewind':               g('Nudge Messages',           'locNudgeRewind'),
    'Nudge Reset':                g('Nudge Messages',           'locNudgeReset'),
    'Nudge Set Start':            g('Nudge Messages',           'locNudgeSetStart'),
    'Nudge Time Query':           g('Nudge Messages',           'locNudgeTimeQuery'),
    'Nudge Card Generated':       g('Nudge Messages',           'locNudgeCardGenerated'),
    'Unit Minute':                g('Units',                    'locUnitMinute'),
    'Unit Minutes':               g('Units',                    'locUnitMinutes'),
    'Unit Hour':                  g('Units',                    'locUnitHour'),
    'Unit Hours':                 g('Units',                    'locUnitHours'),
    'Unit Day':                   g('Units',                    'locUnitDay'),
    'Unit Days':                  g('Units',                    'locUnitDays'),
    'Unit Month':                 g('Units',                    'locUnitMonth'),
    'Unit Months':                g('Units',                    'locUnitMonths'),
    'Unit Year':                  g('Units',                    'locUnitYear'),
    'Unit Years':                 g('Units',                    'locUnitYears'),
    'Sleep Instruction':          g('Injected AI Instructions', 'locSleepInstruction'),
    'Advance Instruction':        g('Injected AI Instructions', 'locAdvanceInstruction'),
    'Character Card Instruction': g('Injected AI Instructions', 'locCharCardInstruction'),
    'Location Card Instruction':  g('Injected AI Instructions', 'locLocCardInstruction'),
  };
}

// ====================================================================================
// LOOKUP
// ====================================================================================

/**
 * Returns the localized string for `key`, or `defaultValue` if not found in cache.
 * When `locCache` is null (localization disabled) always returns `defaultValue`.
 * @param {string} key
 * @param {string} defaultValue
 * @param {Object|null} locCache
 * @returns {string}
 */

function getLocalizedString(key, defaultValue, locCache) {
  if (!locCache) return defaultValue;
  return (key in locCache && locCache[key] !== '') ? locCache[key] : defaultValue;
}

// ====================================================================================
// NUDGE TEMPLATE SUBSTITUTION
// ====================================================================================

/**
 * Applies `{timePassage}`, `{dt}`, and `{name}` substitutions to a nudge template.
 * When `dt` is an empty string the `{dt}` token and its preceding connector clause
 * (everything between the last sentence boundary and `{dt}`, inclusive) are stripped
 * so the sentence still closes cleanly.
 *
 * Examples:
 *   "{timePassage} passed. Now: {dt}."  + dt=""  → "3 hours passed."
 *   "You wake up {timePassage} later on {dt}." + dt="" → "You wake up 3 hours later."
 *
 * @param {string} template
 * @param {string} [timePassage]
 * @param {string} [dt]
 * @param {string} [name]
 * @returns {string}
 */

function applyNudgeTemplate(template, timePassage = '', dt = '', name = '') {
  let result = template
    .replace('{timePassage}', timePassage)
    .replace('{name}', name);

  if (dt) {
    result = result.replace('{dt}', dt);
  } else {
    // Strip the dt clause: from the last '.' (or start) before {dt} to {dt} and
    // its surrounding punctuation, then ensure the sentence ends with a single period.
    result = result.replace(/(?:[.]\s*[^.{]*)\{dt\}[^.]*[.]?/, '.');
    // Fallback: if {dt} is still present (no period before it), just remove token+suffix.
    result = result.replace(/\s*\{dt\}[^.]*[.]?/, '');
    // Collapse any double-period that may result.
    result = result.replace(/\.\.+/, '.');
  }

  return result.trim();
}


// settings.js - Manages the "Configure WTG" storycard via UnifiedSettings.
// Registration (wtgPrehook) must run before any call here so UnifiedSettings
// knows the WTG settings schema.


// ====================================================================================
// REVERSE LOOKUP — entry label → { internalKey, group }
// Used by getWTGBooleanSetting and applySettingsOverrides, which receive entry labels.
// ====================================================================================

const _entryToKey = Object.fromEntries(
  Object.entries(DEFAULT_SETTINGS).map(([internalKey, { entry, group }]) => [entry, { internalKey, group }])
);

// ====================================================================================
// STORYCARD
// ====================================================================================

/**
 * Ensures WTG settings are registered with UnifiedSettings and the "Configure WTG"
 * storycard is created/repaired. Returns the storycard object.
 *
 * Registration is idempotent — safe to call on every hook turn.
 * @returns {Object|null} The storycard object.
 */

function getWTGSettingsCard() {
  wtgPrehook();
  UnifiedSettings.ensureSettingCardsExist();
  return storyCards.find(function(c) { return c.title === 'Configure WTG'; }) || null;
}


// ====================================================================================
// SETTINGS RETRIEVAL
// ====================================================================================

function getIsWTGEnabled() {
  return getWTGBooleanSetting(DEFAULT_SETTINGS.enableWTG.entry);
}

/**
 * Returns the active debug level: 0 = off, 1 = errors only, 2 = all messages.
 * @returns {0|1|2}
 */

function getDebugLevel() {
  const raw = UnifiedSettings.getModSetting('DuckieDebug', 'debugMode');
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0) return 0;
  return Math.min(n, 2);
}

function getIsDebugMode() {
  return getDebugLevel() > 0;
}

function getIsDynamicTimeEnabled() {
  return getWTGBooleanSetting(DEFAULT_SETTINGS.enableDynamicTime.entry);
}

function getAICommandNudge()        { return getWTGBooleanSetting(DEFAULT_SETTINGS.aiCommandNudge.entry); }

function getEnableLocalization()    { return getWTGBooleanSetting(DEFAULT_SETTINGS.enableLocalization.entry); }

function getEnableCardTimestamps()  { return getWTGBooleanSetting(DEFAULT_SETTINGS.enableCardTimestamps.entry); }

function getIsGeneratedCharacterCardsEnabled() {
  return getWTGBooleanSetting(DEFAULT_SETTINGS.enableGenCharCards.entry);
}

function getIsGeneratedLocationCardsEnabled() {
  return getWTGBooleanSetting(DEFAULT_SETTINGS.enableGenLocCards.entry);
}

/**
 * Get a boolean setting from the WTG Settings card by its entry label.
 * @param {string} settingName  The entry label (e.g. "Enable WTG")
 * @returns {boolean}
 */

function getWTGBooleanSetting(settingName) {
  const def = _entryToKey[settingName];
  if (!def) return false;
  return UnifiedSettings.getSetting('WTG', def.group, def.internalKey) === 'true';
}

/**
 * Returns the Time Duration Multiplier.
 * Falls back to 1.0 on missing/invalid values.
 * @returns {number}
 */

function getTimeMultiplier() {
  const raw = UnifiedSettings.getSetting('WTG', 'Main Setting', 'timeMult');
  if (raw == null) return 1.0;
  const value = parseFloat(raw);
  if (isNaN(value) || value < 0) return 1.0;
  return value;
}

/**
 * Derives characters-per-minute from the Text Characters per Turn and
 * Number of Turns per Hour settings.
 * @returns {number}
 */

function getCharsPerMinute() {
  const defaultChars = parseFloat(DEFAULT_SETTINGS.textCharsPerTurn.value);
  const defaultTurns = parseFloat(DEFAULT_SETTINGS.turnsPerHour.value);
  const defaultCPM   = (defaultChars * defaultTurns) / 60;

  const rawChars = UnifiedSettings.getSetting('WTG', 'Main Setting', 'textCharsPerTurn');
  const rawTurns = UnifiedSettings.getSetting('WTG', 'Main Setting', 'turnsPerHour');
  const chars = rawChars != null ? parseFloat(rawChars) : defaultChars;
  const turns = rawTurns != null ? parseFloat(rawTurns) : defaultTurns;
  if (isNaN(chars) || chars <= 0 || isNaN(turns) || turns <= 0) return defaultCPM;
  return (chars * turns) / 60;
}

const VALID_CLEAN_MODES   = ['full', 'prepend', 'in-place'];
const VALID_MERGE_MODES   = ['none', 'command-based', 'all'];
const VALID_CLOCK_FORMATS = ['12h', '24h'];
const VALID_DATE_FORMATS  = ['american', 'european'];

function getPlayerCleanMode() {
  const raw = (UnifiedSettings.getSetting('WTG', 'Nudge Settings', 'playerCleanMode') || '').trim().toLowerCase();
  return VALID_CLEAN_MODES.includes(raw) ? raw : 'prepend';
}

function getPlayerMergeMode() {
  const raw = (UnifiedSettings.getSetting('WTG', 'Nudge Settings', 'playerMergeMode') || '').trim().toLowerCase();
  return VALID_MERGE_MODES.includes(raw) ? raw : 'none';
}

function getClockFormat() {
  const raw = (UnifiedSettings.getSetting('WTG', 'Format', 'clockFormat') || '').trim().toLowerCase();
  return VALID_CLOCK_FORMATS.includes(raw) ? raw : '12h';
}

function getDateFormat() {
  const raw = (UnifiedSettings.getSetting('WTG', 'Format', 'dateFormat') || '').trim().toLowerCase();
  return VALID_DATE_FORMATS.includes(raw) ? raw : 'american';
}

function getNudgeShowDate()  { return getWTGBooleanSetting(DEFAULT_SETTINGS.nudgeShowDate.entry);  }

function getNudgeShowEra()   { return getWTGBooleanSetting(DEFAULT_SETTINGS.nudgeShowEra.entry);   }

function getNudgeShowTime()  { return getWTGBooleanSetting(DEFAULT_SETTINGS.nudgeShowTime.entry);  }

function getNudgeShowDay()   { return getWTGBooleanSetting(DEFAULT_SETTINGS.nudgeShowDay.entry);   }

function getNudgeShowPhase() { return getWTGBooleanSetting(DEFAULT_SETTINGS.nudgeShowPhase.entry); }

function getANShowDate()     { return getWTGBooleanSetting(DEFAULT_SETTINGS.anShowDate.entry);     }

function getANShowEra()      { return getWTGBooleanSetting(DEFAULT_SETTINGS.anShowEra.entry);      }

function getANShowTime()     { return getWTGBooleanSetting(DEFAULT_SETTINGS.anShowTime.entry);     }

function getANShowDay()      { return getWTGBooleanSetting(DEFAULT_SETTINGS.anShowDay.entry);      }

function getANShowPhase()    { return getWTGBooleanSetting(DEFAULT_SETTINGS.anShowPhase.entry);    }

function getDtCardShowPhase(){ return getWTGBooleanSetting(DEFAULT_SETTINGS.dtCardShowPhase.entry);}

/**
 * Returns the list of card types excluded from timestamp injection.
 * @returns {string[]}
 */

function getExcludedCardTypes() {
  const raw = UnifiedSettings.getSetting('WTG', 'TimeStamp Settings', 'excludeCardTypes') || '';
  if (!raw.trim()) return [];
  return raw.split(',').map(function(t) { return t.trim().toLowerCase(); }).filter(Boolean);
}

/**
 * Applies a map of settings overrides to the WTG Settings card.
 * Keys are entry labels (e.g. "Enable WTG"); values are raw strings.
 * @param {Object} overrides - { [entryLabel]: rawValueString }
 */

function applySettingsOverrides(overrides) {
  for (const entryLabel of Object.keys(overrides)) {
    const def = _entryToKey[entryLabel];
    if (def) {
      UnifiedSettings.setSetting('WTG', def.group, def.internalKey, overrides[entryLabel]);
    }
  }
}


// datetime.js - Era handling, date/time parsing, TurnTime arithmetic, history scanning





// ====================================================================================
// ERA HANDLING
// ====================================================================================

/**
 * Normalizes any era string variant to 'BC' or 'AD'.
 * @param {string} era - Raw era ('BC', 'B.C.', 'BCE', 'B.C.E.', 'AD', 'A.D.', 'CE', 'C.E.').
 * @returns {'BC'|'AD'} Defaults to 'AD' for unknown or falsy input.
 */

function normalizeEra(era) {
  if (!era) return DEFAULT_WTG_ERA;
  const normalized = String(era).trim().toUpperCase().replace(/\s+/g, '');
  switch (normalized) {
    case 'BC': case 'B.C.': case 'BCE': case 'B.C.E.': return 'BC';
    case 'AD': case 'A.D.': case 'CE':  case 'C.E.':   return 'AD';
    default: return DEFAULT_WTG_ERA;
  }
}

/**
 * Returns true if the value is a recognized era abbreviation (case-insensitive).
 * @param {*} token
 * @returns {boolean}
 */

function isEraToken(token) {
  return typeof token === 'string' &&
    new RegExp(`^${WTG_ERA_TOKEN_PATTERN}$`, 'i').test(token.trim());
}

/**
 * Normalizes state.wtg.time.start.era and state.wtg.time.current.era in-place.
 */

function ensureWTGEras() {
  const t = state.wtg.time;
  t.start.era   = normalizeEra(t.start.era   || DEFAULT_WTG_ERA);
  t.current.era = normalizeEra(t.current.era || t.start.era || DEFAULT_WTG_ERA);
}

/**
 * Splits era tokens from time tokens in a raw string. Era may appear anywhere.
 * @param {string} input - e.g. '8:00 AM BC' or 'BC 8:00 AM'.
 * @param {string} [fallbackEra='AD'] - Used when no era token is found.
 * @returns {{ era: string, time: string }}
 */

function parseTimeAndEraInput(input, fallbackEra = DEFAULT_WTG_ERA) {
  const tokens     = (input || '').trim().split(/\s+/).filter(Boolean);
  let era          = normalizeEra(fallbackEra);
  const timeTokens = [];
  for (const token of tokens) {
    if (isEraToken(token)) era = normalizeEra(token);
    else timeTokens.push(token);
  }
  return { era, time: timeTokens.join(' ').trim() };
}

// ====================================================================================
// DATE PARSING & FORMATTING
// ====================================================================================

/**
 * Parses a date string into { month, day, year, era }.
 * Accepts MM/DD/YYYY with dot or dash separators; swaps month/day automatically
 * when month > 12 and day ≤ 12. Optional trailing era token overrides fallbackEra.
 * @param {string} dateStr
 * @param {string} [fallbackEra='AD']
 * @returns {{ month: number, day: number, year: number, era: string }|null}
 *   null on invalid/unparseable input.
 */

function parseDateString(dateStr, fallbackEra = DEFAULT_WTG_ERA, inputFormat = 'auto') {
  if (!dateStr || typeof dateStr !== 'string') {
    DuckieDebug.duckieDebug(`parseDateString: invalid input type (${typeof dateStr})`, DuckieDebug.duckieDebugMode.ERROR);
    return null;
  }
  let normalized = dateStr.trim().replace(/[.-]/g, '/');
  let era        = normalizeEra(fallbackEra);
  const eraMatch = normalized.match(new RegExp(`\\s*(${WTG_ERA_TOKEN_PATTERN})$`, 'i'));
  if (eraMatch) {
    era        = normalizeEra(eraMatch[1]);
    normalized = normalized.slice(0, normalized.length - eraMatch[0].length).trim();
  }
  const parts = normalized.split('/');
  if (parts.length !== 3 || !parts.every(p => /^\d+$/.test(p))) {
    DuckieDebug.duckieDebug(`parseDateString: could not parse "${dateStr}"`, DuckieDebug.duckieDebugMode.ERROR);
    return null;
  }
  let month = parseInt(parts[0], 10);
  let day   = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  const effectiveFormat = inputFormat === 'auto' ? getDateFormat() : inputFormat;
  if (month > 12 && day <= 12) {
    [month, day] = [day, month];
  } else if (month <= 12 && day <= 12 && effectiveFormat === 'european') {
    [month, day] = [day, month];
  }
  if (year < 1) {
    DuckieDebug.duckieDebug(`parseDateString: year < 1 in "${dateStr}"`, DuckieDebug.duckieDebugMode.ERROR);
    return null;
  }
  return { month, day, year, era };
}

/**
 * Formats a date as the internal 'MM/DD/YYYY' storage string (month and day zero-padded).
 * @param {number|Object} monthOrParts - Month number, or an object with { month, day, year }.
 * @param {number} [day]
 * @param {number} [year]
 * @returns {string}
 */

function formatDateForStorage(monthOrParts, day, year) {
  if (typeof monthOrParts === 'object' && monthOrParts !== null) {
    year         = monthOrParts.year;
    day          = monthOrParts.day;
    monthOrParts = monthOrParts.month;
  }
  return `${String(monthOrParts).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

/**
 * Formats a stored date string with its era for display (e.g. '03/15/44 BC').
 * Falls back gracefully if dateStr is unparseable.
 * @param {string} dateStr - Storage-format date ('MM/DD/YYYY').
 * @param {string} [era='AD']
 * @returns {string}
 */

function formatDateForDisplay(dateStr, era = DEFAULT_WTG_ERA, includeEra = true) {
  const parsed = parseDateString(dateStr, era, 'american');
  if (!parsed) {
    if (!includeEra) return (dateStr || '').trim();
    return `${dateStr || ''}${dateStr ? ` ${normalizeEra(era)}` : normalizeEra(era)}`.trim();
  }
  const { month, day, year, era: parsedEra } = parsed;
  let dateDisplay;
  if (getDateFormat() === 'european') {
    dateDisplay = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  } else {
    dateDisplay = formatDateForStorage(parsed);
  }
  return includeEra ? `${dateDisplay} ${parsedEra}` : dateDisplay;
}

/**
 * Combines a storage-format date and display-format time into a full timestamp string.
 * @param {string} dateStr - Storage-format date ('MM/DD/YYYY').
 * @param {string} timeStr - Display-format time, or null/empty to omit.
 * @param {string} [era='AD']
 * @returns {string} e.g. '01/15/2023 AD 8:00 AM'
 */

function formatDateTimeForDisplay(dateStr, timeStr, era = DEFAULT_WTG_ERA) {
  const dateDisplay = formatDateForDisplay(dateStr, era);
  const timeDisplay = timeStr ? formatTimeForDisplay(timeStr) : null;
  return timeDisplay ? `${dateDisplay} ${timeDisplay}` : dateDisplay;
}

// ====================================================================================
// STATE GETTERS
// ====================================================================================

/** @returns {string} Normalized state.wtg.time.start.era, defaulting to 'AD'. */

function getStartingEra()  { return normalizeEra(state.wtg.time.start.era || DEFAULT_WTG_ERA); }
/** @returns {string} Normalized state.wtg.time.current.era, falling back through start.era to 'AD'. */

function getCurrentEra()   { return normalizeEra(state.wtg.time.current.era || state.wtg.time.start.era || DEFAULT_WTG_ERA); }
/** @returns {string} Display-format starting date with era. */

function getStartingDateDisplay()   { return formatDateForDisplay(state.wtg.time.start.date || '01/01/1900', getStartingEra()); }
/** @returns {string} Display-format current date with era. */

function getCurrentDateDisplay()    { return formatDateForDisplay(state.wtg.time.current.date || '01/01/1900', getCurrentEra()); }
/** @returns {string} Full display-format current date + time + era. */

function getCurrentTimestampDisplay() {
  const c = state.wtg.time.current;
  return formatDateTimeForDisplay(c.date || '01/01/1900', c.time || 'Unknown', getCurrentEra());
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Returns the day-of-week name for a storage-format date string.
 * @param {string} dateStr - Storage-format date ('MM/DD/YYYY').
 * @param {string} [era='AD']
 * @returns {string|null} e.g. 'Monday', or null if dateStr is unparseable.
 */

function getDayOfWeek(dateStr, era) {
  const parsed = parseDateString(dateStr, era, 'american');
  if (!parsed) return null;
  const d = createHistoricalDate(parsed.month, parsed.day, parsed.year, parsed.era);
  return DAYS_OF_WEEK[d.getUTCDay()];
}

// ====================================================================================
// ASTRONOMICAL YEAR CONVERSION
// ====================================================================================

/**
 * Converts a calendar year + era to a signed astronomical year (BC 1 = 0, BC 2 = -1, AD 1 = 1).
 * Required because JavaScript's Date mishandles years 0–99.
 * @param {number} year
 * @param {string} [era='AD']
 * @returns {number}
 */

function toAstronomicalYear(year, era = DEFAULT_WTG_ERA) {
  return normalizeEra(era) === 'BC' ? 1 - year : year;
}

/**
 * Converts a signed astronomical year back to { year, era }.
 * @param {number} astronomicalYear
 * @returns {{ year: number, era: 'BC'|'AD' }}
 */

function fromAstronomicalYear(astronomicalYear) {
  return astronomicalYear <= 0
    ? { year: 1 - astronomicalYear, era: 'BC' }
    : { year: astronomicalYear,     era: 'AD' };
}

/**
 * Creates a UTC Date for a historical date, correctly handling years < 100
 * (which the Date constructor would otherwise misinterpret as 1900+).
 * @param {number} month @param {number} day @param {number} year @param {string} [era='AD']
 * @param {number} [hour=0] @param {number} [min=0] @param {number} [sec=0]
 * @returns {Date}
 */

function createHistoricalDate(month, day, year, era = DEFAULT_WTG_ERA, hour = 0, min = 0, sec = 0) {
  const date = new Date(Date.UTC(0, month - 1, day, hour, min, sec));
  date.setUTCFullYear(toAstronomicalYear(year, era), month - 1, day);
  date.setUTCHours(hour, min, sec, 0);
  return date;
}

/**
 * Extracts { month, day, year, era } from a UTC Date, converting the
 * astronomical year back to a calendar year + era.
 * @param {Date} date
 * @returns {{ month: number, day: number, year: number, era: string }}
 */

function getDatePartsFromDate(date) {
  const yearParts = fromAstronomicalYear(date.getUTCFullYear());
  return {
    month: date.getUTCMonth() + 1,
    day:   date.getUTCDate(),
    year:  yearParts.year,
    era:   yearParts.era
  };
}

/**
 * Returns true if the given month/day/year/era combination is a real calendar date.
 * Uses round-trip validation via createHistoricalDate + getDatePartsFromDate.
 * @param {number} month @param {number} day @param {number} year
 * @param {string} [era='AD']
 * @returns {boolean}
 */

function isValidDate(month, day, year, era = DEFAULT_WTG_ERA) {
  if (![month, day, year].every(Number.isInteger) || year < 1) return false;
  const date  = createHistoricalDate(month, day, year, era);
  const parts = getDatePartsFromDate(date);
  return parts.month === month && parts.day === day && parts.year === year && parts.era === normalizeEra(era);
}

// ====================================================================================
// SETTIME COMMAND VALIDATION
// ====================================================================================

/**
 * Validates and normalizes the date + time arguments for a [settime] command.
 * @param {string} dateStr - Raw date string from the command.
 * @param {string} timeStr - Raw time+era string from the command.
 * @param {string} [fallbackEra='AD']
 * @returns {{ month, day, year, startingDate, startingEra, startingTime }|null}
 *   null if the date is missing, unparseable, or fails calendar validation.
 */

function normalizeSettimeArgs(dateStr, timeStr, fallbackEra = DEFAULT_WTG_ERA) {
  const timeInfo   = parseTimeAndEraInput(timeStr, fallbackEra);
  const parsedDate = parseDateString(dateStr, timeInfo.era);
  if (!parsedDate || !isValidDate(parsedDate.month, parsedDate.day, parsedDate.year, parsedDate.era)) {
    DuckieDebug.duckieDebug(`normalizeSettimeArgs: invalid date "${dateStr}" time "${timeStr}"`, DuckieDebug.duckieDebugMode.ERROR);
    return null;
  }
  return {
    month:        parsedDate.month,
    day:          parsedDate.day,
    year:         parsedDate.year,
    startingDate: formatDateForStorage(parsedDate),
    startingEra:  parsedDate.era,
    startingTime: timeInfo.time ? normalizeTime(timeInfo.time) : null
  };
}

// ====================================================================================
// TIME UTILITIES
// ====================================================================================

/**
 * Normalizes a time string, resolving descriptive words (e.g. 'morning' → '8:00 AM').
 * @param {string} str
 * @returns {string|null} Normalized time string, or null if input is falsy.
 */

function normalizeTime(str) {
  if (!str) return null;
  const lower = str.toLowerCase();
  if (DESCRIPTIVE_MAP.has(lower)) return DESCRIPTIVE_MAP.get(lower);
  // Check user-configured phases (longest name first to avoid partial matches).
  const phases = getParsedTimePhases();
  const sorted = [...phases].sort((a, b) => b.name.length - a.name.length);
  for (const phase of sorted) {
    if (phase.name.toLowerCase() === lower) {
      return _minutesToTimeStr(phase.startMinutes);
    }
  }
  return capitalize(str);
}

/** Converts minutes-since-midnight back to a 12-hour display string. */

function _minutesToTimeStr(minutes) {
  const h24  = Math.floor(minutes / 60) % 24;
  const min  = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${String(min).padStart(2, '0')} ${period}`;
}

/**
 * Normalizes a raw time string into display format.
 * - Bare hour with no minutes → appends ':00' and uppercases AM/PM.
 * - 'H:MM' 24-hour string → delegates to convertTo12Hour.
 * - Plain word (no digits) → title-cases first letter.
 * @param {string} str
 * @returns {string}
 */

function capitalize(str) {
  str = str || 'Unknown';
  if (str === 'Unknown') return str;
  if (/\d/.test(str)) {
    if (/^\d{1,2}:\d{2}$/.test(str)) return convertTo12Hour(str);
    str = str.replace(/(am|pm|a\.m\.|p\.m\.)$/i, m => m.toUpperCase());
    if (!/:\d{2}/.test(str)) {
      str = str.replace(/(\d+)\s*([AP]M)?$/i, (match, p1, p2) => `${p1}:00${p2 ? ` ${p2.toUpperCase()}` : ''}`);
    }
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Converts a 24-hour 'H:MM' string to 12-hour 'H:MM AM/PM' format.
 * @param {string} timeStr - e.g. '14:30'
 * @returns {string} e.g. '2:30 PM'
 */

function convertTo12Hour(timeStr) {
  const [hourStr, minStr] = timeStr.split(':');
  let hour   = parseInt(hourStr, 10);
  const min  = minStr ? `:${minStr}` : ':00';
  const period = (hour < 12) ? 'AM' : 'PM';
  if (hour === 0)  hour = 12;
  if (hour > 12)   hour -= 12;
  return `${hour}${min} ${period}`;
}

/**
 * Converts a stored 12-hour time string to the display format per Clock Format setting.
 * '12h' → unchanged; '24h' → zero-padded 'HH:MM'.
 * 'Unknown' and falsy values are returned as 'Unknown'.
 * @param {string} timeStr - Stored time, e.g. '8:00 AM'.
 * @returns {string}
 */

function formatTimeForDisplay(timeStr) {
  if (!timeStr || timeStr === 'Unknown') return timeStr || 'Unknown';
  if (getClockFormat() === '12h') return timeStr;
  const { hour, min } = parseTime(timeStr);
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Parses a display-format time string into { hour, min, sec } in 24-hour integers.
 * Returns { hour:0, min:0 } for 'Unknown' or empty input.
 * Strips trailing ' (generated)' labels before parsing.
 * @param {string} str
 * @returns {{ hour: number, min: number }}
 */

function parseTime(str) {
  if (!str || str === 'Unknown') return {hour: 0, min: 0};
  str = str.replace(/\s+\(generated\)\s*$/i, '').trim();
  let parts   = str.split(/[: ]/);
  let hourStr = parts[0];
  let minStr  = '00';
  let period  = '';
  if (parts.length === 3)      { minStr = parts[1]; period = parts[2]; }
  else if (parts.length === 2) { if (isNaN(parseInt(parts[1], 10))) period = parts[1]; else minStr = parts[1]; }
  if (/[a-zA-Z]/i.test(hourStr)) { const m = hourStr.match(/^(\d+)([a-zA-Z]+)$/i); if (m) { hourStr = m[1]; period = m[2]; } }
  if (/[a-zA-Z]/i.test(minStr))  { const m = minStr.match(/^(\d+)([a-zA-Z]+)$/i);  if (m) { minStr  = m[1]; period = m[2]; } }
  let hour = parseInt(hourStr, 10);
  let min  = parseInt(minStr,  10);
  if (period.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (period.toLowerCase() === 'am' && hour === 12) hour = 0;
  return {hour, min};
}

/**
 * Advances a storage-format date string by a number of days.
 * Falls back to the original dateStr if parsing fails.
 * @param {string} dateStr - Storage-format date ('MM/DD/YYYY').
 * @param {number} [days=0]
 * @param {string} [era] - Defaults to starting era.
 * @returns {{ dateStr: string, era: string }}
 */

function advanceDate(dateStr, days = 0, era = getStartingEra()) {
  const parsedDate = parseDateString(dateStr, era, 'american');
  if (!parsedDate) {
    DuckieDebug.duckieDebug(`advanceDate: could not parse "${dateStr}"`, DuckieDebug.duckieDebugMode.ERROR);
    return { dateStr: dateStr || '01/01/1900', era: normalizeEra(era) };
  }
  const date = createHistoricalDate(parsedDate.month, parsedDate.day, parsedDate.year, parsedDate.era);
  date.setUTCDate(date.getUTCDate() + days);
  const parts = getDatePartsFromDate(date);
  return { dateStr: formatDateForStorage(parts), era: parts.era };
}

/**
 * Advances a 12-hour time string by the given hours/minutes.
 * Wraps past midnight and reports overflow as a day count.
 * @param {string} timeStr - Display-format time (e.g. '8:00 AM').
 * @param {number} [hours=0] @param {number} [minutes=0]
 * @returns {{ time: string, days: number }} days = full 24h periods that overflowed.
 */

function advanceTime(timeStr, hours = 0, minutes = 0) {
  let parts   = timeStr.split(/[: ]/);
  let hourStr = parts[0];
  let minStr  = '00';
  let period  = '';
  if (parts.length === 3)      { minStr = parts[1]; period = parts[2]; }
  else if (parts.length === 2) { if (isNaN(parseInt(parts[1], 10))) period = parts[1]; else minStr = parts[1]; }
  if (/[a-zA-Z]/i.test(hourStr)) { const m = hourStr.match(/^(\d+)([a-zA-Z]+)$/i); if (m) { hourStr = m[1]; period = m[2]; } }
  if (/[a-zA-Z]/i.test(minStr))  { const m = minStr.match(/^(\d+)([a-zA-Z]+)$/i);  if (m) { minStr  = m[1]; period = m[2]; } }
  let hour = parseInt(hourStr, 10);
  let min  = parseInt(minStr,  10);
  if (period.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (period.toLowerCase() === 'am' && hour === 12) hour = 0;
  let totalSeconds = hour * 3600 + min * 60 + hours * 3600 + minutes * 60;
  let extraDays    = Math.floor(totalSeconds / 86400);
  let wrapped      = totalSeconds % 86400;
  hour   = Math.floor(wrapped / 3600);
  min    = Math.floor((wrapped % 3600) / 60);
  let sec = wrapped % 60;
  period  = (hour < 12) ? 'AM' : 'PM';
  if (hour === 0)  hour = 12;
  if (hour > 12)   hour -= 12;
  return {
    time: `${hour}:${String(min).padStart(2, '0')} ${period}`,
    days: extraDays
  };
}

// ====================================================================================
// HISTORY SCANNING
// ====================================================================================

/**
 * Scans text (then optionally history) for the most recent WTG-formatted date.
 * @param {string} [currentOutput=''] - Current turn output text.
 * @param {boolean} [useHistory=false] - Whether to fall back through history.
 * @returns {string|null} Display-format date string, or null if none found.
 */

function getCurrentDateFromHistory(currentOutput = '', useHistory = false) {
  const dateRegex = new RegExp(WTG_DATE_PATTERN, 'gi');
  const toDisplay = (raw) => {
    const normalized = raw.trim().replace(/[.-]/g, '/');
    const parsed = parseDateString(normalized, getCurrentEra()); // 'auto': respects user's date format
    if (!parsed) return formatDateForDisplay(normalized, getCurrentEra());
    return formatDateForDisplay(formatDateForStorage(parsed), parsed.era);
  };
  let matches = currentOutput.match(dateRegex);
  if (matches && matches.length > 0) {
    return toDisplay(matches[matches.length - 1]);
  }
  if (useHistory) {
    for (let i = history.length - 1; i >= 0; i--) {
      matches = history[i].text.match(dateRegex);
      if (matches && matches.length > 0) {
        return toDisplay(matches[matches.length - 1]);
      }
    }
  }
  return null;
}

/**
 * Scans text (then optionally history) for the most recent time mention.
 * Ignores descriptive times (morning, night, etc.) if state already has a precise time.
 * @param {string} [currentOutput=''] - Current turn output text.
 * @param {boolean} [useHistory=false] - Whether to fall back through history.
 * @returns {string|null} Normalized time string, or null if none found.
 */

function getCurrentTimeFromHistory(currentOutput = '', useHistory = false) {
  // Build regex dynamically to include user-configured phase names (longest first).
  const phases   = getParsedTimePhases();
  const sorted   = [...phases].sort((a, b) => b.name.length - a.name.length);
  const phaseAlt = sorted.map(p => p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const phaseNames = new Set(sorted.map(p => p.name.toLowerCase()));
  const descriptiveAlt = 'noon|midday|midnight' + (phaseAlt ? '|' + phaseAlt : '');
  const timeRegex = new RegExp(
    `(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|a\\.m\\.|p\\.m\\.))|(\\d{1,2}:\\d{2})|(${descriptiveAlt})`,
    'gi'
  );
  const tryExtract = (text) => {
    const matches = text.match(timeRegex);
    if (!matches || matches.length === 0) return null;
    const lastMatch     = matches[matches.length - 1].trim();
    const lower         = lastMatch.toLowerCase();
    const isDescriptive = DESCRIPTIVE_MAP.has(lower) || phaseNames.has(lower);
    const currentIsPrecise = state.wtg.time.current.time && /\d{1,2}:\d{2} [AP]M/.test(state.wtg.time.current.time);
    return (!isDescriptive || !currentIsPrecise) ? lastMatch : null;
  };
  const direct = tryExtract(currentOutput);
  if (direct) return normalizeTime(direct);
  if (useHistory) {
    for (let i = history.length - 1; i >= 0; i--) {
      const found = tryExtract(history[i].text);
      if (found) return normalizeTime(found);
    }
  }
  return null;
}

// ====================================================================================
// TURNTIME OPERATIONS
// ====================================================================================

/**
 * Parses a TurnTime string (e.g. '01y06m15d12h30n') into a TurnTime object.
 * Returns all-zeros and logs a debug warning if the string does not match the pattern.
 * @param {string} str
 * @returns {{ years, months, days, hours, minutes }}
 */

function parseTurnTime(str) {
  const match = str.match(new RegExp(WTG_TURN_TIME_PATTERN));
  if (!match) {
    DuckieDebug.duckieDebug(`parseTurnTime: no match for "${str}" — returning zero`, DuckieDebug.duckieDebugMode.ERROR);
    return {years:0, months:0, days:0, hours:0, minutes:0};
  }
  return {
    years:   parseInt(match[1]),
    months:  parseInt(match[2]),
    days:    parseInt(match[3]),
    hours:   parseInt(match[4]),
    minutes: parseInt(match[5])
  };
}

/**
 * Formats a TurnTime object as a compact string (e.g. '01y06m15d12h30n').
 * Null/undefined input is treated as all-zeros.
 * @param {{ years, months, days, hours, minutes }|null} tt
 * @returns {string}
 */

function formatTurnTime(tt) {
  tt = tt || {years:0, months:0, days:0, hours:0, minutes:0};
  return `${String(tt.years).padStart(2,'0')}y${String(tt.months).padStart(2,'0')}m${String(tt.days).padStart(2,'0')}d${String(tt.hours).padStart(2,'0')}h${String(tt.minutes).padStart(2,'0')}n`;
}

/**
 * Returns a new TurnTime with the delta added and carry/borrow propagated.
 * Carry order: minutes→hours→days; months→years.
 * Days do NOT carry into months (design constraint — months have variable length).
 * Negative deltas are supported: borrows propagate correctly for minutes, hours,
 * and months. If days go negative after borrowing (which requires borrowing from
 * months, which is not supported), the result is clamped to zero. If years go
 * negative the entire TurnTime is clamped to zero.
 * Null base is treated as all-zeros.
 * @param {{ years, months, days, hours, minutes }|null} tt - Base TurnTime.
 * @param {{ years?, months?, days?, hours?, minutes? }} add - Delta to add (may be negative).
 * @returns {{ years, months, days, hours, minutes }}
 */

function addToTurnTime(tt, add) {
  tt = tt || {years:0, months:0, days:0, hours:0, minutes:0};
  let n = {...tt};
  n.minutes += add.minutes || 0;
  const minCarry  = Math.floor(n.minutes / 60);
  n.minutes = ((n.minutes % 60) + 60) % 60;
  n.hours   += minCarry + (add.hours || 0);
  const hourCarry = Math.floor(n.hours / 24);
  n.hours   = ((n.hours % 24) + 24) % 24;
  n.days    += hourCarry + (add.days || 0);
  if (n.days < 0) { n.days = 0; n.hours = 0; n.minutes = 0; }
  n.months  += add.months  || 0;
  const monCarry  = Math.floor(n.months / 12);
  n.months  = ((n.months % 12) + 12) % 12;
  n.years   += monCarry + (add.years || 0);
  if (n.years < 0) return {years:0, months:0, days:0, hours:0, minutes:0};
  return n;
}

/**
 * Lexicographically compares two TurnTime objects, most-significant field first.
 * Returns -1 if tt1 < tt2, 1 if tt1 > tt2, 0 if equal or either is null/undefined.
 * @param {{ years, months, days, hours, minutes }|null} tt1
 * @param {{ years, months, days, hours, minutes }|null} tt2
 * @returns {-1|0|1}
 */

function compareTurnTime(tt1, tt2) {
  if (!tt1 || !tt2) return 0;
  if (tt1.years   !== tt2.years)   return tt1.years   < tt2.years   ? -1 : 1;
  if (tt1.months  !== tt2.months)  return tt1.months  < tt2.months  ? -1 : 1;
  if (tt1.days    !== tt2.days)    return tt1.days    < tt2.days    ? -1 : 1;
  if (tt1.hours   !== tt2.hours)   return tt1.hours   < tt2.hours   ? -1 : 1;
  if (tt1.minutes !== tt2.minutes) return tt1.minutes < tt2.minutes ? -1 : 1;
  return 0;
}

/**
 * Computes the current date/time by adding a TurnTime delta to the starting date/time.
 * When startingTime is 'Unknown', uses an approximate day count (365d/yr, 30d/mo).
 * Falls back to startingDate unchanged if it cannot be parsed.
 * @param {string} startingDate - Storage-format date ('MM/DD/YYYY').
 * @param {string} startingTime - Display-format time, or 'Unknown'.
 * @param {{ years, months, days, hours, minutes }} tt - Elapsed TurnTime.
 * @param {string} [startingEra] - Defaults to starting era from state.
 * @returns {{ currentDate: string, currentEra: string, currentTime: string }}
 */

function computeCurrent(startingDate, startingTime, tt, startingEra = getStartingEra()) {
  startingDate = startingDate || '01/01/1900';
  startingTime = startingTime || 'Unknown';
  tt           = tt           || {years:0, months:0, days:0, hours:0, minutes:0};
  const parsedStartDate = parseDateString(startingDate, startingEra, 'american');
  if (!parsedStartDate) {
    DuckieDebug.duckieDebug(`computeCurrent: could not parse startingDate "${startingDate}" — returning unchanged`, DuckieDebug.duckieDebugMode.ERROR);
    return { currentDate: startingDate, currentEra: normalizeEra(startingEra), currentTime: startingTime };
  }
  if (startingTime === 'Unknown') {
    const approxDays  = (tt.years || 0) * 365 + (tt.months || 0) * 30 + (tt.days || 0);
    const advancedDate = advanceDate(startingDate, approxDays, parsedStartDate.era);
    return { currentDate: advancedDate.dateStr, currentEra: advancedDate.era, currentTime: 'Unknown' };
  }
  let date = createHistoricalDate(parsedStartDate.month, parsedStartDate.day, parsedStartDate.year, parsedStartDate.era);
  date.setUTCFullYear(date.getUTCFullYear() + (tt.years  || 0));
  date.setUTCMonth(  date.getUTCMonth()    + (tt.months || 0));
  date.setUTCDate(   date.getUTCDate()     + (tt.days   || 0));
  const {time, days} = advanceTime(startingTime, tt.hours || 0, tt.minutes || 0);
  date.setUTCDate(date.getUTCDate() + days);
  const parts = getDatePartsFromDate(date);
  return { currentDate: formatDateForStorage(parts), currentEra: parts.era, currentTime: time };
}

/**
 * Computes the elapsed time between two date+time pairs as a TurnTime object.
 * Returns all-zeros if either date fails to parse, or if end is before start.
 * @param {string} startStr @param {string} startTimeStr
 * @param {string} endStr   @param {string} endTimeStr
 * @param {string} [startEra] @param {string} [endEra]
 * @returns {{ years, months, days, hours, minutes }}
 */

function getDateDiff(startStr, startTimeStr, endStr, endTimeStr, startEra = getStartingEra(), endEra = getCurrentEra()) {
  const startDate = parseDateString(startStr, startEra, 'american');
  const endDate   = parseDateString(endStr,   endEra,   'american');
  if (!startDate || !endDate) {
    DuckieDebug.duckieDebug(`getDateDiff: parse failure — start "${startStr}" end "${endStr}"`, DuckieDebug.duckieDebugMode.ERROR);
    return {years:0, months:0, days:0, hours:0, minutes:0};
  }
  const sp    = parseTime(startTimeStr);
  const ep    = parseTime(endTimeStr);
  const start = createHistoricalDate(startDate.month, startDate.day, startDate.year, startDate.era, sp.hour, sp.min);
  const end   = createHistoricalDate(endDate.month,   endDate.day,   endDate.year,   endDate.era,   ep.hour, ep.min);
  if (end < start) return {years:0, months:0, days:0, hours:0, minutes:0 };
  let years   = end.getUTCFullYear() - start.getUTCFullYear();
  let months  = end.getUTCMonth()    - start.getUTCMonth();
  let days    = end.getUTCDate()     - start.getUTCDate();
  let hours   = end.getUTCHours()    - start.getUTCHours();
  let minutes = end.getUTCMinutes()  - start.getUTCMinutes();
  if (minutes < 0) { hours--;   minutes += 60; }
  if (hours   < 0) { days--;    hours   += 24; }
  if (days    < 0) {
    months--;
    const prev = new Date(end.getTime());
    prev.setUTCDate(0);
    days += prev.getUTCDate();
  }
  if (months  < 0) { years--;   months  += 12; }
  return {years, months, days, hours, minutes};
}

/**
 * Combines a storage-format date and display-format time into a UTC Date object.
 * Returns null if dateStr is missing, not a slash-format string, or unparseable.
 * @param {string} dateStr - Storage-format date ('MM/DD/YYYY').
 * @param {string} timeStr - Display-format time (e.g. '8:00 AM').
 * @returns {Date|null}
 */

function parseDateTime(dateStr, timeStr) {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('/')) return null;
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parsedDate = parseDateString(dateStr, getCurrentEra());
  if (!parsedDate) return null;
  const time = parseTime(timeStr);
  return createHistoricalDate(parsedDate.month, parsedDate.day, parsedDate.year, parsedDate.era, time.hour, time.min);
}

// ====================================================================================
// TIME PHASE UTILITIES
// ====================================================================================

const DAYS_OF_WEEK_LOWER = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DOW_ABBREV = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };

/**
 * Returns the name of the time phase containing the given time string, or null
 * if the time falls between phases. Phases are tested longest-name-first so
 * "Late Morning" is checked before "Morning".
 * @param {string} timeStr - Display-format time, e.g. '10:30 AM'.
 * @param {Array} [phases] - Parsed phase array; defaults to getParsedTimePhases().
 * @returns {string|null}
 */

function getCurrentPhase(timeStr, phases) {
  if (!timeStr || timeStr === 'Unknown') return null;
  const mins = _timeStrToMinutes(timeStr);
  if (mins < 0) return null;
  const list = phases || getParsedTimePhases();
  const sorted = [...list].sort((a, b) => b.name.length - a.name.length);
  for (const phase of sorted) {
    const { startMinutes: s, endMinutes: e } = phase;
    if (s < e) {
      if (mins >= s && mins < e) return phase.name;
    } else {
      // Midnight-crossing phase (e.g. Night: 1200–0, After Midnight: 0–240).
      if (mins >= s || mins < e) return phase.name;
    }
  }
  return null;
}

/**
 * Returns the target date and time for the next start of a named phase.
 * Always advances to the NEXT occurrence — if currently inside the phase,
 * jumps to tomorrow's start.
 * @param {string} phaseName
 * @param {string} currentDateStr - Storage-format date.
 * @param {string} currentTimeStr - Display-format time.
 * @param {string} era
 * @returns {{ targetDate: string, targetTime: string }|null} null if phase not found.
 */

function getNextPhaseStart(phaseName, currentDateStr, currentTimeStr, era) {
  const phases = getParsedTimePhases();
  const lower  = phaseName.toLowerCase();
  const phase  = phases.find(p => p.name.toLowerCase() === lower);
  if (!phase) return null;

  const currentMins = _timeStrToMinutes(currentTimeStr);
  const targetTime  = _minutesToTimeStr(phase.startMinutes);

  // Advance to tomorrow if we are already at or past the phase start
  // (which includes being inside the phase).
  let advance = 0;
  if (currentMins < 0 || currentMins >= phase.startMinutes) {
    // Check if we are inside the phase too (for midnight-crossing phases).
    const inside = getCurrentPhase(currentTimeStr, phases) === phase.name;
    if (inside || currentMins >= phase.startMinutes) advance = 1;
  }
  // If the phase start is later today and we are before it, no advance needed.
  // But if start == current we still jump to tomorrow.
  if (currentMins === phase.startMinutes) advance = 1;

  const next = advanceDate(currentDateStr, advance, era);
  return { targetDate: next.dateStr, targetTime };
}

/**
 * Returns the target date and time for the next occurrence of a named day-of-week.
 * Always advances at least 1 day (never stays on the same calendar day).
 * @param {string} dowName - Full name (e.g. 'Friday') or 3-letter abbreviation ('Fri').
 * @param {string} currentDateStr - Storage-format date.
 * @param {string} currentTimeStr - Display-format time (preserved as-is).
 * @param {string} era
 * @returns {{ targetDate: string, targetTime: string }|null} null if name not recognized.
 */

function getNextDayOfWeekStart(dowName, currentDateStr, currentTimeStr, era) {
  const lower = dowName.toLowerCase().trim();
  let targetDow = DAYS_OF_WEEK_LOWER.indexOf(lower);
  if (targetDow === -1) targetDow = DOW_ABBREV[lower.slice(0, 3)] ?? -1;
  if (targetDow === -1) return null;

  const parsed = parseDateString(currentDateStr, era, 'american');
  if (!parsed) return null;
  const d = createHistoricalDate(parsed.month, parsed.day, parsed.year, parsed.era);
  const currentDow = d.getUTCDay();

  let daysAhead = targetDow - currentDow;
  if (daysAhead <= 0) daysAhead += 7; // always at least 1 day forward

  const next = advanceDate(currentDateStr, daysAhead, era);
  return { targetDate: next.dateStr, targetTime: currentTimeStr };
}



// prehook.js - WTG settings registration with UnifiedSettings.
// This runs before UnifiedSettings.ensureSettingCardsExist() so that all
// WTG settings are known to UnifiedSettings before card management begins.
// defineSettings is idempotent — safe to call every turn.


// Build a per-group map: groupName → { internalKey: { key, defaultValue, description? } }
const _WTG_GROUPS = (() => {
  const groups = {};
  for (const [internalKey, { entry, value, group, desc }] of Object.entries(DEFAULT_SETTINGS)) {
    if (!groups[group]) groups[group] = {};
    groups[group][internalKey] = { key: entry, defaultValue: value, description: desc };
  }
  return groups;
})();

const _GROUP_DESCRIPTIONS = {
  'Nudge Settings':                       'Controls how commands are cleaned from player input and what time info appears in nudges.',
  "Author's Note (AN) Injection Settings":'Controls which time fields are appended to the Author\'s Note each turn.',
  'Current Date/Time Card Settings':      'Controls content of the Current Date and Time storycard.',
  'AI Card Generation Settings':          'Controls automatic character and location card creation/deletion.',
  'TimeStamp Settings':                   'Controls when and where timestamps are written on storycards.',
};

function wtgPrehook() {
  UnifiedSettings.defineMod('WTG', 'World Time Generator', SYSTEM_CARD_TITLES.WTG_SETTINGS, 'description');
  for (const [groupName, settings] of Object.entries(_WTG_GROUPS)) {
    UnifiedSettings.defineGroup('WTG', groupName, _GROUP_DESCRIPTIONS[groupName] || '');
    UnifiedSettings.defineSettings({ modName: 'WTG', group: groupName, card: SYSTEM_CARD_TITLES.WTG_SETTINGS, setting: settings });
  }
  UnifiedSettings.defineText({modName: 'WTG', key: 'credit', card: SYSTEM_CARD_TITLES.WTG_SETTINGS, field: 'entry', text: `This scenario is using World Time Generator v.${VERSION}. \n\nYou can configure the settings below in the Notes section. \n\nVisit github via the link in the Triggers for more information on how to use or how to add it to your own scenarios. \nWorld Time Generator is an open-source AI Dungeon mod for time management by helpfulDuckie. You have my full permission to use it or its components with any scenario or mod bundle.`})
  UnifiedSettings.defineCardKeys('WTG', SYSTEM_CARD_TITLES.WTG_SETTINGS, GITHUB);
  locPrehook();
}


// ── [setStartTime mm/dd/year time ERA] ─────────────────────────────

function playerCommandSetStartTime(parsed) {
  const wtg = state.wtg;
  const t   = state.wtg.time;
  if (parsed) {
    applyStartingTime(t, wtg, parsed.startingDate, parsed.startingEra, parsed.startingTime || 'Unknown');
    updateAllStoryCardTimestamps(t.current.date, t.current.time);
    if (!getIsDynamicTimeEnabled()) clearCommandCooldowns('user setStartTime command');
  }
}

// ── [advance N unit] ───────────────────────────────────────────────

function playerCommandAdvance(add) {
  _applyTimeAdvance(add);
  if (getIsDynamicTimeEnabled()) setAdvanceCooldown({ minutes: 5 });
}

// ── [sleep] ────────────────────────────────────────────────────────

function playerCommandSleep(add) {
  const t = state.wtg.time;

  if (t.current.time === 'Unknown' || !/\d/.test(t.current.time)) {
    t.start.time = '8:00 AM';
    add = { days: 1 };
  } else if (!add || !Object.keys(add).length) {
    add = { hours: Math.floor(Math.random() * 3) + 6, minutes: Math.floor(Math.random() * 60) };
  }

  _applyTimeAdvance(add);
  if (getIsDynamicTimeEnabled()) setSleepCooldown({ hours: 8 });
}

// ── [time] ─────────────────────────────────────────────────────────

function playerCommandTime() {
  // read-only — nudge generated by generateStoryNudge in commands.js
}

// ── [reset] ────────────────────────────────────────────────────────

function playerCommandReset() {
  const wtg  = state.wtg;
  const t    = state.wtg.time;
  const newDate = getCurrentDateFromHistory('', true);
  const newTime = getCurrentTimeFromHistory('', true);
  let valid = false;
  if (newDate) {
    const parsedReset = parseDateString(newDate, getCurrentEra());
    if (parsedReset && isValidDate(parsedReset.month, parsedReset.day, parsedReset.year, parsedReset.era)) {
      t.current.date = formatDateForStorage(parsedReset);
      t.current.era  = parsedReset.era;
      t.current.time = newTime ? normalizeTime(newTime) : t.start.time;
      t.turnTime     = getDateDiff(
        t.start.date, t.start.time,
        t.current.date, t.current.time,
        t.start.era, t.current.era
      );
      updateAllStoryCardTimestamps(t.current.date, t.current.time);
      valid = true;
    }
  }
  if (valid) {
    state.wtg.changed = true;
    if (getIsDynamicTimeEnabled()) clearCommandCooldowns('user reset command');
  }
}

// ── [goTo date|time|both] ──────────────────────────────────────────

function playerCommandGoTo(args) {
  return _applyGoToAdvance(args, false);
}

// ── [sleepUntil date|time|both] ────────────────────────────────────

function playerCommandSleepUntil(args) {
  return _applyGoToAdvance(args, true);
}

/**
 * Shared engine for goTo and sleepUntil.
 * Resolves the target date/time from args (which may supply a date, a time, both, or
 * an ambiguous time), validates that it is in the future, computes the diff, applies it,
 * sets cooldowns, and returns { diff } on success or { error } on failure.
 */

function _applyGoToAdvance(args, isSleep) {
  const t = state.wtg.time;
  let { targetDate, targetTime, targetEra, ambiguousTime, targetPhase, targetDOW } = args;
  // Track whether a full date was explicitly given so the rollover logic is skipped.
  let dateWasExplicit = !!args.targetDate;

  // Resolve phase name → concrete date/time (next occurrence).
  if (targetPhase) {
    const resolved = getNextPhaseStart(targetPhase, t.current.date, t.current.time, t.current.era);
    if (!resolved) return { error: `Phase "${targetPhase}" not found in WTG Time Phases card.` };
    targetDate     = resolved.targetDate;
    targetTime     = resolved.targetTime;
    targetEra      = t.current.era;
    ambiguousTime  = false;
    dateWasExplicit = true;  // phase resolution already picked the correct day
  }

  // Resolve day-of-week name → concrete date (same time of day, next occurrence).
  if (targetDOW) {
    const resolved = getNextDayOfWeekStart(targetDOW, t.current.date, t.current.time, t.current.era);
    if (!resolved) return { error: `"${targetDOW}" is not a recognised day of the week.` };
    targetDate    = resolved.targetDate;
    targetTime    = resolved.targetTime;
    targetEra     = t.current.era;
    ambiguousTime = false;
    dateWasExplicit = true;  // DOW resolution already picked the correct day
  }

  // Fill in any omitted half from current state.
  if (!targetDate) { targetDate = t.current.date; targetEra = t.current.era; }
  if (!targetTime)  targetTime = t.current.time;

  const currentParsed = parseDateString(t.current.date, t.current.era, 'american');
  const currentTime24 = parseTime(t.current.time);
  const currentDT     = createHistoricalDate(currentParsed.month, currentParsed.day, currentParsed.year, t.current.era, currentTime24.hour, currentTime24.min);

  if (ambiguousTime) {
    // Try both AM and PM; pick the nearer future candidate.
    const { hour, min } = parseTime(targetTime);
    const hourPM        = hour === 12 ? 12 : hour + 12;
    const parsedDate    = parseDateString(targetDate, targetEra);

    const candidateAM = createHistoricalDate(parsedDate.month, parsedDate.day, parsedDate.year, targetEra, hour,   min);
    const candidatePM = createHistoricalDate(parsedDate.month, parsedDate.day, parsedDate.year, targetEra, hourPM, min);

    const diffAM = candidateAM - currentDT;
    const diffPM = candidatePM - currentDT;

    let chosen;
    if (diffAM > 0 && diffPM > 0) chosen = diffAM <= diffPM ? candidateAM : candidatePM;
    else if (diffAM > 0)          chosen = candidateAM;
    else if (diffPM > 0)          chosen = candidatePM;
    else {
      return { error: 'Cannot advance to a time in the past. The target date/time is already passed.' };
    }

    // Reconstruct targetTime as a display string from the winning candidate.
    targetTime = convertTo12Hour(`${chosen.getUTCHours()}:${String(chosen.getUTCMinutes()).padStart(2, '0')}`);
    ambiguousTime = false;
  } else {
    // Unambiguous time — if no date was given, roll over to next day when target ≤ current.
    if (!dateWasExplicit) {
      const tgt24 = parseTime(targetTime);
      const tgtMs = tgt24.hour * 60 + tgt24.min;
      const curMs = currentTime24.hour * 60 + currentTime24.min;
      if (tgtMs <= curMs) {
        const next = advanceDate(targetDate, 1, targetEra);
        targetDate = next.dateStr;
        targetEra  = next.era;
      }
    }
  }

  const targetParsed = parseDateString(targetDate, targetEra);
  const targetTime24 = parseTime(targetTime);
  const targetDT     = createHistoricalDate(targetParsed.month, targetParsed.day, targetParsed.year, targetEra, targetTime24.hour, targetTime24.min);

  if (targetDT <= currentDT) {
    return { error: 'Cannot advance to a time in the past. The target date/time is already passed.' };
  }

  const diff = getDateDiff(t.current.date, t.current.time, targetDate, targetTime, t.current.era, targetEra);
  _applyTimeAdvance(diff);

  if (isSleep && getIsDynamicTimeEnabled())  setSleepCooldown({ hours: 8 });
  if (!isSleep && getIsDynamicTimeEnabled()) setAdvanceCooldown({ minutes: 5 });

  return { diff };
}

// ── [goBack date|time|both] ────────────────────────────────────────

function playerCommandGoBack(args) {
  return _applyGoBackAdvance(args);
}

/**
 * Resolves the target date/time from args, validates that it is in the past (but
 * not before the scenario start), applies the rewind, clears any cooldowns that
 * are now beyond the new current time, sets the advance cooldown, and returns
 * { diff } on success or { error } on failure.
 * Accepts the same parsed args shape as _applyGoToAdvance. Phase and day-of-week
 * names are not supported (previous occurrence resolution is not implemented).
 */

function _applyGoBackAdvance(args) {
  const t = state.wtg.time;
  let { targetDate, targetTime, targetEra, ambiguousTime, targetPhase, targetDOW } = args;
  let dateWasExplicit = !!args.targetDate;

  if (targetPhase) return { error: 'Cannot use a phase name with [goBack]. Please specify an explicit date and time.' };
  if (targetDOW)   return { error: 'Cannot use a day name with [goBack]. Please specify an explicit date and time.' };

  // Fill in any omitted half from current state.
  if (!targetDate) { targetDate = t.current.date; targetEra = t.current.era; }
  if (!targetTime)  targetTime = t.current.time;

  const currentParsed = parseDateString(t.current.date, t.current.era, 'american');
  const currentTime24 = parseTime(t.current.time);
  const currentDT     = createHistoricalDate(currentParsed.month, currentParsed.day, currentParsed.year, t.current.era, currentTime24.hour, currentTime24.min);

  if (ambiguousTime) {
    // Try both AM and PM; pick the nearer *past* candidate.
    const { hour, min } = parseTime(targetTime);
    const hourPM        = hour === 12 ? 12 : hour + 12;
    const parsedDate    = parseDateString(targetDate, targetEra);

    const candidateAM = createHistoricalDate(parsedDate.month, parsedDate.day, parsedDate.year, targetEra, hour,   min);
    const candidatePM = createHistoricalDate(parsedDate.month, parsedDate.day, parsedDate.year, targetEra, hourPM, min);

    const diffAM = currentDT - candidateAM;  // positive = candidate is in the past
    const diffPM = currentDT - candidatePM;

    let chosen;
    if (diffAM > 0 && diffPM > 0) chosen = diffAM <= diffPM ? candidateAM : candidatePM;
    else if (diffAM > 0)          chosen = candidateAM;
    else if (diffPM > 0)          chosen = candidatePM;
    else return { error: 'Cannot go back to a time in the future. Use [goTo] to advance time.' };

    targetTime = convertTo12Hour(`${chosen.getUTCHours()}:${String(chosen.getUTCMinutes()).padStart(2, '0')}`);
    ambiguousTime = false;
  } else {
    // Unambiguous time — if no explicit date was given and target time ≥ current, go back to yesterday.
    if (!dateWasExplicit) {
      const tgt24 = parseTime(targetTime);
      const tgtMs = tgt24.hour * 60 + tgt24.min;
      const curMs = currentTime24.hour * 60 + currentTime24.min;
      if (tgtMs >= curMs) {
        const prev = advanceDate(targetDate, -1, targetEra);
        targetDate = prev.dateStr;
        targetEra  = prev.era;
      }
    }
  }

  const targetParsed = parseDateString(targetDate, targetEra);
  const targetTime24 = parseTime(targetTime);
  const targetDT     = createHistoricalDate(targetParsed.month, targetParsed.day, targetParsed.year, targetEra, targetTime24.hour, targetTime24.min);

  const startParsed = parseDateString(t.start.date, t.start.era, 'american');
  const startTime24 = parseTime(t.start.time);
  const startDT     = createHistoricalDate(startParsed.month, startParsed.day, startParsed.year, t.start.era, startTime24.hour, startTime24.min);

  if (targetDT < startDT) {
    return { error: 'Cannot go before the scenario start time.' };
  }
  if (targetDT >= currentDT) {
    return { error: 'Cannot go back to a time that is not in the past. Use [goTo] to advance time.' };
  }

  const targetTT   = getDateDiff(t.start.date, t.start.time, targetDate, targetTime, t.start.era, targetEra);
  const rewindDiff = getDateDiff(targetDate, targetTime, t.current.date, t.current.time, targetEra, t.current.era);
  _applyRewind(targetTT);
  clearFutureCooldowns(targetTT);
  if (getIsDynamicTimeEnabled()) setAdvanceCooldown({ minutes: 5 });
  return { diff: rewindDiff };
}

/**
 * Directly sets turnTime to the given target TT (for rewinding), recomputes current
 * date/time, and sets the standard post-command state flags.
 * @param {{ years, months, days, hours, minutes }} targetTT
 */

function _applyRewind(targetTT) {
  const wtg = state.wtg;
  const t   = wtg.time;
  t.turnTime = targetTT;
  const { currentDate, currentEra, currentTime } = computeCurrent(t.start.date, t.start.time, t.turnTime, t.start.era);
  t.current.date = currentDate;
  t.current.era  = currentEra;
  t.current.time = currentTime;
  wtg.changed = true;
}

/**
 * Applies a time delta to turnTime, recomputes current date/time, and
 * sets the standard post-command state flags.
 * @param {{ years?, months?, days?, hours?, minutes? }} add
 */

function _applyTimeAdvance(add) {
  const wtg = state.wtg;
  const t   = wtg.time;

  t.turnTime = addToTurnTime(t.turnTime, add);

  const { currentDate, currentEra, currentTime } = computeCurrent(
    t.start.date, t.start.time, t.turnTime, t.start.era
  );
  t.current.date = currentDate;
  t.current.era  = currentEra;
  t.current.time = currentTime;

  wtg.changed = true;
}


// turndata.js - RVH-based anchor helpers and storycard cleanup


// ====================================================================================
// INIT TRACKING
// ====================================================================================

/**
 * Marks [settime] as having been run by setting state.wtg.initialized.
 */

function markSettimeAsInitialized() {
  if (state.wtg) state.wtg.initialized = true;
}


// ====================================================================================
// RVH ANCHOR HELPERS
// ====================================================================================

/**
 * Walk RVH history backwards and return { index, entry } for the most
 * recent entry that has scriptData.wtg.tt set. Returns null if none found.
 *
 * Checks the pending playerAction first (written in the input hook, not yet
 * committed to history) so that a player command's anchor is visible to the
 * context hook without any cross-hook flags. The returned object carries
 * pending: true in that case, and index is one past the committed history end.
 */

function getLastAnchorFromRVH() {
  const pendingSD = state.rvh?.playerAction?.scriptData?.wtg;
  if (pendingSD?.tt) {
    return {
      index:   RevampedHistory.getHistoryLength(),
      pending: true,
      entry:   { text: '', scriptData: { wtg: pendingSD } },
    };
  }
  const len = RevampedHistory.getHistoryLength();
  if (len === 0) return null;
  for (let i = len - 1; i >= 0; i--) {
    if (RevampedHistory.getScriptData(i, 'wtg', 'tt')) return { index: i, entry: _makeAnchorEntry(i) };
  }
  return null;
}

function _makeAnchorEntry(i) {
  const text       = RevampedHistory.getEntry(i)?.text ?? '';
  const scriptData = { wtg: RevampedHistory.getScriptData(i, 'wtg') };
  return { text, scriptData };
}

/**
 * Find the most recent RVH anchor and compute how many history characters
 * appear after it. Reads directly from state.rvh.history (up to 1000 entries)
 * so the 100-entry window limitation of AID's history[] no longer applies.
 *
 * @returns {{ lastTT, charsAfter, found, foundInHistory, lastTM, lastCPM }}
 */

function getLastTurnTimeAndChars() {
  const defaultTM  = getTimeMultiplier();
  const defaultCPM = getCharsPerMinute();

  const anchor = getLastAnchorFromRVH();
  if (!anchor) {
    return {
      lastTT:         { years:0, months:0, days:0, hours:0, minutes:0 },
      charsAfter:     RevampedHistory.getEntries().reduce((s, e) => s + (e.text || '').length, 0),
      found:          false,
      foundInHistory: false,
      lastTM:         defaultTM,
      lastCPM:        defaultCPM,
    };
  }

  const sd = anchor.entry.scriptData?.wtg;
  return {
    lastTT:         parseTurnTime(sd.tt),
    charsAfter:     RevampedHistory.getEntries(anchor.index + 1).reduce((s, e) => s + (e.text || '').length, 0),
    found:          true,
    foundInHistory: true,
    lastTM:         typeof sd.tm  === 'number' ? sd.tm  : defaultTM,
    lastCPM:        typeof sd.cpm === 'number' ? sd.cpm : defaultCPM,
  };
}

/**
 * Return the TurnTime of the most recent anchor as a parsed object, or null.
 */

function getLastTimestampFromWTGData() {
  const anchor = getLastAnchorFromRVH();
  if (!anchor) return null;
  const tt = anchor.entry.scriptData?.wtg?.tt;
  if (tt && tt.match(new RegExp(`^${WTG_TURN_TIME_PATTERN}$`))) {
    return parseTurnTime(tt);
  }
  return null;
}


// ====================================================================================
// STORYCARD TIMESTAMP CLEANUP
// ====================================================================================

/**
 * Remove discovery timestamps from storycards that are in the future
 * relative to currentDate / currentTime.
 * @param {string} currentDate - Storage-format date ('MM/DD/YYYY').
 * @param {string} currentTime - Display-format time.
 */

function cleanupStoryCardsByTimestamp(currentDate, currentTime) {
  if (!currentDate || !currentTime || currentDate === '01/01/1900' || currentTime === 'Unknown') return;
  const currentDT = parseDateTime(currentDate, currentTime);
  if (!currentDT) return;

  for (let i = storyCards.length - 1; i >= 0; i--) {
    const card = storyCards[i];
    if (card.title === SYSTEM_CARD_TITLES.CURRENT_DATE_TIME || !card.entry) continue;
    const m = card.entry.match(new RegExp(`(?:Discovered on|Met on|Visited) (${WTG_DATE_PATTERN})\\s+(.+)`, 'i'));
      if (m) {
        const cardDT = parseDateTime(m[1], m[2]);
        if (cardDT && cardDT > currentDT) {
          card.entry = card.entry.replace(/\n\n(?:Discovered on|Met on|Visited) .+/, '');
        }
      }
    }
  }
  
  
  
  
  
  
  
  
  
  
  /**
   * Ensure output text starts with a leading space.
   * AI Dungeon renders responses more cleanly when they begin with a space.
   */
  function ensureLeadingSpace(text) {
    if (!text || typeof text !== 'string') return text;
    return text.charAt(0) === ' ' ? text : ' ' + text;
  }

  if (hook === 'input') {
    if (!getIsWTGEnabled()) {
        DuckieDebug.applyDebugLevel('Input Quick Exit');
        return {text};
      }
    
      ensureWTGReady();
    
      state.wtg.changed = state.wtg.changed || false;
    
      // ── REWIND / RETRY RECOVERY ───────────────────────────────────────────────
      // preInput has already trimmed state.rvh.history to the rewind target and set
      // playerAction.changeType, so getCurrentChangeType() is accurate here.
      // Restoring turnTime before handleCommands ensures any player command typed in
      // the same action operates on the correct post-rewind base rather than the
      // stale pre-rewind state.  Context performs the same detection for turns that
      // have no player command (continues, blank actions) and is safely idempotent
      // here because input.js will have written the command's anchor to
      // playerAction.scriptData — which getLastTimestampFromWTGData() finds first.
      const _changeType = RevampedHistory.getCurrentChangeType();
      if (_changeType === 'rewind' || _changeType === 'retry') {
        const t = state.wtg.time;
        let survivingTT = getLastTimestampFromWTGData();
        if (!survivingTT && _changeType === 'rewind') {
          rebuildRvhFromHistory();
          survivingTT = getLastTimestampFromWTGData();
        }
        t.turnTime = survivingTT || { years: 0, months: 0, days: 0, hours: 0, minutes: 0 };
        const { currentDate, currentEra, currentTime } = computeCurrent(
          t.start.date || '01/01/1900', t.start.time || 'Unknown', t.turnTime, t.start.era
        );
        t.current.date = currentDate;
        t.current.era  = currentEra;
        t.current.time = currentTime;
        state.wtg.changed = true;
      }
    
      const { text: modified, timeModified } = handleCommands(text, true, getPlayerCleanMode(), getPlayerMergeMode());
    
      if (timeModified && RevampedHistory.getPendingPlayerAction()) {
        const t = state.wtg.time;
        RevampedHistory.setPlayerScriptData('wtg', 'tt',  formatTurnTime(t.turnTime));
        RevampedHistory.setPlayerScriptData('wtg', 'tm',  getTimeMultiplier());
        RevampedHistory.setPlayerScriptData('wtg', 'cpm', getCharsPerMinute());
      }
    
      DuckieDebug.duckieDebug(`Reached end of Input`, DuckieDebug.duckieDebugMode.INFORM);
      return { text: modified };
  }

  if (hook === 'context') {
    if (!getIsWTGEnabled()) {
        DuckieDebug.applyDebugLevel('Context Quick Exit');
        return {text};
      }
    
      ensureWTGReady();
    
      const wtg = state.wtg;
      const t   = wtg.time;
    
      let modifiedText = text;
    
      // ── TIME ANCHOR ───────────────────────────────────────────────────────────
      // let (not const) — rewind detection may refresh these after cleanup.
      let {lastTT, charsAfter, found: markerFound, lastTM, lastCPM} = getLastTurnTimeAndChars();
      DuckieDebug.duckieDebug("Acquired last time anchor.", DuckieDebug.duckieDebugMode.INFORM);
    
      // ── REWIND / RETRY DETECTION ─────────────────────────────────────────────
      // Rewind: RVH already trimmed state.rvh.history in preInput, so
      //   getLastTimestampFromWTGData() naturally returns the surviving anchor.
      // Retry:  RVH popped the stale AI output entry in preContext, so the last
      //   anchor is now the player action's entry (if a command ran that turn) or
      //   an earlier turn's anchor — either way the AI's time advance is excluded.
      const _changeType = RevampedHistory.getCurrentChangeType();
      if (_changeType === 'rewind' || _changeType === 'retry') {
        DuckieDebug.duckieDebug(_changeType === 'rewind' ? "Rewind Detected." : "Retry Detected.", DuckieDebug.duckieDebugMode.INFORM);
        let survivingTT = getLastTimestampFromWTGData();
        if (!survivingTT && _changeType === 'rewind') {
          // Deep rewind only: no anchor survived the RVH trim. Rebuild from the
          // current AID history[], which always reflects the rewind target.
          rebuildRvhFromHistory();
          survivingTT = getLastTimestampFromWTGData();
        }
        t.turnTime    = survivingTT || {years:0, months:0, days:0, hours:0, minutes:0 };
        wtg.changed   = true;
        wtg.cmd.rewindRecovered = true;
        ({lastTT, charsAfter, found: markerFound, lastTM, lastCPM} = getLastTurnTimeAndChars());
      }
    
      // ── TIME RECALCULATION ────────────────────────────────────────────────────
      // Use the multiplier recorded in the anchor entry so that after a rewind the
      // time at the anchor point is recalculated faithfully. Falls back to the live
      // setting when no entries exist (lastTM is initialised from getTimeMultiplier()).
      const _mult = lastTM;
      const _cpm  = lastCPM;
    
      // If the player ran a command this turn, getLastTurnTimeAndChars() returns the
      // pending playerAction anchor — charsAfter will be 0, mins will be 0, and the
      // block below naturally produces no change. No skip flag needed.
      if (markerFound) {
        const mins = Math.floor((charsAfter / _cpm) * _mult);
        if (mins > 0) { t.turnTime = addToTurnTime(lastTT, {minutes: mins}); wtg.changed = true; }
        const {currentDate, currentEra, currentTime} = computeCurrent(
          t.start.date || '01/01/1900', t.start.time || 'Unknown', t.turnTime, t.start.era
        );
        t.current.date = currentDate; t.current.era = currentEra; t.current.time = currentTime;
      } else if (t.turnTime && t.start.time !== 'Unknown') {
        DuckieDebug.duckieDebug("Turn Time is Unknown.", DuckieDebug.duckieDebugMode.ERROR);
        const mins = Math.floor((charsAfter / _cpm) * _mult);
        if (mins > 0) {
          t.turnTime = addToTurnTime(t.turnTime, {minutes: mins});
          const {currentDate, currentEra, currentTime} = computeCurrent(
            t.start.date || '01/01/1900', t.start.time || 'Unknown', t.turnTime, t.start.era
          );
          t.current.date = currentDate; t.current.era = currentEra; t.current.time = currentTime;
          wtg.changed = true;
        }
      }
    
      // ── REGULAR CLEANUP ───────────────────────────────────────────────────────
      cleanupStoryCardsByTimestamp(t.current.date, t.current.time);
      DuckieDebug.duckieDebug("Cleaned Up Story Cards by Timestamp.", DuckieDebug.duckieDebugMode.INFORM);
    
      // ── LOCALIZATION CACHE ────────────────────────────────────────────────────
      // Build once per context call so all string lookups below are consistent.
      // Returns null when localization is disabled (all lookups fall back to English).
      const locEnabled = getEnableLocalization();
      const locCache = locEnabled ? buildLocCache() : null;
    
      // ── NORMAL MODE: AI FORMATTING INSTRUCTIONS ───────────────────────────────
      
    
      let instructions = [];
      const _playerCommandRanThisTurn = !!state.rvh?.playerAction?.scriptData?.wtg?.tt;
      if (getWTGBooleanSetting(DEFAULT_SETTINGS.enableDynamicTime.entry) && !isSleepCooldownActive() && !_playerCommandRanThisTurn) {
        instructions.push(getLocalizedString('Sleep Instruction',   LOC_DEFAULTS['Sleep Instruction'],   locCache));
      }
      if (getWTGBooleanSetting(DEFAULT_SETTINGS.enableDynamicTime.entry) && !isAdvanceCooldownActive() && !_playerCommandRanThisTurn) {
        instructions.push(getLocalizedString('Advance Instruction', LOC_DEFAULTS['Advance Instruction'], locCache));
      }
    
      if (getWTGBooleanSetting(DEFAULT_SETTINGS.enableGenCharCards.entry)) {
        instructions.push(getLocalizedString('Character Card Instruction', LOC_DEFAULTS['Character Card Instruction'], locCache));
      }
    
      if (getWTGBooleanSetting(DEFAULT_SETTINGS.enableGenLocCards.entry)) {
        instructions.push(getLocalizedString('Location Card Instruction', LOC_DEFAULTS['Location Card Instruction'], locCache));
      }
    
      // Add current date/time/day to context (only if settime has been initialized)
      {
        const c       = t.current;
        const era     = c.era || state.wtg.time.start.era || 'AD';
        const dateStr = c.date || '01/01/1900';
        const anParts = [];
    
        if (getANShowDate()) {
          let dateDisplay = formatDateForDisplay(dateStr, era, getANShowEra());
          if (getANShowDay()) {
            const day = getDayOfWeek(dateStr, era);
            if (day) dateDisplay += ` ${day}`;
          }
          const dateLabel = getLocalizedString('AN Date Label', LOC_DEFAULTS['AN Date Label'], locCache);
          anParts.push(`${dateLabel}: ${dateDisplay}`);
        } else if (getANShowEra()) {
          const eraLabel = getLocalizedString('AN Era Label', LOC_DEFAULTS['AN Era Label'], locCache);
          anParts.push(`${eraLabel}: ${era}`);
        }
    
        if (getANShowTime() && c.time !== 'Unknown') {
          const timeLabel = getLocalizedString('AN Time Label', LOC_DEFAULTS['AN Time Label'], locCache);
          anParts.push(`${timeLabel}: ${formatTimeForDisplay(c.time)}`);
        }
    
        if (getANShowPhase() && c.time && c.time !== 'Unknown') {
          const phase = getCurrentPhase(c.time);
          if (phase) {
            const phaseLabel = getLocalizedString('AN Phase Label', LOC_DEFAULTS['AN Phase Label'], locCache);
            anParts.push(`${phaseLabel}: ${phase}`);
          }
        }
    
        if (anParts.length > 0) instructions.push(anParts.join('; '));
      }
    
      let additionalAuthorsNote = "";
      if (instructions.length > 0) {
        additionalAuthorsNote = instructions.join('\n');
      }
    
      // Find the [Author's note: ...] section and inject the date/time info inside the [] if it exists, otherwise add one and insert it a paragraph back from the end of the text.
      const authorsNoteMatch = modifiedText.match(/\[Author's note:.*?\]/);
      if (authorsNoteMatch) {
        const fullMatch = authorsNoteMatch[0];
        const modifiedAuthorsNote = fullMatch.slice(0, -1) + `\n${additionalAuthorsNote}]`;
        modifiedText = modifiedText.replace(fullMatch, modifiedAuthorsNote);
      } else if (additionalAuthorsNote) {
        // Add a new [Author's note: ...] section with the date/time info a paragraph back from the end
        const paragraphs = modifiedText.split('\n\n');
        if (paragraphs.length > 3) {
          paragraphs.splice(paragraphs.length - 3, 0, `[Author's note: ${additionalAuthorsNote}]`);
          modifiedText = paragraphs.join('\n\n');
        } else {
          modifiedText += `\n\n[Author's note: ${additionalAuthorsNote}]`;
        }
      }
      DuckieDebug.duckieDebug(`Additional Author's Note: ${additionalAuthorsNote}`, DuckieDebug.duckieDebugMode.INFORM);
      DuckieDebug.duckieDebug(`Reached end of Context`, DuckieDebug.duckieDebugMode.INFORM);
      return {text: modifiedText};
  }

  if (hook === 'output') {
    if (!getIsWTGEnabled()) {
        DuckieDebug.applyDebugLevel('Output Quick Exit');
        return {text};
      }
      ensureWTGReady();
    
      const wtg = state.wtg;
      const t   = wtg.time;
    
      // ── current action type and last non-continue action ─────────────
      const currentAction = history.length > 0 ? history[history.length - 1] : null;
      const actionType    = (currentAction && (currentAction.type === "do" || currentAction.type === "say" || currentAction.type === "story"))
                            ? currentAction.type : "continue";
      let lastAction = null;
      for (let i = history.length - 1; i >= 0; i--) {
        const a = history[i];
        if (a.type === "do" || a.type === "say" || a.type === "story") { lastAction = a; break; }
      }
      if(lastAction) DuckieDebug.duckieDebug(`Got Last Action: ${lastAction.type}`, DuckieDebug.duckieDebugMode.INFORM)
    
      const entityEnabled = getIsGeneratedCharacterCardsEnabled() || getIsGeneratedLocationCardsEnabled();
      const aiCleanMode = getAICommandNudge() ? getPlayerCleanMode() : 'full';
      const aiMergeMode = getAICommandNudge() ? getPlayerMergeMode() : 'none';
      const locCache = getEnableLocalization() ? buildLocCache() : null;
    
      let modifiedText = text;
      let _commandAdvanced = false;
      if (getIsDynamicTimeEnabled() || entityEnabled) {
        ({ text: modifiedText, timeModified: _commandAdvanced } =
          handleCommands(modifiedText, false, aiCleanMode, aiMergeMode, locCache));
      }
    
      // ── Strip any legacy [[turntime]] markers the AI may echo from old history ─
      modifiedText = modifiedText.replace(/\s*\[\[\d+y\d{2}m\d{2}d\d{2}h\d{2}n\d{2}s\]\]/g, '').trim();
    
      // ── SHARED: record turn data ──────────────────────────────────────────────
      // Write anchor into the pending aiAction scriptData when:
      //   (a) a sleep/advance command just ran,
      //   (b) we just recovered from a rewind (re-anchor the recalculated time),
      //   (c) the player changed the time multiplier since the last anchor, or
      //   (d) no anchor has been recorded in the last 80 RVH entries (fallback).
      // rvh postOutput (called after this) commits aiAction.scriptData into history.
      {
        const _currentMult = getTimeMultiplier();
        const _currentCPM  = getCharsPerMinute();
        const _anchor      = getLastAnchorFromRVH();
        const _anchorSD    = _anchor?.entry?.scriptData?.wtg;
    
        const _rewindRecovered   = !!wtg.cmd.rewindRecovered;
        const _multiplierChanged = typeof _anchorSD?.tm === 'number' && _anchorSD.tm !== _currentMult;
        const _cpmChanged        = _anchorSD !== undefined
                                   && typeof _anchorSD.cpm === 'number'
                                   && _anchorSD.cpm !== _currentCPM;
        const _entriesSinceAnchor = _anchor
                                   ? (_anchor.pending ? 0 : RevampedHistory.getHistoryLength() - _anchor.index - 1)
                                   : Infinity;
        const _fallbackNeeded    = _entriesSinceAnchor > 80;
    
        if (_commandAdvanced || _rewindRecovered || _multiplierChanged || _cpmChanged || _fallbackNeeded) {
          if (RevampedHistory.getPendingAIAction()) {
            RevampedHistory.setAiScriptData('wtg', 'tt',  formatTurnTime(t.turnTime));
            RevampedHistory.setAiScriptData('wtg', 'tm',  _currentMult);
            RevampedHistory.setAiScriptData('wtg', 'cpm', _currentCPM);
          }
        }
        if (_rewindRecovered) wtg.cmd.rewindRecovered = false;
      }
      DuckieDebug.duckieDebug(`Recorded Turn Data`, DuckieDebug.duckieDebugMode.INFORM);
    
      // ── SHARED: timestamp injection for existing storycards ───────────────────
    
      const combinedText = (lastAction ? lastAction.text : '') + ' ' + modifiedText;
      const excludedTypes = getExcludedCardTypes();
      let regexChecks = 0;
      for (let i = 0; i < storyCards.length && regexChecks < MAX_STORYCARDS_TO_PROCESS; i++) {
        const card = storyCards[i];
        if (!card || !card.entry ||
          Object.values(SYSTEM_CARD_TITLES).includes(card.title) ||
          hasTimestamp(card)) continue;
        if (processExclusionMarker(card)) continue;
        if (excludedTypes.length > 0 && card.type && excludedTypes.includes(card.type.toLowerCase())) continue;
        regexChecks++;
        if (isCardKeywordMentioned(card, combinedText)) {
          addTimestampToCard(card, getCurrentTimestampDisplay());
        }
      }
      DuckieDebug.duckieDebug(`Inserted Timestamps for SCs`, DuckieDebug.duckieDebugMode.INFORM);
    
      // ── SHARED: persist state ─────────────────────────────────────────────────
      if (wtg.changed || info.actionCount === 1 || info.actionCount % 5 === 0) {
        updateDateTimeCard();
        wtg.changed = false;
      }
    
      wtg.cmd.rewindRecovered = false;
    
      // Safety net: stripping time commands or parens should never produce empty
      // output — fall back to the original AI text rather than cause an error.
      if (!modifiedText || !modifiedText.trim()) modifiedText = text;
    
      DuckieDebug.duckieDebug(`Reached end of Output`, DuckieDebug.duckieDebugMode.INFORM);
      return { text: ensureLeadingSpace(modifiedText) };
  }

  if (hook === 'preInput') {
    wtgPrehook();
  }

  if (hook === 'preContext') {
    wtgPrehook();
  }

  if (hook === 'preOutput') {
    wtgPrehook();
  }
}
