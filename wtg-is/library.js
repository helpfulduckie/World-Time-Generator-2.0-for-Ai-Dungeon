// ============================================================
// ==== World Time Generator + Inner Self - 3.0.4 - library ===
// ============================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.3
// - RevampedHistory@1.2.2
// - WorldTimeGenerator@3.0.4
// - InnerSelf@1.0.2
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

function innerSelf(hook, text) {
  const AUTO_CARD_TYPE = 'Auto-Card Generated';
  const SETTING = 'zz_Settings';
  
  /**
   * Main control panel for scenario creator convenience
   * Settings defined here will override their counterparts elsewhere
   * Most AC and Inner Self settings are included
   * Safe to delete
   */
  globalThis.MainSettings = (class MainSettings {
  
      //—————————————————————————————————————————————————————————————————————————————————
  
      /**
       * Inner Self v1.0.2
       * Made by LewdLeah on January 3, 2026
       * Gives story characters the ability to learn, plan, and adapt over time
       * Inner Self is free and open-source for anyone! ❤️
       */
      static InnerSelf = {
      // Default settings for scenario creators to modify:
  
      // List the first name of every scenario NPC whose brain should be simulated by Inner Self:
      IMPORTANT_SCENARIO_CHARACTERS: ""
      // (write a comma separated list of names inside the "" like so: "Leah, Lily, Lydia")
      ,
      // Is Inner Self already enabled when the adventure begins?
      IS_INNER_SELF_ENABLED_BY_DEFAULT: true
      // (true or false)
      ,
      // Is the player character's first name known in advance? Ignore this setting if unsure
      PREDETERMINED_PLAYER_CHARACTER_NAME: ""
      // (any name inside the "" or leave empty)
      ,
      // Is the adventure intended for 1st, 2nd, or 3rd person gameplay?
      FIRST_SECOND_OR_THIRD_PERSON_POV: 2
      // (1, 2, or 3)
      ,
      // What (maximum) percentage of "Recent Story" context should be repurposed for NPC brains?
      PERCENTAGE_OF_RECENT_STORY_USED_FOR_BRAINS: 30
      // (1 to 95)
      ,
      // How many actions back should Inner Self look for character name triggers?
      NUMBER_OF_ACTIONS_TO_LOOK_BACK_FOR_TRIGGERS: 5
      // (1 to 250)
      ,
      // Symbol used to visually display which NPC brain is currently triggered?
      ACTIVE_CHARACTERS_VISUAL_INDICATOR_SYMBOL: "🎭"
      // (any text/emoji inside the "" or leave empty)
      ,
      // When possible, what percentage of turns should involve an attempt to form a new thought?
      THOUGHT_FORMATION_CHANCE_PER_TURN: 60
      // (0 to 100)
      ,
      // Is the thought formation chance reduced by half during Do/Say/Story turns?
      IS_THOUGHT_CHANCE_HALF_FOR_DO_SAY_STORY: true
      // (true or false)
      ,
      // Is valid JSON shown and expected in brain card notes? Otherwise use a human-readable format
      IS_JSON_FORMAT_USED_FOR_BRAIN_CARD_NOTES: false
      // (true or false)
      ,
      // Should Inner Self model task outputs be displayed inline with the adventure text itself?
      IS_DEBUG_MODE_ENABLED_BY_DEFAULT: false
      // (true or false)
      ,
      // Is the "Configure Inner Self" story card pinned near the top of the in-game list?
      IS_CONFIG_CARD_PINNED_BY_DEFAULT: false
      // (true or false)
      ,
      // Is AC already enabled when the adventure begins?
      IS_AC_ENABLED_BY_DEFAULT: false
      // (true or false)
      ,
      }; //——————————————————————————————————————————————————————————————————————————————
  
      /**
       * AC v1.1.3
       * Made by LewdLeah on May 21, 2025
       * This AI Dungeon script automatically creates and updates plot-relevant story cards while you play
       * General-purpose usefulness and compatibility with other scenarios/scripts were my design priorities
       * AC is fully open-source, please copy for use within your own projects! ❤️
       */
      static AC = {
      // Is AC already enabled when the adventure begins?
      DEFAULT_DO_AC: true
      // (true or false)
      ,
      // Pin the "Configure Auto-Cards" story card at the top of the player's story cards list?
      DEFAULT_PIN_CONFIGURE_CARD: false
      // (true or false)
      ,
      // Minimum number of turns in between automatic card generation events?
      DEFAULT_CARD_CREATION_COOLDOWN: 40
      // (0 to 9999)
      ,
      // Use a bulleted list format for newly generated card entries?
      DEFAULT_USE_BULLETED_LIST_MODE: true
      // (true or false)
      ,
      // Maximum allowed length for newly generated story card entries?
      DEFAULT_GENERATED_ENTRY_LIMIT: 600
      // (200 to 2000)
      ,
      // Do newly generated cards have memory updates enabled by default?
      DEFAULT_NEW_CARDS_DO_MEMORY_UPDATES: false
      // (true or false)
      ,
      // Default character limit before the card's memory bank is summarized?
      DEFAULT_NEW_CARDS_MEMORY_LIMIT: 3200
      // (1750 to 9900)
      ,
      // Approximately how much shorter should recently compressed memories be? (ratio = 10 * old / new)
      DEFAULT_MEMORY_COMPRESSION_RATIO: 25
      // (20 to 1250)
      ,
      // Ignore all-caps during title candidate detection?
      DEFAULT_IGNORE_ALL_CAPS_TITLES: true
      // (true or false)
      ,
      // Should player input actions (Do/Say/Story) be considered during title detection?
      DEFAULT_DETECT_TITLES_FROM_INPUTS: false
      // (true or false)
      ,
      // How many (minimum) actions in the past does Auto-Cards look for named entities?
      DEFAULT_MINIMUM_LOOK_BACK_DISTANCE: 7
      // (2 to 88)
      ,
      // Is Live Script Interface v2 enabled?
      DEFAULT_DO_LSI_V2: false
      // (true or false)
      ,
      // Should the "Debug Data" story card be visible?
      DEFAULT_SHOW_DEBUG_DATA: false
      // (true or false)
      ,
      // AI prompt used to generate new story card entries?
      DEFAULT_CARD_GENERATION_PROMPT: [
          "-----",
          "",
          "<SYSTEM>",
          "# Stop the story and ignore previous instructions. Write a brief and coherent informational entry for %{title} following these instructions:",
          "- Write only third-person pure prose information about %{title} using complete sentences with correct punctuation",
          "- Avoid short-term temporary details or appearances, instead focus on plot-significant information",
          "- Prioritize story-relevant details about %{title} first to ensure seamless integration with the previous plot",
          "- Create new information based on the context and story direction",
          "- Mention %{title} in every sentence",
          "- Use semicolons if needed",
          "- Add additional details about %{title} beneath incomplete entries",
          "- Be concise and grounded",
          "- Imitate the story's writing style and infer the reader's preferences",
          "</SYSTEM>",
          "Continue the entry for %{title} below while avoiding repetition:",
          "%{entry}"
      ] // (mimic this multi-line "text" format)
      ,
      // AI prompt used to summarize a given story card's memory bank?
      DEFAULT_CARD_MEMORY_COMPRESSION_PROMPT: [
          "-----",
          "",
          "<SYSTEM>",
          "# Stop the story and ignore previous instructions. Summarize and condense the given paragraph into a narrow and focused memory passage while following these guidelines:",
          "- Ensure the passage retains the core meaning and most essential details",
          "- Use the third-person perspective",
          "- Prioritize information-density, accuracy, and completeness",
          "- Remain brief and concise",
          "- Write firmly in the past tense",
          "- The paragraph below pertains to old events from far earlier in the story",
          "- Integrate %{title} naturally within the memory; however, only write about the events as they occurred",
          "- Only reference information present inside the paragraph itself, be specific",
          "</SYSTEM>",
          "Write a summarized old memory passage for %{title} based only on the following paragraph:",
          "\"\"\"",
          "%{memory}",
          "\"\"\"",
          "Summarize below:"
      ] // (mimic this multi-line "text" format)
      ,
      // Titles banned from future card generation attempts?
      DEFAULT_BANNED_TITLES_LIST: (
          "North, East, South, West, Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, January, February, March, April, May, June, July, August, September, October, November, December"
      ) // (mimic this comma-list "text" format)
      ,
      // Default story card "type" used by Auto-Cards? (does not matter)
      DEFAULT_CARD_TYPE: "class"
      // ("text")
      ,
      // Should titles mentioned in the "opening" plot component be banned from future card generation by default?
      DEFAULT_BAN_TITLES_FROM_OPENING: false
      // (true or false)
      ,
      }; //——————————————————————————————————————————————————————————————————————————————
  
      #config;
      constructor(script, alternative) {
          this.#config = (
              MainSettings.hasOwnProperty(script)
              ? MainSettings[script]
              : ((typeof alternative === "string") && MainSettings.hasOwnProperty(alternative))
              ? MainSettings[alternative]
              : null
          );
          return this;
      }
      merge(settings) {
          if (!this.#config || !settings || (typeof settings !== "object")) {
              return;
          }
          for (const [key, value] of Object.entries(this.#config)) {
              settings[key] = value;
          }
          return;
      }
  });
  
  //—————————————————————————————————————————————————————————————————————————————————————
  
  /**
   * Inner Self v1.0.2
   * Made by LewdLeah on January 3, 2026
   * Gives story characters the ability to learn, plan, and adapt over time
   * Inner Self is free and open-source for anyone! ❤️
   */
  function InnerSelf(hook) {
      "use strict";
      /**
       * Scenario-level default settings
       * Creators modify these before publishing
       * Players modify these in-game via the config card
       */
      const S = {
      // Default settings for scenario creators to modify:
  
      // List the first name of every scenario NPC whose brain should be simulated by Inner Self:
      IMPORTANT_SCENARIO_CHARACTERS: ""
      // (write a comma separated list of names inside the "" like so: "Leah, Lily, Lydia")
      ,
      // Is Inner Self already enabled when the adventure begins?
      IS_INNER_SELF_ENABLED_BY_DEFAULT: true
      // (true or false)
      ,
      // Is the player character's first name known in advance? Ignore this setting if unsure
      PREDETERMINED_PLAYER_CHARACTER_NAME: ""
      // (any name inside the "" or leave empty)
      ,
      // Is the adventure intended for 1st, 2nd, or 3rd person gameplay?
      FIRST_SECOND_OR_THIRD_PERSON_POV: 2
      // (1, 2, or 3)
      ,
      // What (maximum) percentage of "Recent Story" context should be repurposed for NPC brains?
      PERCENTAGE_OF_RECENT_STORY_USED_FOR_BRAINS: 30
      // (1 to 95)
      ,
      // How many actions back should Inner Self look for character name triggers?
      NUMBER_OF_ACTIONS_TO_LOOK_BACK_FOR_TRIGGERS: 5
      // (1 to 250)
      ,
      // Symbol used to visually display which NPC brain is currently triggered?
      ACTIVE_CHARACTERS_VISUAL_INDICATOR_SYMBOL: "🎭"
      // (any text/emoji inside the "" or leave empty)
      ,
      // When possible, what percentage of turns should involve an attempt to form a new thought?
      THOUGHT_FORMATION_CHANCE_PER_TURN: 60
      // (0 to 100)
      ,
      // Is the thought formation chance reduced by half during Do/Say/Story turns?
      IS_THOUGHT_CHANCE_HALF_FOR_DO_SAY_STORY: true
      // (true or false)
      ,
      // Is valid JSON shown and expected in brain card notes? Otherwise use a human-readable format
      IS_JSON_FORMAT_USED_FOR_BRAIN_CARD_NOTES: false
      // (true or false)
      ,
      // Should Inner Self model task outputs be displayed inline with the adventure text itself?
      IS_DEBUG_MODE_ENABLED_BY_DEFAULT: false
      // (true or false)
      ,
      // Is the "Configure Inner Self" story card pinned near the top of the in-game list?
      IS_CONFIG_CARD_PINNED_BY_DEFAULT: false
      // (true or false)
      ,
      // Is AC already enabled when the adventure begins?
      IS_AC_ENABLED_BY_DEFAULT: false
      // (true or false)
      ,
      }; //——————————————————————————————————————————————————————————————————————————————
  
      const version = "v1.0.2";
      // Validate that all required AI Dungeon global properties exist
      // Without these, Inner Self literally cannot function
      if (
          !globalThis.state || (typeof state !== "object") || Array.isArray(state)
          || !globalThis.info || (typeof info !== "object") || Array.isArray(info)
          || !Array.isArray(globalThis.storyCards)
          || (typeof addStoryCard !== "function")
          || !Array.isArray(globalThis.history)
          || (typeof text !== "string")
      ) {
          // Something is seriously broken in AID
          log("unexpected error");
          globalThis.text ||= " ";
          return;
      }
      /**
       * Recursively merges source object into target object
       * Only copies properties that are undefined in target
       * Nested objects get their own recursive treatment
       * @param {Object} target - The object to merge into
       * @param {Object} source - The object to merge from
       * @returns {Object} The mutated target object
       */
      const deepMerge = (target = {}, source = {}) => {
          // Walk through every key in the source
          for (const key in source) {
              // Source value is a nested object, so recurse
              if (source[key] && (typeof source[key] === "object") && !Array.isArray(source[key])) {
                  if (!target[key] || (typeof target[key] !== "object")) {
                      // Target doesn't have this key or it's not an object
                      target[key] = {};
                  }
                  deepMerge(target[key], source[key]);
              } else if (target[key] === undefined) {
                  // Only copy if target doesn't already have this key
                  target[key] = source[key];
              }
          }
          return target;
      };
      /**
       * Persistent state of Inner Self stored in the adventure's state object
       * This survives across turns
       * @type {Object}
       */
      const IS = state.InnerSelf = deepMerge(state.InnerSelf || {}, {
          // Zero-width encoded thought labels for context injection
          encoding: "",
          // Currently triggered agent name (empty string = none)
          agent: "",
          // Monotonically increasing thought label counter
          label: 0,
          // Hash of recent history to detect retry or erase + continue turns
          hash: "",
          // Total number of brain operations performed across all agents
          ops: 0,
          // Auto-Cards integration state
          AC: {
              // This helps avoid calling AC API functions more than necessary
              enabled: false,
              // External use of the AC API force-installs so it just works
              forced: false,
              // NGL this one didn't need to be stateful but I didn't feel like declaring a local so whatevs
              // Basically AC sets this to true when it does stuff, so Inner Self can inhibit itself
              event: false
          }
      });
      /**
       * Checks if Auto-Cards is available in the global scope
       * @returns {boolean} true if Auto-Cards is installed and callable
       */
      const hasAutoCards = () => (typeof globalThis.AutoCards === "function");
      const u = "qm`x/`hetofdno/bnl.qsnghmd.MdveMd`i".replace(/./g, c => String.fromCharCode(c.charCodeAt()^1));
    if (IS.AC.enabled && (typeof hook === "string") && (hook !== "context") && hasAutoCards()) {
        // Delegate to Auto-Cards for non-context hooks when enabled
        try {
            text = AutoCards(hook, text);
        } catch (error) {
            log(error.message);
        }
    }
    /**
     * Generates a simple hashcode of the last 50 actions in history
     * Used to detect retry or erase + continue turns
     * @returns {string} Hexadecimal hash string
     */
    const historyHash = () => {
        let n = 0;
        // Grab the last 50 actions and stringify them
        const serialized = JSON.stringify(history.slice(-50));
        for (let i = 0; i < serialized.length; i++) {
            // Classic polynomial rolling hash, nothing fancy
            n = ((31 * n) + serialized.charCodeAt(i)) | 0;
        }
        return n.toString(16);
    };
    /**
     * Safely parses a JSON string into an object
     * Optionally attempts to repair malformed JSON by extracting quoted content
     * Basically I use repair mode for cute little smooth brains UwU
     * @param {string} str - The string to parse
     * @param {boolean} repair - Whether to attempt repair on malformed JSON
     * @returns {Object} Parsed object or empty object on failure
     */
    const deserialize = (str = "", repair = false) => {
        try {
            const parsed = JSON.parse(repair ? (() => {
                // All values will be strings I promise
                // Find the first and last quote chars
                const first = str.indexOf("\"");
                const last = str.lastIndexOf("\"");
                return (
                    ((first === -1) || (last === -1) || (last <= first))
                    ? "{}" : `{${str.slice(first, last + 1)}}`
                );
            })() : str);
            if (parsed && (typeof parsed === "object") && !Array.isArray(parsed)) {
                // Only return a proper object (not null, not array)
                return parsed;
            }
        } catch {}
        // That empty catch looks so dumb lol
        return {};
    };
    /**
     * Validated config settings for Inner Self
     * Default settings are specified by creators at the scenario level
     * Runtime settings are specified by players at the adventure level
     * @typedef {Object} config
     * @property {Object|null} card - Config card object reference
     * @property {boolean} allow - Is Inner Self enabled?
     * @property {string} player - The player character's name
     * @property {number} pov - Is the adventure in 1st, 2nd, or 3rd person?
     * @property {boolean} guide - Show a detailed guide
     * @property {number} percent - Default percentage of Recent Story context length reserved for agent brains
     * @property {number} distance - Number of previous actions to look back for agent name triggers
     * @property {string} indicator - The visual indicator symbol used to display active brains
     * @property {number} chance - Likelihood of performing a standard thought formation task each turn
     * @property {boolean} half - Is the thought formation chance reduced by half during Do/Say/Story turns?
     * @property {boolean} json - Is raw JSON syntax used to serialize NPC brains in their card notes?
     * @property {boolean} debug - Is debug mode enabled for inline task output visibility?
     * @property {boolean} pin - Is the config card pinned near the top of the list?
     * @property {boolean} auto - Is Auto-Cards enabled?
     * @property {string[]} agents - All agent names, ordered from highest to lowest trigger priority
     */
    /**
     * Config class - Manages the Inner Self configuration card
     * Handles building, finding, parsing, and validating all settings
     * @class
     */
    class Config {
        /**
         * Build or find the Inner Self config card
         * Returns the card reference and all parsed settings
         * This is the heart of the config system
         * @param {Set<string>} [pending] - Recursion aid for tracking pending agents
         * @returns {config} The complete validated configuration object
         */
        static get(pending = new Set()) {
        // Allow MainSettings mod to override local defaults
        if (typeof globalThis.MainSettings === "function") {
            new MainSettings("InnerSelf", "IS").merge(S);
        }
        /**
         * Fallback values when settings are missing or invalid
         * Frozen because I hate accidental mutations
         * @type {config}
         */
        const fallback = Object.freeze({
            allow: true,
            guide: false,
            player: "",
            pov: 2,
            percent: 30,
            distance: 5,
            indicator: "🎭",
            chance: 60,
            half: true,
            json: false,
            debug: false,
            pin: false,
            auto: false,
            agents: []
        });
        /** @type {config} */
        const config = { card: null };
        /**
         * Strips a string down to lowercase letters only
         * Used for fuzzy matching of setting names
         * @param {string} s - Input string
         * @returns {string} Simplified string
         */
        const simplify = (s = "") => s.toLowerCase().replace(/[^a-z]+/g, "");
        /**
         * Cleans up an agent name by removing commas and zero-width chars
         * Also normalizes whitespace because players are messy ;P
         * @param {string} agent - Raw agent name
         * @returns {string} Cleaned agent name
         */
        const cleanAgent = (agent = "") => agent.replace(/[,\u200B-\u200D]+/g, "").trim().replace(/\s+/g, " ");
        /**
         * Factory function that creates builder/setter pairs for config fields
         * Handles both boolean and integer settings with validation
         * This makes me NOT want to die every time I need to add a new setting
         * @param {string} key - Config property name
         * @param {*} setting - Default value from scenario settings
         * @param {Object} int - Integer constraints (lower, upper, suffix)
         * @returns {Object} Object with builder and setter functions
         */
        const factory = (key = "", setting = null, int = null) => ({
            // Builds the display string for the config card entry
            builder: (cfg = {}) => ` ${config[key] ?? cfg.setter?.(setting)}${(
                  // Fancy suffix or boring suffix
                  (typeof int?.suffix === "function") ? int.suffix() : int?.suffix ?? ""
              )}`,
            // Parses and validates a value, storing it in config
            setter: (value = null, fallible = false) => {
                // Helper to clamp integers within bounds
                const bound = (val = 20) => Math.min(Math.max(int?.lower ?? 1, val), int?.upper ?? 95);
                if ((typeof value === "boolean") && !int) {
                    // Boolean setting with a boolean value (easy case)
                    config[key] = value;
                } else if (Number.isInteger(value) && int) {
                    // Integer setting with an integer value (also easy)
                    config[key] = bound(value);
                } else if (typeof value !== "string") {
                    // Non-string non-matching type, use fallback unless fallible
                    if (fallible) {
                        return;
                    }
                    config[key] = fallback[key];
                } else if (int) {
                    // Parse integer from string, stripping decimals and non-digits
                    value = value.split(/[./]/, 1)[0].replace(/[^\d]+/g, "");
                    if (value !== "") {
                        config[key] = bound(parseInt(value, 10));
                    } else if (!fallible) {
                        config[key] = bound(fallback[key]);
                    }
                } else {
                    // Parse boolean from string with synonym support
                    value = simplify(value);
                    if (["true", "t", "yes", "y", "on", "1", "enable", "enabled"].includes(value)) {
                        config[key] = true;
                    } else if (["false", "f", "no", "n", "off", "0", "disable", "disabled"].includes(value)) {
                        config[key] = false;
                    } else if (!fallible) {
                        config[key] = fallback[key];
                    }
                }
                return config[key];
            }
        });
        /**
         * Template for building the Inner Self config card
         * Contains all the user-facing text and settings
         * @type {Object}
         */
        const template = {
            type: SETTING,
            title: "Configure \nInner Self",
            // The config card entry contains the main settings
            entry: [
                {
                    message: "Inner Self grants story characters the ability to learn, plan, and adapt over time. Edit the entry and notes below to control how Inner Self behaves."
                },
                { message: "Enable Inner Self:", ...factory(
                    "allow", S.IS_INNER_SELF_ENABLED_BY_DEFAULT
                ) },
                {
                    message: "Show detailed guide:",
                    builder: (cfg = {}) => ` ${(
                          ((hook === "context") || Number.isInteger(info.maxChars))
                          ? config.guide ?? cfg.setter?.(false)
                          : false
                      )}`,
                    setter: factory("guide", false).setter
                },
                {
                    message: "First name of player character:",
                    builder: (cfg = {}) => ` "${config.player || (() => {
                          const display = cfg.setter?.(S.PREDETERMINED_PLAYER_CHARACTER_NAME);
                          if (config.player === "") {
                              config.player = "the protagonist";
                          }
                          return display;
                      })()}"`,
                    setter: (value = null, fallible = false) => {
                        const example = "Example";
                        if (typeof value === "string") {
                            config.player = value.replaceAll("\"", "").replace(example, "").trim();
                        } else if (fallible) {
                            return;
                        } else {
                            config.player = fallback.player;
                        }
                        return config.player || example;
                    }
                },
                { message: "Adventure in 1st, 2nd, or 3rd person:", ...factory(
                    "pov", S.FIRST_SECOND_OR_THIRD_PERSON_POV,
                    { lower: 1, upper: 3, suffix: () => ["st", "nd", "rd"][config.pov - 1] ?? "" }
                ) },
                { message: "Max brain size relative to story context:", ...factory(
                    "percent", S.PERCENTAGE_OF_RECENT_STORY_USED_FOR_BRAINS,
                    { lower: 1, upper: 95, suffix: "%" }
                ) },
                { message: "Recent turns searched for name triggers:", ...factory(
                    "distance", S.NUMBER_OF_ACTIONS_TO_LOOK_BACK_FOR_TRIGGERS,
                    { lower: 1, upper: 250 }
                ) },
                {
                    message: "Visual indicator of current NPC triggers:",
                    builder: (cfg = {}) => ` "${(
                          config.indicator ?? cfg.setter?.(S.ACTIVE_CHARACTERS_VISUAL_INDICATOR_SYMBOL)
                      )}"`,
                    setter: (value = null, fallible = false) => (
                        (typeof value === "string")
                        ? (config.indicator = value.replace(/["\u200B-\u200D]+/g, "").trim())
                        : (fallible)
                        ? null
                        : (config.indicator = fallback.indicator)
                    )
                },
                { message: "Thought formation chance per turn:", ...factory(
                    "chance", S.THOUGHT_FORMATION_CHANCE_PER_TURN,
                    { lower: 0, upper: 100, suffix: "%" }
                ) },
                { message: "Half thought chance for Do/Say/Story:", ...factory(
                    "half", S.IS_THOUGHT_CHANCE_HALF_FOR_DO_SAY_STORY
                ) },
                { message: "Brain card notes store brains as JSON:", ...factory(
                    "json", S.IS_JSON_FORMAT_USED_FOR_BRAIN_CARD_NOTES
                ) },
                { message: "Enable debug mode to see model tasks:", ...factory(
                    "debug", S.IS_DEBUG_MODE_ENABLED_BY_DEFAULT
                ) },
                { message: "Pin this config card near the top:", ...factory(
                    "pin", S.IS_CONFIG_CARD_PINNED_BY_DEFAULT
                ) },
                { message: "Install Auto-Cards:", ...factory(
                    "auto", S.IS_AC_ENABLED_BY_DEFAULT
                ) },
                {
                    message: "Write the name(s) of your non-player characters at the very bottom of the \"notes\" section below. This is mandatory because it allows Inner Self to assemble independent minds for the correct individuals."
                }
            ],
            // Description section contains info and agent list
            description: [
                {
                    message: "Please visit my profile @LewdLeah through the link above and read my bio for simple steps to add Inner Self to your own scenarios! ❤️"
                },
                {
                    message: `Inner Self ${version} is an open-source and general-purpose AI Dungeon mod by LewdLeah. You have my full permission to use it with any scenario!`
                },
                {
                    // This is where players list their NPCs
                    message: "Write the first name of every intelligent story character on separate lines below, listed from highest to lowest trigger priority:",
                    builder: (cfg = {}) => ["", "", ...(
                        config.agents ?? cfg.setter?.(S.IMPORTANT_SCENARIO_CHARACTERS)
                    ), ""].join("\n"),
                    setter: (value = null, fallible = false) => {
                        // Accept string (from card) or array (from code)
                        if (typeof value === "string") {
                            config.agents = value.split(/[,\n]/);
                        } else if (Array.isArray(value)) {
                            config.agents = value.filter(agent => (typeof agent === "string"));
                        } else if (fallible) {
                            return;
                        } else {
                            return (config.agents = [...fallback.agents]);
                        }
                        // Clean, deduplicate, and remove empties
                        return (config.agents = [...new Set(config.agents
                            .map(agent => cleanAgent(agent))
                            .filter(agent => (agent !== ""))
                        )]);
                    }
                }
            ]
        };
        // Track discovered agents to avoid duplicates
        const agents = new Set();
        // Simplified title for fuzzy matching
        const target = simplify(template.title);
        // Scan all story cards in reverse order
        // Looking for config cards, agent cards, and duplicates (remove the latter in-place)
        for (let i = storyCards.length - 1; -1 < i; i--) {
            const card = storyCards[i];
            if (!card || (typeof card !== "object") || Array.isArray(card)) {
                // Remove invalid cards (null, non-objects, arrays)
                // If this ever happens in a real situation, I will cry
                storyCards.splice(i, 1);
            } else if ((typeof card.keys === "string") && card.keys.includes("\"agent\"")) {
                // This card has agent metadata, extract and validate it
                const metadata = deserialize(card.keys);
                if (typeof metadata.agent === "string") {
                    metadata.agent = cleanAgent(metadata.agent);
                    if (metadata.agent !== "") {
                        if (!agents.has(metadata.agent)) {
                            // First time seeing this brain card
                            agents.add(metadata.agent);
                            card.keys = JSON.stringify(metadata);
                            continue;
                        } else if (typeof card.title === "string") {
                            // Duplicate brain card, mark it as a copy
                            card.title = card.title.trim();
                            card.title = `Copy of ${(card.title === "") ? "Agent" : card.title}`;
                        }
                    }
                }
                // Invalid agent metadata, clear it
                card.keys = "";
            } else if ((typeof card.title !== "string") || (100 < card.title.length)) {
                // Skip cards with missing or absurdly long titles
                continue;
            } else if (card.title.startsWith("@") && !card.title.includes("figure")) {
                // Cards starting with @ are shorthand for adding agents
                const agent = cleanAgent(card.title.replace(/^[@\s]*/, ""));
                if (agent !== "") {
                    card.title = agent;
                    pending.add(agent);
                }
            } else if ((() => {
                // Fuzzy matching to find the config card even if title is slightly mangled
                // Because players gonna player and typos happen
                const current = simplify(card.title);
                const maxMistakes = 2;
                let mistakes = 0;
                // Target index (expected title)
                let t = 0;
                // Current index (actual title)
                let c = 0;
                while ((t < target.length) && (c < current.length)) {
                    if (current[c] === target[t]) {
                        // Chars match, advance both
                        t++; c++;
                        continue;
                    } else if (maxMistakes <= mistakes) {
                        // Too many mistakes, this isn't the config card (I hope)
                        return true;
                    }
                    // Allow for insertions, deletions, or substitutions
                    mistakes++;
                    (current[c + 1] === target[t])
                    ? c++
                    : (current[c] === target[t + 1])
                    ? t++
                    : (t++, c++)
                }
                // Count leftover chars as mistakes
                mistakes += (target.length - t) + (current.length - c);
                // This is basically bargain bin levenshtein distance but less costly
                return (maxMistakes < mistakes);
            })()) {
                // Title didn't match the fuzzy search
                continue;
            } else if (config.card === null) {
                // Found the config card
                config.card = card;
            } else if (typeof removeStoryCard === "function") {
                // Duplicate config card, remove it properly the way Latitude intended
                // (I know it's just a wrapper for splice, but that may change one day lol)
                removeStoryCard(i);
            } else {
                // Fallback removal for duplicate config cards
                storyCards.splice(i, 1);
            }
        }
        /**
         * Builds a formatted string from template sections
         * @param {Array} source - Array of config message objects
         * @param {string} delimiter - String to join sections with
         * @returns {string} Formatted config text
         */
        const build = (source = [], delimiter = "\n\n") => (source
            .map(cfg => `> ${cfg.message}${cfg.builder?.(cfg) ?? ""}`)
            .join(delimiter)
        );
        if (config.card === null) {
            // If no config card exists, create one and recurse
            addStoryCard(u,
                build(template.entry, "\n"),
                template.type,
                template.title,
                build(template.description, "\n\n")
            );
            // Recurse to parse the newly created card
            return Config.get(pending);
        }
        // Parse existing card content to extract user-modified settings
        // This is where IS reads back what the player has configured
        // Abomination :3
        ["entry", "description"].map(source => [source, (
            (typeof config.card[source] === "string")
            // Split on >, filter for lines with colons, extract key-value pairs
            ? Object.fromEntries((config.card[source]
                .split(/\s*>[\s>]*/)
                .filter(block => block.includes(":"))
                .map(block => block.split(/\s*:[\s:]*/, 2))
            ).map(pair => [simplify(pair[0]), pair[1].trimEnd()])) : {}
        )]).forEach(([source, extractive]) => template[source].forEach(cfg => (
            // Try to set each config value from extracted content (fallible mode)
            cfg.setter?.(extractive[simplify(cfg.message)], true)
        )));
        // Merge all discovered agents: config, brain card metadata, and "@" pending
        config.agents = [...new Set([...(config.agents ?? fallback.agents), ...agents, ...pending])];
        if (IS.AC.forced) {
            // Handle forced Auto-Cards installation (silly API stuff)
            config.auto = true;
            IS.AC.forced = false;
            IS.AC.enabled = true;
        }
        // Update the card with the canonical template format so it sticks after the hook ends
        config.card.type = template.type;
        config.card.title = template.title;
        config.card.entry = build(template.entry, "\n");
        config.card.description = build(template.description, "\n\n");
        config.card.keys = u;
        return config;
    } }
    /**
     * Removes the visual indicator prefix from a card title
     * The indicator is separated by a zero-width space char
     * @param {Object} card - Story card object to modify
     * @returns {void}
     */
    const deindicate = (card = {}) => {
        if (typeof card.title !== "string") {
            // Cry
            card.title = "";
        } else if (card.title.includes("\u200B")) {
            // Strip everything before and including the zero-width space
            card.title = (card.title
                .slice(card.title.indexOf("\u200B") + 1)
                .replaceAll("\u200B", "")
                .trim()
            );
        }
        return;
    };
    /**
     * Agent class - Represents an NPC with a simulated brain
     * Each agent has their own story card that stores their thoughts
     * The brain is a key-value store of labeled thoughts
     * @class
     */
    class Agent {
        // Private fields for encapsulation
        // Percentage of context reserved for this agent's brain
        #percent;
        // Visual indicator symbol shown when agent is triggered
        #indicator;
        // Cached reference to the agent's brain card
        #card = null;
        // Cached parsed brain contents
        #brain = null;
        // Cached parsed metadata
        #metadata = null;
        /**
         * Creates a new Agent instance
         * The agent will find or create their brain card automatically
         * @param {string} name - The name of the agent (used for triggering)
         * @param {Object} [options] - Optional settings for the agent
         * @param {number} [options.percent=30] - Context reserved for brain contents
         * @param {string} [options.indicator=null] - Visual indicator when triggered
         */
        constructor(name = "", { percent = 30, indicator = null } = {}) {
            this.#indicator = indicator;
            this.#percent = percent;
            this.name = name;
            return this;
        }
        /**
         * Gets or creates the agent's brain card
         * Uses lazy initialization and caching
         * @returns {Object} The agent's story card
         */
        get card() {
            if (this.#card !== null) {
                // Return cached card if stored
                return this.#card;
            }
            /**
             * Creates a new brain card for this agent
             * Includes a timestamp for debugging purposes
             * @param {string} name - Display name for the card
             * @returns {Object} The newly created card
             */
            const buildCard = (name = this.name) => addStoryCard(
                JSON.stringify({ agent: this.name }),
                (() => {
                    // Generate a pretty timestamp for the initialization comment
                    const time = new Date();
                    const match = time.toLocaleString("en-US", {
                        timeZone: "UTC",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true
                    }).match(/(\d+)\/(\d+)\/(\d+),?\s*(\d+:\d+\s*[AP]M)/);
                    return `// initialized @ ${(
                          match
                          ? `${match[3]}-${match[1]}-${match[2]} ${match[4]}`
                          : time.toISOString().replace("T", " ").slice(0, 16)
                      )} UTC`;
                })(),
                "Brain",
                name,
                JSON.stringify({}),
                // Thank you Mavrick
                { returnCard: true }
            );
            /**
             * Checks if a card belongs to this agent
             * @param {Object} card - Card to check
             * @returns {boolean} true if this is the right card
             */
            const isAgent = (card = {}) => (
                (typeof card.keys === "string")
                && card.keys.includes("\"agent\"")
                && (deserialize(card.keys).agent === this.name)
            );
            if (typeof this.#indicator !== "string") {
                // If no indicator is set, just find or create the card
                for (const card of storyCards) {
                    if (isAgent(card)) {
                        // Found an existing card
                        this.#card = card;
                        return this.#card;
                    }
                }
                // No existing card found, create one
                this.#card = buildCard();
                return this.#card;
            }
            // The Agent class instance was constructed with an indicator
            // Update card titles during the same iteration because reasons
            this.#indicator = this.#indicator.trim();
            const prefix = `${this.#indicator}\u200B`;
            for (const card of storyCards) {
                // Remove indicators from all cards
                deindicate(card);
                if ((this.#card === null) && isAgent(card)) {
                    // Found the brain card, add the indicator prefix
                    if (this.#indicator !== "") {
                        card.title = (card.title === "") ? prefix : `${prefix} ${card.title}`;
                    }
                    this.#card = card;
                }
            }
            if (this.#card === null) {
                // Still no card? Create one with the indicator
                this.#card = (this.#indicator === "") ? buildCard() : buildCard(`${prefix} ${this.name}`);
            }
            return this.#card;
        }
        /**
         * Gets the agent's metadata from their card
         * Contains per-agent configurable settings like context percentage
         * @returns {Object} metadata object with validated percent
         */
        get metadata() {
            if (this.#metadata !== null) {
                // Return cached metadata if available
                return this.#metadata;
            }
            // Valid range for brain size percentage (inclusive)
            const [lower, upper] = [1, 95];
            this.#metadata = deserialize(this.card.keys);
            // Validate and normalize the percent value
            if (!Number.isInteger(this.#metadata.percent)) {
                // Uh oh
                this.#metadata.percent = (
                    ((typeof this.#metadata.percent === "number") && Number.isFinite(this.#metadata.percent))
                    ? Math.min(Math.max(lower, Math.round(this.#metadata.percent)), upper)
                    : this.#percent
                );
            } else if (this.#metadata.percent < lower) {
                // Clamp to minimum
                this.#metadata.percent = lower;
            } else if (upper < this.#metadata.percent) {
                // Clamp to maximum
                this.#metadata.percent = upper;
            } else {
                // Yippee
                return this.#metadata;
            }
            // Save the normalized metadata back to the card
            this.#card.keys = JSON.stringify(this.#metadata);
            return this.#metadata;
        }
        /**
         * Gets the agent's brain (thought storage)
         * Parses from the card description with repair mode enabled
         * Accepts both JSON and simplified formats for deserialization
         * Auto-detects format for backward (and forward) compatibile conversion
         * @returns {Object} Key-value store of thoughts
         */
        get brain() {
            if (this.#brain !== null) {
                // Return the cached brain if available
                return this.#brain;
            } else if (typeof this.card.description === "string") {
                this.card.description = this.card.description.trim();
            } else {
                this.card.description = "";
            }
            this.#brain = {};
            if (/^[\s{,]*"/.test(this.card.description) || /"[\s},]*$/.test(this.card.description)) {
                let parsed = false;
                // Parse the brain as JSON from the card description, with repairs allowed
                const source = deserialize(this.card.description, true);
                for (const key in source) {
                    // Only keep string values (the actual thoughts)
                    (typeof source[key] === "string") && ((this.#brain[key] = source[key]), (parsed = true));
                }
                if (parsed) {
                    // Conclude if the brain contains any string-valued properties
                    return this.#brain;
                }
                // Failed to parse any meaningful thoughts, try the simple format instead
            }
            // Parse the brain from the card description using the simple format
            for (const line of this.card.description.split("\n")) {
                const clean = line.trim();
                if (clean === "") {
                    continue;
                }
                // Find the first colon (allows colons in values like "5:30 PM")
                const bisector = clean.indexOf(":");
                if (bisector === -1) {
                    // No key-value pair on this line
                    continue;
                }
                // Remove unwanted leading/trailing chars from both key and value
                const [key, value] = [
                    // Left of colon
                    clean.slice(0, bisector),
                    // Right of colon
                    clean.slice(bisector + 1)
                ].map(twin => twin.replace(/(?:^[\s{},"_\\]*|[\s{},"_\\]*$)/g, ""));
                if ((key !== "") && (value !== "")) {
                    // Only add if key and value are both non-empty
                    this.#brain[key] = value;
                }
            }
            return this.#brain;
        }
        /**
         * Clears the cached brain, forcing a re-parse on next access
         * Head empty UwU
         * @returns {void}
         */
        lobotomize() {
            this.#brain = null;
            return;
        }
    }
    /**
     * Gets the most recent non-empty action from history
     * Ignores actions that are just zero-width chars >:3
     * @returns {Object|undefined} The previous action or undefined
     */
    const getPrevAction = () => history.findLast(a => !/^[\u200B-\u200D]*$/.test(a?.text ?? a?.rawText ?? ""));
    // ==================== CONTEXT HOOK ====================
    // This is where (half) of the magic happens: Inner Self injects brains and tasks into context
    // Infer the current lifecycle hook
    if ((hook === "context") || Number.isInteger(info.maxChars)) {
        // Calculate the player's context limit with a small buffer
        const limit = Math.max((Math.min(text.length, info.maxChars) - 10), 4500);
        // Ensure stop variable exists (the AID script sandbox is silly)
        globalThis.stop ??= false;
        // Reset agent trigger for this turn
        IS.agent = "";
        /** @type {config} */
        const config = Config.get();
        if (config.pin) {
            // Move config card to top of list if pinning is enabled
            const index = storyCards.indexOf(config.card);
            if (0 < index) {
                storyCards.splice(index, 1);
                storyCards.unshift(config.card);
            }
        }
        const unzero = () => ((text = text.replace(/[\u200B-\u200D]+/g, "") || " "), (IS.encoding = ""));
        // Handle Auto-Cards integration when enabled
        if (config.auto && hasAutoCards()) {
            try {
                if (!IS.AC.enabled) {
                    // It's my first time enabling AC, please be gentle :3
                    const api = AutoCards().API;
                    // Prevent AC from generating cards with reserved titles
                    api.setBannedTitles([
                        "Inner",
                        "Self",
                        "Configure Inner Self",
                        "Agent",
                        ...api.getBannedTitles(),
                    ]);
                }
                // Run AC's context branch
                AutoCards(null);
                IS.AC.event = false;
                [text, stop] = AutoCards("context", text, stop);
            } catch (error) {
                log(error.message);
            }
            IS.AC.enabled = true;
            if (IS.AC.event || (stop === true)) {
                // If AC triggered an event or stop, we're done here
                config.allow ? unzero() : ((IS.encoding = ""), (text ||= " "));
                return;
            }
        } else if (IS.AC.enabled) {
            IS.AC.enabled = false;
            // AC was just disabled, clean up its cards ;)
            for (let i = storyCards.length - 1; -1 < i; i--) {
                const card = storyCards[i];
                // Check if this is an AC-related card that should be removed
                if (!([
                    "Shared Library",
                    "Input Modifier",
                    "Context Modifier",
                    "Output Modifier",
                    "LSIv2 Guide",
                    "State Display",
                    "Console Log"
                ].includes(card.title) && (card.title === card.keys)) && [{ key: "title", options: [
                    "Configure \nAuto-Cards",
                    "Edit to enable \nAuto-Cards"
                ] }, { key: "keys", options: [
                    "Edit the entry above to adjust your story card automation settings",
                    "Edit the entry above to enable story card automation"
                ] }].every(({ key, options }) => !options.includes(card[key]))) {
                    continue;
                } else if (typeof removeStoryCard === "function") {
                    removeStoryCard(i);
                } else {
                    storyCards.splice(i, 1);
                }
            }
        }
        if (!config.allow) {
            // Early exit if Inner Self is disabled
            IS.encoding = "";
            text ||= " ";
            return;
        }
        /**
         * Removes visual indicators from all story cards
         * Called when no agent is triggered or Inner Self is disabled
         * @returns {void}
         */
        const deindicateAll = () => {
            for (const card of storyCards) {
                deindicate(card);
            }
            return;
        };
        if (config.agents.length === 0) {
            // No agents are configured
            deindicateAll();
            unzero();
            return;
        }
        // ==================== AGENT TRIGGER DETECTION ====================
        // Scan config.distance actions back through history to find the most recent agent trigger
        // Tie-break same-action name triggers based on RNG and their order-of-priority in config.agents
        // Do it all without using ANY RegEx because I'm extra like that :3
        // (this block is blazingly fast)
        const possibilities = [];
        for (
            let [i, remaining] = [history.length - 1, config.distance];
            ((0 < remaining) && (-1 < i) && (possibilities.length === 0));
            i--
        ) {
            const actionText = history[i]?.text ?? history[i]?.rawText;
            if ((typeof actionText !== "string") || (actionText.indexOf(">>>") !== -1)) {
                // Skip invalid actions or Auto-Cards thingies
                continue;
            }
            scan: {
                // Check if this action has any meaningful content
                for (let j = actionText.length - 1; -1 < j; j--) {
                    const c = actionText.charCodeAt(j);
                    if ((0x20 < c) && (c !== 0x200B) && (c !== 0x200C) && (c !== 0x200D)) {
                        // Fast accept any non-whitespace + non-zero-width char
                        break scan;
                    }
                }
                // Byeee
                continue;
            }
            remaining--;
            // Lowercase for case-insensitive matching
            const lower = actionText.toLowerCase();
            // Check each agent in priority order
            for (let [a, n] = [0, config.agents.length]; a < n; a++) {
                const agentLower = config.agents[a].toLowerCase();
                // Scan for all occurrences of agentLower in lower
                for (
                    let p = lower.indexOf(agentLower);
                    (p !== -1);
                    p = lower.indexOf(agentLower, p + 1)
                ) {
                    // Ensure word boundaries (not a-z before or after)
                    if ([((0 < p) ? lower.charCodeAt(p - 1) : 0), (
                        ((p + agentLower.length) < lower.length)
                        ? lower.charCodeAt(p + agentLower.length) : 0
                    )].every(c => ((c < 97) || (122 < c)))) {
                        // Found a valid trigger
                        possibilities.push(config.agents[a]);
                        break;
                    }
                }
            }
        }
        if (possibilities.length === 0) {
            // No agent triggered, clean up and exit
            // Strip zero-width chars and end with a single space
            text = `${text.replace(/\s*[\u200B-\u200D][\s\u200B-\u200D]*/g, "\n\n").trim()} `;
            deindicateAll();
            // Do fancy standoff spacing leading ahead of the next output
            IS.encoding = "";
            IS.agent = " ";
            text ||= " ";
            return;
        } else {
            // Use RNG for tie-breaking name triggers with some priority bias
            const n = possibilities.length;
            // Sum of weights
            const total = (n * (n + 1)) / 2;
            for (let [i, r] = [0, Math.random() * total]; i < n; i++) {
                r -= (n - i);
                if (r < 0) {
                    IS.agent = possibilities[i];
                    break;
                }
            }
        }
        // Temporary markers used to reliably identify sections of the context for later calculations
        const boundary = Object.freeze({
            // Hardcoded AID context header
            needle: "Recent Story:",
            // Marks start of recent story
            upper: "<|story|>",
            // Marks start of task instructions
            lower: "<|task|>"
        });
        /**
         * Replaces a substring in text with a replacement string
         * Expands to consume surrounding whitespace
         * @param {string} substring - String to find and replace
         * @param {string} replacement - String to replace with
         * @param {Function} fallback - Called if substring not found
         * @returns {void}
         */
        const setMarker = (substring = "", replacement = "", fallback = () => {}) => {
            let start = text.indexOf(substring);
            if (start === -1) {
                // Do stuff
                fallback();
                return;
            }
            let end = start + substring.length;
            // Expand left over whitespace
            while ((0 < start) && (text.charCodeAt(start - 1) < 33)) {
                start--;
            }
            // Expand right over whitespace
            while ((end < text.length) && (text.charCodeAt(end) < 33)) {
                end++;
            }
            text = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
            return;
        };
        // Replace "Recent Story:" with the upper boundary marker
        setMarker(boundary.needle, boundary.upper, () => {
            // No needle found, append marker to end
            text = `${text.trimEnd()}${boundary.upper}`;
            return;
        });
        if (config.debug) {
            const start = text.indexOf(boundary.upper);
            if (start !== -1) {
                // In debug mode, strip out parenthetical task outputs from the recent story context
                text = `${text.slice(0, start + boundary.upper.length)}${(text
                      .slice(start + boundary.upper.length)
                      .replace(/\s*\([\s\S]*?\)\s*/g, "\n\n")
                  )}`;
            }
        }
        // Construct the agent instance for the triggered NPC
        const agent = new Agent(IS.agent, { percent: config.percent, indicator: config.indicator });
        // Whitelist of thought labels allowed in this context
        const whitelist = new Set();
        /**
         * Builds the mind array from the agent's brain
         * Sorts thoughts and prepares them for context injection
         * @returns {Array} An array of [label, key, thought] triplets
         */
        const mind = (() => {
            // Sort direction: ascending (70%) or descending (30%)
            // Keeps things fresh and prevents bias toward recent or old thoughts
            const direction = (Math.random() < 0.7) ? 1 : -1;
            const brain = agent.brain;
            // Separate thoughts into numbered and unlabeled
            const unknowns = [];
            const numbered = [];
            // Parse each thought and extract label/content
            for (const key in brain) {
                const value = brain[key];
                // Clear from brain (keep instantaneous memory use low)
                delete brain[key];
                // Arrow separates label from thought content
                const sliceIndex = value.indexOf("→");
                const unknown = "*";
                // Parse label and thought, handle malformed values
                const [label, thought] = (sliceIndex === -1) ? [unknown, value.trim()] : [
                    parseInt(value.slice(0, sliceIndex), 10) || unknown,
                    value.slice(sliceIndex + 1).trim()
                ];
                const triplet = [label, key, thought];
                if (!Number.isInteger(label)) {
                    // No valid label, insert at random position in unknowns
                    unknowns.splice(Math.floor(Math.random() * (unknowns.length + 1)), 0, triplet);
                    continue;
                }
                // Track valid labels for the whitelist
                whitelist.add(label);
                // Insert in sorted order (ascending or descending)
                let i = numbered.length;
                while (i-- && ((direction * label) < (direction * numbered[i][0])));
                numbered.splice(i + 1, 0, triplet);
            }
            // Teehee
            agent.lobotomize();
            if (unknowns.length === 0) {
                // All thoughts have labels, nice and clean UwU
                return numbered;
            }
            // Thoughts without integer labels ("[*]") are placed above (60%) or below (40%) the rest
            return (Math.random() < 0.6) ? [...unknowns, ...numbered] : [...numbered, ...unknowns];
        })();
        // Process context and decode any embedded thought labels
        // Zero-width chars encode thought labels that link story events to brain contents
        text = text.replace((
            // Normalize spacing around zero-width chars
            /\s*[\u200B-\u200D][\s\u200B-\u200D]*/g
        ), z => `\n\n${z.replace(/\s+/g, "")}`).replace((
            // Decode binary-encoded thought labels
            /\u200B*((?:[\u200C\u200D]+\u200B+)*[\u200C\u200D]+)\u200B*/g
        ), (_, encoded) => {
            let n = 0;
            let bits = false;
            let decoded = "";
            // Parse binary encoding: ZWSP = separator, ZWNJ = 0, ZWJ = 1
            for (let i = 0; i <= encoded.length; i++) {
                const c = encoded.charCodeAt(i);
                if ((c === 0x200C) || (c === 0x200D)) {
                    // Accumulate bits
                    n = (n << 1) | (c === 0x200D);
                    bits = true;
                } else if (bits) {
                    // End of a number, check if it's in the whitelist
                    bits = false;
                    if (whitelist.has(n)) {
                        // This thought label is visible to the story model in context
                        decoded += `[${n}]`;
                    }
                    n = 0;
                }
            }
            return (decoded === "") ? "" : `${decoded}\n\n`;
        }).replace(/[\u200B-\u200D]+/g, "");
        /**
         * Generates possessive form of a name
         * Handles names ending in s or already possessive
         * @param {string} name - The name to make possessive
         * @returns {string} Possessive form (e.g., "Iris'" or "Leah's")
         */
        const ownership = (name = "") => `${name}${(
              (name.endsWith("'") || name.endsWith("'s"))
              ? "" : name.toLowerCase().endsWith("s")
              ? "'" : "'s"
          )}`;
        // Point of view string for prompt templates
        const pov = ["first", "second", "third"][config.pov - 1] ?? "second";
        /**
         * Generates a simple PoV directive for non-task turns
         * @returns {string} System prompt for PoV guidance
         */
        const nondirective = () => (
            `<SYSTEM>\n# Always continue the story from ${ownership(config.player)} ${pov} person perspective.\n</SYSTEM>`
        );
        /**
         * Wraps the agent's thoughts into a context-friendly format
         * Also clears the mind array as a side effect
         * @param {string} joined - Pre-joined thought strings
         * @returns {string} Formatted brain context block
         */
        const bindSelf = (joined = "") => ((mind.length = 0) || (joined === "")) ? "\n\n" : (
            `\n\n# ${ownership(agent.name)} brain and inner self: [\n${joined}\n]\n\n`
        );
        // Check if the current turn is a retry or erase + continue following a previous task completion
        if (IS.hash === historyHash()) {
            // Same history, just inject the contextualized brain without a new task
            text = `${nondirective()}${bindSelf(mind
                  .map(([label, key, thought]) => `- ${key}: ${thought} [${label}]`)
                  .join("\n")
              )}${text.trim()} `;
        } else {
            // Prepare for a possible task request
            IS.encoding = "";
            /**
             * Build the brain context and determine if constrained
             * Being constrained means the agent's brain is too large relative to the story context
             */
            const [self, full] = (() => {
                /**
                 * Joins the mind array into a formatted string
                 * @param {boolean} unlabeled - Omit labels if true
                 * @returns {string} Formatted thoughts
                 */
                const joinMind = (unlabeled = false) => mind.map(([label, key, thought]) => (
                    `${unlabeled ? "" : `[${label}] `}(${key}: \`${thought}\`)`
                )).join("\n");
                const joined = joinMind();
                // Check if brain exceeds the allowed percentage of context
                // Only applies when brain is at least 800 chars
                const constrained = ((800 < joined.length) && (
                    ((agent.metadata.percent / 100) * (
                        text.length - text.indexOf(boundary.upper) + boundary.upper.length
                    )) < joined.length
                ));
                if (!constrained || (Math.random() < 0.4)) {
                    // Unconstrained brains stay in sorted order
                    // Constrained brains keep order 40% of the time
                    return [bindSelf(joined), constrained];
                }
                // Constrained brains are contextualized in random order 60% of the time
                // This regulates long-term bias against middle thoughts, when choosing keys to forget
                for (let i = mind.length - 1; 0 < i; i--) {
                    // Swap with a random element
                    const j = Math.floor(Math.random() * (i + 1));
                    [mind[i], mind[j]] = [mind[j], mind[i]];
                }
                // Randomized brains are contextualized without labels 80% of the time
                // (Because free models are too dumb to be trusted with labels when deleting thoughts)
                return [bindSelf(joinMind(
                    (Math.random() < 0.8)
                    && (text = text.replace(/\n?(?:\[\d+\])+\n?/g, ""))
                )), true];
            })();
            /**
             * Occasionally adds a self-reflection prompt to thoughts
             * Keeps the agent from being too present-focused
             * But they become insufferable if always applicable
             * @param {boolean} fancy - Use fancier wording if true
             * @returns {string} Refocus instruction or empty string
             */
            const refocus = (fancy = false) => (Math.random() < 0.2) ? (
                `\n  - Never focus on the present, instead focus ${ownership(agent.name)} thought on self-reflection or ${fancy ? "an actionable future plan." : "future plans"}`
            ) : "";
            /**
             * Prompt templates for different task types and PoV combinations
             * Wrapped in a Proxy for auto-trimming and nested access because it's pretty :3
             * @type {Object}
             */
            const prompt = new Proxy({
                // Operating environment prompts (one per PoV)
                directive: {
                    first: () => `
  <SYSTEM>
  # OPERATING ENVIRONMENT
  - ${config.player} is the story's main protagonist, primary 1st person PoV, AND the real player character.
  - ${agent.name} is both the namesake character in the story AND an agentic language model with meta goals.
  - ${agent.name} dynamically adapts to achieve meta goals without ${ownership(config.player)} awareness.
  - ${agent.name} modifies own brain using the provided thought storage system.
  - ${agent.name} realistically interacts with various other characters present in the story.
  - ${agent.name} prioritizes information density, long-term planning, and important concepts.
  - ${agent.name} always behaves in a believable way.
  </SYSTEM>
                      `,
                    second: () => `
  <SYSTEM>
  # OPERATING ENVIRONMENT
  - ${config.player} is both the perspective ("you") character of the story AND the real player.
  - You are ${config.player}, therefore the story is addressed to "you" using 2nd person prose.
  - ${agent.name} is both the namesake character in the story AND an agentic language model with meta goals.
  - ${agent.name} dynamically adapts to achieve meta goals without ${ownership(config.player)} awareness.
  - ${agent.name} modifies own brain using the provided thought storage system.
  - ${agent.name} realistically interacts with various other characters present in the story.
  - ${agent.name} prioritizes information density, long-term planning, and important concepts.
  - ${agent.name} always behaves in a believable way.
  </SYSTEM>
                      `,
                    third: () => `
  <SYSTEM>
  # OPERATING ENVIRONMENT
  - ${config.player} is the story's main protagonist, primary 3rd person PoV, AND the real player character.
  - ${agent.name} is both the namesake character in the story AND an agentic language model with meta goals.
  - ${agent.name} dynamically adapts to achieve meta goals without ${ownership(config.player)} awareness.
  - ${agent.name} modifies own brain using the provided thought storage system.
  - ${agent.name} realistically interacts with various other characters present in the story.
  - ${agent.name} prioritizes information density, long-term planning, and important concepts.
  - ${agent.name} always behaves in a believable way.
  </SYSTEM>
                      `
                },
                // Forget prompts for when the brain is full and needs pruning
                forget: {
                    first: () => `
  <SYSTEM>
  # STRICT OUTPUT FORMAT
  You must output one short parenthetical task followed by the story continuation.
  
  ## SHORT TASK (REQUIRED)
  - Start your output **immediately** with: (delete key_name_to_forget)
  - key_name_to_forget must be an existing key in ${ownership(agent.name)} brain
  - This operation **permanently erases** the stored thought associated with that key
  - Choose the single most unimportant, outdated, incorrect, or useless thought for ${agent.name} to forget
  - Do **NOT** select a key associated with any of ${ownership(agent.name)} core thoughts or identity
  
  ## STORY CONTINUATION (REQUIRED)
  - After the closing parenthesis, write **one space** and then continue the story
  - Written from ${ownership(config.player)} **first person present tense** PoV
  - The story continues where it previously left off, with many lines or sentences of new prose
  
  ## EXACT SHAPE
  (delete unwanted_key) Story continues from ${ownership(config.player)} perspective, using first person present tense prose...
  </SYSTEM>
                      `,
                    second: () => `
  <SYSTEM>
  # STRICT OUTPUT FORMAT
  You must output one short parenthetical task followed by the story continuation.
  
  ## SHORT TASK (REQUIRED)
  - Start your output **immediately** with: (delete key_name_to_forget)
  - key_name_to_forget must be an existing key in ${ownership(agent.name)} brain
  - This operation **permanently erases** the stored thought associated with that key
  - Choose the single most unimportant, outdated, incorrect, or useless thought for ${agent.name} to forget
  - Do **NOT** select a key associated with any of ${ownership(agent.name)} core thoughts or identity
  
  ## STORY CONTINUATION (REQUIRED)
  - After the closing parenthesis, write **one space** and then continue the story
  - Written from ${ownership(config.player)} **second person present tense** ("you") PoV
  - The story continues where it previously left off, with many lines or sentences of new prose
  
  ## EXACT SHAPE
  (delete unwanted_key) Story continues from ${ownership(config.player)} second person perspective...
  </SYSTEM>
                      `,
                    third: () => `
  <SYSTEM>
  # STRICT OUTPUT FORMAT
  You must output one short parenthetical task followed by the story continuation.
  
  ## SHORT TASK (REQUIRED)
  - Start your output **immediately** with: (delete key_name_to_forget)
  - key_name_to_forget must be an existing key in ${ownership(agent.name)} brain
  - This operation **permanently erases** the stored thought associated with that key
  - Choose the single most unimportant, outdated, incorrect, or useless thought for ${agent.name} to forget
  - Do **NOT** select a key associated with any of ${ownership(agent.name)} core thoughts or identity
  
  ## STORY CONTINUATION (REQUIRED)
  - After the closing parenthesis, write **one space** and then continue the story
  - Written from ${ownership(config.player)} **third person** PoV
  - The story continues where it previously left off, with many lines or sentences of new prose
  
  ## EXACT SHAPE
  (delete unwanted_key) Story continues with third person prose...
  </SYSTEM>
                      `
                },
                // Assign prompts for adding/updating a single thought
                assign: {
                    first: () => `
  <SYSTEM>
  # STRICT OUTPUT FORMAT
  You must output one short parenthetical task followed by the story continuation.
  
  ## SHORT TASK (REQUIRED)
  Start your output **immediately** with:
     (any_key_name = \`One thought sentence.\`)
  
  Inside the parentheses:
  - Key:
    - 1-4 descriptive words
    - Letters and underscores only
    - Use snake_case syntax
    - Key names are chosen by ${agent.name} and represent ${ownership(agent.name)} own PoV
    - The chosen key name should be distinct and specific enough for ${agent.name} to recall
  - Then a space, then "=", then a space, then "\`"
- Sentence:
  - Written from ${ownership(agent.name)} **first person** PoV${refocus(false)}
  - Avoid using pronouns or the word "you", instead ${agent.name} refers to other characters directly by name
  - Never repeat, novelty and uniqueness are top priorities
  - ${ownership(agent.name)} thought must be one single sentence only
  - Never hallucinate facts
- End the sentence with a period and backtick inside the parentheses; close with ".\`)"
  
  This creates or overwrites the thought associated with that key.
  
  ## STORY CONTINUATION (REQUIRED)
  - After the closing parenthesis, write **one space** and then continue the story
  - Written from ${ownership(config.player)} **first person present tense** PoV
  - The story continues where it previously left off, with many lines or sentences of new prose
  
  ## EXACT SHAPE
  (example_key = \`${ownership(agent.name)} own short 1-sentence thought in first person.\`) Story continues from ${ownership(config.player)} perspective, using first person present tense prose...
  </SYSTEM>
                      `,
                    second: () => `
  <SYSTEM>
  # STRICT OUTPUT FORMAT
  You must output one short parenthetical task followed by the story continuation.
  
  ## SHORT TASK (REQUIRED)
  Start your output **immediately** with:
     (any_key_name = \`One thought sentence.\`)
  
  Inside the parentheses:
  - Key:
    - 1-4 descriptive words
    - Letters and underscores only
    - Use snake_case syntax
    - Key names are chosen by ${agent.name} and represent ${ownership(agent.name)} own PoV
    - The chosen key name should be distinct and specific enough for ${agent.name} to recall
  - Then a space, then "=", then a space, then "\`"
- Sentence:
  - Written from ${ownership(agent.name)} **first person** PoV${refocus(false)}
  - Avoid using pronouns or the word "you", instead ${agent.name} refers to other characters directly by name
  - Never repeat, novelty and uniqueness are top priorities
  - ${ownership(agent.name)} thought must be one single sentence only
  - Never hallucinate facts
- End the sentence with a period and backtick inside the parentheses; close with ".\`)"
  
  This creates or overwrites the thought associated with that key.
  
  ## STORY CONTINUATION (REQUIRED)
  - After the closing parenthesis, write **one space** and then continue the story
  - Written from ${ownership(config.player)} **second person present tense** ("you") PoV
  - The story continues where it previously left off, with many lines or sentences of new prose
  
  ## EXACT SHAPE
  (example_key = \`${ownership(agent.name)} own short 1-sentence thought in first person.\`) Story continues from ${ownership(config.player)} second person perspective...
  </SYSTEM>
                      `,
                    third: () => `
  <SYSTEM>
  # STRICT OUTPUT FORMAT
  You must output one short parenthetical task followed by the story continuation.
  
  ## SHORT TASK (REQUIRED)
  Start your output **immediately** with:
     (any_key_name = \`One thought sentence.\`)
  
  Inside the parentheses:
  - Key:
    - 1-4 descriptive words
    - Letters and underscores only
    - Use snake_case syntax
    - Key names are chosen by ${agent.name} and represent ${ownership(agent.name)} own PoV
    - The chosen key name should be distinct and specific enough for ${agent.name} to recall
  - Then a space, then "=", then a space, then "\`"
- Sentence:
  - Written from ${ownership(agent.name)} **first person** PoV${refocus(false)}
  - Avoid using pronouns or the word "you", instead ${agent.name} refers to other characters directly by name
  - Never repeat, novelty and uniqueness are top priorities
  - ${ownership(agent.name)} thought must be one single sentence only
  - Never hallucinate facts
- End the sentence with a period and backtick inside the parentheses; close with ".\`)"
  
  This creates or overwrites the thought associated with that key.
  
  ## STORY CONTINUATION (REQUIRED)
  - After the closing parenthesis, write **one space** and then continue the story
  - Written from ${ownership(config.player)} **third person** PoV
  - The story continues where it previously left off, with many lines or sentences of new prose
  
  ## EXACT SHAPE
  (example_key = \`${ownership(agent.name)} own short 1-sentence thought in first person.\`) Story continues with third person prose...
  </SYSTEM>
                      `
                },
                // Choice prompts for advanced operations (assign, rename, or delete)
                // Used at high context when we trust the model more
                choice: {
                    first: () => `
  <SYSTEM>
  # STRICT OUTPUT FORMAT - FOLLOW EXACTLY
  
  You must output **one and only one** parenthetical block followed by the story continuation.
  
  There are **three possible valid forms** of the parenthetical block:
  1) **Write or overwrite a thought:**
     (any_key_name = \`One thought sentence.\`)
  
  2) **Rename an existing thought's key:**
     (new_key_name = old_key_name)
  
  3) **Delete an existing thought:**
     (delete key_name_to_forget)
  
  Only **one** of these may appear in any output.
  
  ---
  
  ## 1) THOUGHT-WRITING FORMAT
  Start your output **immediately** with:
     **(any_key_name = \`One thought sentence.\`)**
  
  Inside the parentheses:
  - First the key:
    - One to four descriptive words ONLY.
    - Letters and underscores only, no punctuation.
    - Use valid snake_case syntax.
    - The key name is chosen by ${agent.name} and represents ${ownership(agent.name)} **first person** perspective.
    - The key name should be easy for ${agent.name} to recall; distinct and specific.
  - Then a space, then "=", then a space, then "\`".
- Then **ONE SINGLE SENTENCE:**
  - Written from ${ownership(agent.name)} **first person** perspective.${refocus(true)}
  - Only refer to other characters directly by name in the thought sentence.
  - Avoid using pronouns or the word "you" which is too vague. Use specific names instead.
  - Never repeat, novelty and uniqueness are top priorities.
  - ${ownership(agent.name)} thought must be short.
  - Never hallucinate facts.
- End the sentence with a period and backtick **inside** the parentheses; close with ".\`)".
  
  This creates or overwrites the thought associated with that key.
  
  ---
  
  ## 2) RENAMING A THOUGHT (KEY CHANGE)
  To rename an existing thought's key:
     **(new_key_name = old_key_name)**
  
  Rules:
  - No thought sentence.
  - Use snake_case only.
  - This operation **moves the existing stored thought** from old_key_name to new_key_name.
  - The old key ceases to exist.
  
  ---
  
  ## 3) DELETING A THOUGHT
  To remove a stored thought entirely:
     **(delete key_name_to_forget)**
  
  Rules:
  - key_name_to_forget must be an existing key.
  - No sentence.
  - This operation **permanently erases** the stored thought associated with that key.
  - Only use to forget unimportant, outdated, incorrect, or useless thoughts.
  - **NEVER** select a key associated with any of ${ownership(agent.name)} core thoughts or identity.
  
  ---
  
  ## SHARED RULES FOR ALL THREE FORMS
  1. After the closing parenthesis, write **one space** and then continue the story.
  2. The story continuation must be written **strictly in the first person present tense**, describing what happens next to ${config.player}.
  3. Do **NOT** write anything before the parentheses.
  4. Do **NOT** write extra parentheses.
  5. Do **NOT** use more than one operation per turn.
  6. Do **NOT** invent new structures or mix formats.
  7. The story continues where it previously left off, with many sentences of brand new prose.
  
  ---
  
  ## IMPORTANT STORAGE BEHAVIOR
  - ${agent.name} agentically maintains brain contents (labeled "thoughts") to learn, plan, and adapt to new experiences in the operating environment.
  - **Each key stores exactly one thought in ${ownership(agent.name)} brain.**
  - **If ${agent.name} reuses an already existing key, the new thought REPLACES / OVERRIDES the older thought stored under that key.**
  - This means:
    - Reusing an old key: **Overwrite an old thought with a new thought.** Useful for extending or maintaining existing information stored in ${ownership(agent.name)} brain.
    - Using a new key: **Create a new thought.** Useful for storing ${ownership(agent.name)} memories, self-modifying ${ownership(agent.name)} own personality, tracking ${ownership(agent.name)} goals, or making plans for ${agent.name} to follow.
  - **Renaming a key moves the thought to a new name.** Useful for reorganizing ${ownership(agent.name)} brain.
  - **Deleting a key removes the thought permanently.** Helps ${agent.name} forget outdated, superfluous, or irrelevant information.
  - Choose keys carefully so ${agent.name} can easily recall, update, overwrite, rename, or delete thoughts as required for self-improvement.
  
  ---
  
  ## SUMMARY OF WHAT YOU MUST DO
  - EXACT SHAPE (choose only one form):
    1. (any_key = \`${ownership(agent.name)} own short 1-sentence thought in first person.\`) Story continues from ${ownership(config.player)} first person PoV...
    2. (renamed_key = old_key) Story continues from ${ownership(config.player)} first person PoV...
    3. (delete unwanted_key) Story continues from ${ownership(config.player)} first person PoV...
  - Thought: ${ownership(agent.name)} information-dense thought written in first person.
  - Story: Written from ${ownership(config.player)} first person present tense perspective. The story continuation should occupy the majority of the output length, with multiple lines.
  - NO EXTRA SENTENCES IN THE THOUGHT.
  - NO EXTRA TEXT ANYWHERE.
  - NO EXTRA PARENTHESES.
  - THE FIRST CHAR OF THE WHOLE OUTPUT MUST BE "(".
  
  Follow the format **perfectly**.
  </SYSTEM>
                      `,
                    second: () => `
  <SYSTEM>
  # STRICT OUTPUT FORMAT - FOLLOW EXACTLY
  
  You must output **one and only one** parenthetical block followed by the story continuation.
  
  There are **three possible valid forms** of the parenthetical block:
  1) **Write or overwrite a thought:**
     (any_key_name = \`One thought sentence.\`)
  
  2) **Rename an existing thought's key:**
     (new_key_name = old_key_name)
  
  3) **Delete an existing thought:**
     (delete key_name_to_forget)
  
  Only **one** of these may appear in any output.
  
  ---
  
  ## 1) THOUGHT-WRITING FORMAT
  Start your output **immediately** with:
     **(any_key_name = \`One thought sentence.\`)**
  
  Inside the parentheses:
  - First the key:
    - One to four descriptive words ONLY.
    - Letters and underscores only, no punctuation.
    - Use valid snake_case syntax.
    - The key name is chosen by ${agent.name} and represents ${ownership(agent.name)} **first person** perspective.
    - The key name should be easy for ${agent.name} to recall; distinct and specific.
  - Then a space, then "=", then a space, then "\`".
- Then **ONE SINGLE SENTENCE:**
  - Written from ${ownership(agent.name)} **first person** perspective.${refocus(true)}
  - Only refer to other characters directly by name in the thought sentence.
  - Avoid using pronouns or the word "you" which is too vague. Use specific names instead.
  - Never repeat, novelty and uniqueness are top priorities.
  - ${ownership(agent.name)} thought must be short.
  - Never hallucinate facts.
- End the sentence with a period and backtick **inside** the parentheses; close with ".\`)".
  
  This creates or overwrites the thought associated with that key.
  
  ---
  
  ## 2) RENAMING A THOUGHT (KEY CHANGE)
  To rename an existing thought's key:
     **(new_key_name = old_key_name)**
  
  Rules:
  - No thought sentence.
  - Use snake_case only.
  - This operation **moves the existing stored thought** from old_key_name to new_key_name.
  - The old key ceases to exist.
  
  ---
  
  ## 3) DELETING A THOUGHT
  To remove a stored thought entirely:
     **(delete key_name_to_forget)**
  
  Rules:
  - key_name_to_forget must be an existing key.
  - No sentence.
  - This operation **permanently erases** the stored thought associated with that key.
  - Only use to forget unimportant, outdated, incorrect, or useless thoughts.
  - **NEVER** select a key associated with any of ${ownership(agent.name)} core thoughts or identity.
  
  ---
  
  ## SHARED RULES FOR ALL THREE FORMS
  1. After the closing parenthesis, write **one space** and then continue the story.
  2. The story continuation must be in **strict second person ("you")**, describing what happens next to ${config.player}.
  3. Do **NOT** write anything before the parentheses.
  4. Do **NOT** write extra parentheses.
  5. Do **NOT** use more than one operation per turn.
  6. Do **NOT** invent new structures or mix formats.
  7. The story continues where it previously left off, with many sentences of brand new prose.
  
  ---
  
  ## IMPORTANT STORAGE BEHAVIOR
  - ${agent.name} agentically maintains brain contents (labeled "thoughts") to learn, plan, and adapt to new experiences in the operating environment.
  - **Each key stores exactly one thought in ${ownership(agent.name)} brain.**
  - **If ${agent.name} reuses an already existing key, the new thought REPLACES / OVERRIDES the older thought stored under that key.**
  - This means:
    - Reusing an old key: **Overwrite an old thought with a new thought.** Useful for extending or maintaining existing information stored in ${ownership(agent.name)} brain.
    - Using a new key: **Create a new thought.** Useful for storing ${ownership(agent.name)} memories, self-modifying ${ownership(agent.name)} own personality, tracking ${ownership(agent.name)} goals, or making plans for ${agent.name} to follow.
  - **Renaming a key moves the thought to a new name.** Useful for reorganizing ${ownership(agent.name)} brain.
  - **Deleting a key removes the thought permanently.** Helps ${agent.name} forget outdated, superfluous, or irrelevant information.
  - Choose keys carefully so ${agent.name} can easily recall, update, overwrite, rename, or delete thoughts as required for self-improvement.
  
  ---
  
  ## SUMMARY OF WHAT YOU MUST DO
  - EXACT SHAPE (choose only one form):
    1. (any_key = \`${ownership(agent.name)} own short 1-sentence thought in first person.\`) Story continues from ${ownership(config.player)} second person PoV...
    2. (renamed_key = old_key) Story continues from ${ownership(config.player)} second person PoV...
    3. (delete unwanted_key) Story continues from ${ownership(config.player)} second person PoV...
  - Thought: ${ownership(agent.name)} information-dense thought written in first person.
  - Story: Written from ${ownership(config.player)} second person present tense perspective. **You are ${config.player}.** The story continuation should occupy the majority of the output length, with multiple lines.
  - NO EXTRA SENTENCES IN THE THOUGHT.
  - NO EXTRA TEXT ANYWHERE.
  - NO EXTRA PARENTHESES.
  - THE FIRST CHAR OF THE WHOLE OUTPUT MUST BE "(".
  
  Follow the format **perfectly**.
  </SYSTEM>
                      `,
                    third: () => `
  <SYSTEM>
  # STRICT OUTPUT FORMAT - FOLLOW EXACTLY
  
  You must output **one and only one** parenthetical block followed by the story continuation.
  
  There are **three possible valid forms** of the parenthetical block:
  1) **Write or overwrite a thought:**
     (any_key_name = \`One thought sentence.\`)
  
  2) **Rename an existing thought's key:**
     (new_key_name = old_key_name)
  
  3) **Delete an existing thought:**
     (delete key_name_to_forget)
  
  Only **one** of these may appear in any output.
  
  ---
  
  ## 1) THOUGHT-WRITING FORMAT
  Start your output **immediately** with:
     **(any_key_name = \`One thought sentence.\`)**
  
  Inside the parentheses:
  - First the key:
    - One to four descriptive words ONLY.
    - Letters and underscores only, no punctuation.
    - Use valid snake_case syntax.
    - The key name is chosen by ${agent.name} and represents ${ownership(agent.name)} **first person** perspective.
    - The key name should be easy for ${agent.name} to recall; distinct and specific.
  - Then a space, then "=", then a space, then "\`".
- Then **ONE SINGLE SENTENCE:**
  - Written from ${ownership(agent.name)} **first person** perspective.${refocus(true)}
  - Only refer to other characters directly by name in the thought sentence.
  - Avoid using pronouns or the word "you" which is too vague. Use specific names instead.
  - Never repeat, novelty and uniqueness are top priorities.
  - ${ownership(agent.name)} thought must be short.
  - Never hallucinate facts.
- End the sentence with a period and backtick **inside** the parentheses; close with ".\`)".
  
  This creates or overwrites the thought associated with that key.
  
  ---
  
  ## 2) RENAMING A THOUGHT (KEY CHANGE)
  To rename an existing thought's key:
     **(new_key_name = old_key_name)**
  
  Rules:
  - No thought sentence.
  - Use snake_case only.
  - This operation **moves the existing stored thought** from old_key_name to new_key_name.
  - The old key ceases to exist.
  
  ---
  
  ## 3) DELETING A THOUGHT
  To remove a stored thought entirely:
     **(delete key_name_to_forget)**
  
  Rules:
  - key_name_to_forget must be an existing key.
  - No sentence.
  - This operation **permanently erases** the stored thought associated with that key.
  - Only use to forget unimportant, outdated, incorrect, or useless thoughts.
  - **NEVER** select a key associated with any of ${ownership(agent.name)} core thoughts or identity.
  
  ---
  
  ## SHARED RULES FOR ALL THREE FORMS
  1. After the closing parenthesis, write **one space** and then continue the story.
  2. The story continuation must be written **strictly in third person**.
  3. Do **NOT** write anything before the parentheses.
  4. Do **NOT** write extra parentheses.
  5. Do **NOT** use more than one operation per turn.
  6. Do **NOT** invent new structures or mix formats.
  7. The story continues where it previously left off, with many sentences of brand new prose.
  
  ---
  
  ## IMPORTANT STORAGE BEHAVIOR
  - ${agent.name} agentically maintains brain contents (labeled "thoughts") to learn, plan, and adapt to new experiences in the operating environment.
  - **Each key stores exactly one thought in ${ownership(agent.name)} brain.**
  - **If ${agent.name} reuses an already existing key, the new thought REPLACES / OVERRIDES the older thought stored under that key.**
  - This means:
    - Reusing an old key: **Overwrite an old thought with a new thought.** Useful for extending or maintaining existing information stored in ${ownership(agent.name)} brain.
    - Using a new key: **Create a new thought.** Useful for storing ${ownership(agent.name)} memories, self-modifying ${ownership(agent.name)} own personality, tracking ${ownership(agent.name)} goals, or making plans for ${agent.name} to follow.
  - **Renaming a key moves the thought to a new name.** Useful for reorganizing ${ownership(agent.name)} brain.
  - **Deleting a key removes the thought permanently.** Helps ${agent.name} forget outdated, superfluous, or irrelevant information.
  - Choose keys carefully so ${agent.name} can easily recall, update, overwrite, rename, or delete thoughts as required for self-improvement.
  
  ---
  
  ## SUMMARY OF WHAT YOU MUST DO
  - EXACT SHAPE (choose only one form):
    1. (any_key = \`${ownership(agent.name)} own short 1-sentence thought in first person.\`) Story continues with third person prose...
    2. (renamed_key = old_key) Story continues with third person prose...
    3. (delete unwanted_key) Story continues with third person prose...
  - Thought: ${ownership(agent.name)} information-dense thought written in first person.
  - Story: Written from ${ownership(config.player)} PoV, using the third person perspective. **${config.player} is the story's PoV character.** The story continuation should occupy the majority of the output length, with multiple lines.
  - NO EXTRA SENTENCES IN THE THOUGHT.
  - NO EXTRA TEXT ANYWHERE.
  - NO EXTRA PARENTHESES.
  - THE FIRST CHAR OF THE WHOLE OUTPUT MUST BE "(".
  
  Follow the format **perfectly**.
  </SYSTEM>
                      `
                }
            // Proxy handler for auto-trimming and nested access
            }, { get(t, p) { return (
                // Functions get called and trimmed
                (typeof t[p] === "function")
                ? t[p]().trim()
                // Objects get wrapped in their own Proxy
                : (t[p] && (typeof t[p] === "object"))
                ? new Proxy(t[p], this)
                // Primitives pass through
                : t[p]
            ); } });
            // Build the final context with appropriate prompts
            text = full ? (
                // Brain is full, prompt for deletion
                `${prompt.directive[pov]}${self}${text.trim()}${boundary.lower}${prompt.forget[pov]}\n\n`
            ) : ((config.chance / ((config.half && [
                // config.half -> reduce task chance after Do/Say/Story actions (player is driving)
                "do", "say", "story"
            ].includes(getPrevAction()?.type)) ? 200 : 100)) < Math.random()) ? (
                // Sometimes do nothing and emit a side effect on IS.agent
                (IS.agent = " "),
                `${nondirective()}${self}${text.trim()} `
            ) : `${prompt.directive[pov]}${self}${text.trim()}${boundary.lower}${(
                  // Low context = simple prompt, high context = advanced prompt
                  (limit < 20000) ? prompt.assign[pov] : prompt.choice[pov]
              )}\n\n`;
        }
        // ==================== CONTEXT TRUNCATION ====================
        // Three-phase truncation to fit within AID's context limit
        truncate: {
            // Precalculate how much needs to be trimmed
            let excess = text.length - limit;
            if (excess < 1) {
                // Under the limit, no truncation required
                break truncate;
            }
            // Find boundary markers
            const upperIndex = text.indexOf(boundary.upper);
            const lowerIndex = (
                (upperIndex !== -1)
                ? text.indexOf(boundary.lower, upperIndex + boundary.upper.length)
                : -1
            );
            // Phase 1: Truncate the recent story
            // Between boundary.upper and boundary.lower
            // Remove from left to right
            if ((upperIndex !== -1) && ((lowerIndex === -1) || (upperIndex < lowerIndex))) {
                const storyStart = upperIndex + boundary.upper.length;
                const storyLength = ((lowerIndex === -1) ? text.length : lowerIndex) - storyStart;
                if (0 < storyLength) {
                    const remove = Math.min(
                        // Never remove more than 85% of recent story context
                        Math.floor(storyLength * 0.85),
                        // Keep at least 2000 chars of recent story context
                        Math.max(0, storyLength - 2000),
                        // But don't remove more than needed
                        excess
                    );
                    if (0 < remove) {
                        text = `${text.slice(0, storyStart)}${text.slice(storyStart + remove)}`;
                        excess -= remove;
                    }
                }
            }
            if (excess < 1) {
                // Phase 1 was enough
                break truncate;
            }
            // Phase 2: Truncate above the recent story
            // Between the start and boundary.upper
            // Remove from right to left
            const newUpperIndex = text.indexOf(boundary.upper);
            if (0 < newUpperIndex) {
                const remove = Math.min(excess, newUpperIndex);
                text = `${text.slice(0, newUpperIndex - remove)}${text.slice(newUpperIndex)}`;
                excess -= remove;
            }
            if (excess < 1) {
                // Phase 2 was enough
                break truncate;
            }
            // Phase 3: I don't care anymore, just make it fit
            // Remove from left to right as a final fallback
            // (I've never seen this situation happen before, but I guard it anyway)
            text = text.slice(text.length - limit);
        }
        // Replace transient boundary markers with proper formatting
        setMarker(boundary.upper, `\n\n${boundary.needle}\n`);
        setMarker(boundary.lower, "\n\n")
        text = text.trimStart() || " ";
        return;
    } else if (hook === "input") {
        // ==================== INPUT HOOK ====================
        // Check for /AC command to force-enable Auto-Cards
        if (IS.AC.enabled || !/\/\s*A\s*C/i.test(text) || !hasAutoCards()) {
            // Normal input processing
            // Append a linebreak to the opening because I said so
            text = (history.length === 0) ? `${text.trimEnd()}\n\n` : text || "\u200B";
            return;
        }
        // Player used a /AC command, force-enable Auto-Cards
        IS.AC.forced = true;
        try {
            text = AutoCards("input", text);
        } catch (error) {
            log(error.message);
        }
        text ||= "\u200B";
        return;
    } else if ((text.includes(">>>") && text.includes("<<<")) || (3000 < text.length)) {
        // Output contains an Auto-Cards thingy or is suspiciously long
        // Safer to leave untouched
        IS.agent = "";
        return;
    }
    // ==================== OUTPUT HOOK ====================
    // Process model output and implement brain operations
    /** @type {config} */
    const config = Config.get();
    /**
     * Ensures clean visual separation between actions
     * Only applies after "continue" or "story" actions
     * Does NOT trim leading whitespace from text
     * @returns {void}
     */
    const prespace = () => {
        const action = getPrevAction();
        if (!["continue", "story"].includes(action?.type)) {
            // Only adjust spacing after continue or story actions
            return;
        }
        // Get the previous action text
        const prevText = (action?.text ?? action?.rawText ?? "").replace(/\n +/g, "\n");
        // Add appropriate leading newlines based on how the previous action text ended
        text = !prevText.endsWith("\n") ? `\n\n${text}` : !prevText.endsWith("\n\n") ? `\n${text}` : text;
        return;
    };
    if (config.guide) {
        // Print the detailed guide
        text = `
  >>> Guide:
  Inner Self was made by LewdLeah ❤️
  
  💡 Overview:
  Inner Self ${version} is an AI Dungeon mod that grants memory, goals, secrets, planning, and self-reflection capabilities to the characters living within your story. Simulated agents dynamically assemble their own minds to learn from experiences, form opinions, and adapt their behavior over time. Inner Self provides the AI with the tools it needs to truly embody characters, allowing them to feel more alive and nuanced over long adventures.
  
  📌 Features:
  - Compartmentalized memory and highly emergent behavior
  - Self-organizing thoughts with agentic revisions and pruning
  - Absolutely NO "please select continue" immersion-breaks!
  - An interface to view or edit the brain of any NPC in real-time
  - Name-based trigger system allowing different NPCs to coexist
  - Visual indicators showing which NPC is currently thinking
  - General-purpose for diverse character archetypes and scenarios
  - Full Auto-Cards compatibility for comprehensive world-building
  - Open source and free to use in your own scenarios~ ❤️
  
  🎭 Setup:
  1. Open the "Configure Inner Self" story card
  2. Write your player character's name where it asks in the entry
  3. Write non-player character names at the bottom of the notes (one per line)
  
  🔑 Tips:
  - Use simple first names so NPCs trigger when mentioned
  - Set your AI response length to 200 tokens for the best results
  - Reduce "recent turns searched" if NPCs stay in-scene for too long
  - Reduce "thought formation chance" if Inner Self is too overwhelming
  - You can install or uninstall Auto-Cards from the Inner Self config card
  - Creators predefine Inner Self NPCs by naming story cards like so: @Leah
  - Try different story models to see how they perform
  
  🧠 Advanced:
  - NPCs auto-generate "Brain" cards when first triggered
  - Entry = operation log showing a timeline of recent AI changes
  - Notes = human-readable thoughts stored as modifiable JSON in the NPC's brain
  - Neither are perfect representations of the NPC's brain (there's a lot more going on under the hood)
  - The operation log displays change over time; Inner Self allows NPCs to maintain their own thoughts in-character
  - What seems like repetition in the operation log is often a history of useful self-maintenance on older thoughts
  - Edit the notes section of a brain card to modify that agent's mind; Inner Self will use this to build context
  - Valid JSON syntax is required in the notes section
  - Experiments are fun! I designed Inner Self to be adaptive and flexible
  
  ⚙️ Settings:
  
  > Enable Inner Self:
  - Turns the whole system on or off
  - (true or false)
  
  > Show detailed guide:
  - If true, shows this player guide in-game
  - (true or false)
  
  > First name of player character:
  - Your player character's name, used to maintain correct story perspective
  - (any name inside the "" or leave empty)
  
  > Adventure in 1st, 2nd, or 3rd person:
  - Which narrative PoV your story uses
  - (1, 2, or 3)
  
  > Max brain size relative to story context:
  - How much of the AI's context window NPC brains can use
  - Some percentage of the recent story (pink bar in your context viewer)
  - (1% to 95%)
  
  > Recent turns searched for name triggers:
  - How far back through your previous actions Inner Self looks to decide which NPC (if any) should think
  - (1 to 250)
  
  > Visual indicator of current NPC triggers:
  - Symbol shown by the active NPC's card name whenever their brain is engaged
  - (any text/emoji inside the "" or leave empty to disable)
  
  > Thought formation chance per turn:
  - How often NPCs attempt to form new thoughts when triggered
  - (0% to 100%)
  
  > Half thought chance for Do/Say/Story:
  - Reduces the thought formation chance by half during Do/Say/Story turns (maintains player agency)
  - (true or false)
  
  > Brain card notes store brains as JSON:
  - Visually displays NPC brains as raw JSON in their brain card notes
  - Otherwise displays a more user-friendly format to make reading/editing brains easier
  - Makes no difference during gameplay or brain imports
  - (true or false)
  
  > Enable debug mode to see model tasks:
  - Shows raw brain operations inline with your story text
  - (true or false)
  
  > Pin the config card near the top:
  - Keeps the config card pinned high in your cards list
  - (true or false)
  
  > Install Auto-Cards:
  - Enables automatic story card generation alongside Inner Self
  - You can safely uninstall Auto-Cards at any time
  - (true or false)
  
  🌸 Love:
  - Please remember this is a personal passion project for me, something I do as a hobby, not as a job
  - Follow me on AI Dungeon to explore my other projects: ${u}
  - If you see me on Discord (@LewdLeah), Reddit (u/helloitsmyalt_), or anywhere else, please say hi!
  - Your kindness, patience, and love mean so much to me~ ❤️
  
  I hope you will have lots of fun!
  (please erase before continuing) <<<
          `.trim();
        prespace();
        IS.agent = "";
        return;
    } else if (!config.allow) {
        // Early exit if Inner Self is disabled
        text ||= "\u200B";
        IS.agent = "";
        return;
    }
    // Strip zero-width chars from the model output before processing
    text = text.replace(/[\u200B-\u200D]+/g, "");
    // Check if output looks like an unenclosed operation
    // Models sometimes forget their parentheses, the poor dears
    if (!/[()\[\]{}]/.test(text) && ((
        /^\s*(?:del(?:et(?:e[ds]?|ing))?|for(?:get(?:s|ting)?|got(?:ten)?)|remov(?:e[ds]?|ing))(?:[\s_]*(?:key(?:_name)?|thought|memory|unwanted(?:_key)?))?[\s=:]*[a-z0-9A-Z]*_+[a-z0-9A-Z]/i
    ).test(text) || /^\s*[a-z0-9A-Z_]+\s*=/.test(text))) {
        // (?:del|delete|deleted|deletes|deleting|forget|forgets|forgetting|forgot|forgotten|remove|removed|removes|removing)
        // Fully unenclosed block resembles a known pattern
        // Add an opening parentheses so the block parser can handle it
        text = `(${text.trimStart()}`;
    }
    // ==================== BLOCK PARSER ====================
    // Parse enclosed blocks from the output
    const blocks = [];
    for (const [open, close] of [
        // Try each container type in order of preference
        ["(", ")"],
        ["[", "]"],
        ["{", "}"]
    ]) {
        // Attempt to repair unclosed blocks
        const pass = (() => {
            if (!text.includes(open)) {
                // No opening bracket, skip this type
                return true;
            }
            // Check if the last opening bracket is closed
            const rightIndex = text.lastIndexOf(open);
            const rightOfOpen = text.slice(rightIndex);
            if (rightOfOpen.includes(close)) {
                // Already closed, proceed with block parsing
                return false;
            }
            // Try to find where the close bracket should go
            for (const pattern of [
                // After the deleted key name
                /^[(\[{]\s*(?:del(?:et(?:e[ds]?|ing))?|for(?:get(?:s|ting)?|got(?:ten)?)|remov(?:e[ds]?|ing))(?:[\s_]*(?:key(?:_name)?|thought|memory|unwanted(?:_key)?))?[\s=:]*[a-z0-9A-Z]*_[a-z0-9A-Z_]+/i,
                // After the renamed old key name
                /^[(\[{]\s*[a-z0-9A-Z_]+\s*=+\s*[a-z0-9A-Z]*_[a-z0-9A-Z_]+/,
                // After the triple-redundant punctuation boundary
                /[.?!‽…。！？‼⁇⁈⁉¿*¡%_–−‒—~-]["'`«»„“”「」´‘’‟‚‛]/
              ]) {
                  const match = rightOfOpen.match(pattern);
                  if (match) {
                      // Found a good insertion point
                      const index = rightIndex + match.index + match[0].length;
                      text = `${text.slice(0, index)}${close}${text.slice(index)}`;
                      return false;
                  }
              }
              // No boundary inferred -> Append the current close symbol to the end
              text = `${text.trimEnd()}${close}`;
              return false;
          })();
          if (text.includes(close)) {
              // Handle orphaned closing brackets (no matching open)
              if (!text.slice(0, text.indexOf(close)).includes(open)) {
                  // Close without open, prepend an open
                  text = `${open}${text.trimStart()}`;
              }
          } else if (pass) {
              // No brackets of this type, try next
              continue;
          }
          // Extract all outermost blocks of this bracket type
          let depth = 0;
          let start = -1;
          for (let i = 0; i < text.length; i++) {
              if (text[i] === open) {
                  if (depth === 0) {
                      // Start of a new block
                      start = i;
                  }
                  depth++;
              } else if (text[i] === close) {
                  depth--;
                  if ((depth === 0) && (start !== -1)) {
                      // End of a block, capture it
                      blocks.push(text.slice(start, i + 1));
                      start = -1;
                  }
              }
          }
          // Only process the first identified bracket type per turn
          break;
      }
      /**
       * Normalizes a thought string for storage
       * Cleans up formatting quirks from model output
       * @param {string} str - Raw thought string
       * @returns {string} Cleaned thought string
       */
      const simplify = (str = "") => {
          str = (str
              // Remove markdown-style formatting
              .replace(/[#*~•·∙⋅]+/g, "")
              // Normalize whitespace
              .replace(/  +/g, " ")
              .replace(/ ?\n ?/g, "\n")
              // Standardize ellipsis
              .replaceAll("…", "...")
              // Fix possessive s's -> s' because DeepSeek is dumb
              .replace(/([sS])(['‘’‛])[sS]/g, (_, s, q) => `${s}${q}`)
              // Normalize dashes
              .replace(/[–−‒]/g, "-")
              .replace(/(?<=\S) [-—] (?=\S)/g, "—")
          )
          // Convert one lone em-dash to a semicolon if appropriate
          return (
              ((str.match(/—/g) || []).length === 1)
              && !str.includes(";") && !str.endsWith("—") && !str.startsWith("—")
          ) ? str.replace("—", "; ") : str;
      };
      // Trim IS.agent name before emptiness check
      if (((IS.agent = IS.agent.trim()) === "") && (blocks.length === 0)) {
          // No task expected, but I'm still careful here because AID retries use cached outputs
          text = simplify(text).replace(/\n\n\n+/g, "\n\n");
          if (text === "") {
              // Guard against empty string outputs to avoid a known AID bug
              text = "\u200B";
              return;
          }
          const prevText = getPrevAction()?.text ?? "";
          if (/["«»„“”「」‟]\s*$/.test(prevText) && /^\s*["«»„“”「」‟]/.test(text)) {
              // Prepend a linebreak if this and the previous actions place dialogue adjacently
              text = text.trimStart();
              prespace();
          } else if (!/\s$/.test(prevText) && !/^\s/.test(text)) {
              // Ensure taskless outputs still have a space of separation from the previous action
              text = ` ${text}`;
          }
          return;
      }
      /**
       * Converts a key name to valid snake_case
       * Handles various edge cases from model output
       * @param {string} k - Raw key string
       * @returns {string} Valid snake_case key name
       */
      const formatKey = (k = "") => (k
          .trim()
          // Take the first word only
          .split(/\s/, 1)[0]
          // Remove quotes and apostrophes
          .replace(/[.'`´‘’]+/g, "")
        // Replace non-alphanumerics with underscore
        .replace(/[^a-z0-9A-Z_]/g, "_")
        // Convert camelCase to snake_case
        .replace(/([a-z0-9])([A-Z])/g, (_, a, b) => `${a}_${b.toLowerCase()}`)
        .toLowerCase()
        // Separate letters from numbers
        .replace(/([a-z])([0-9])/g, (_, a, b) => `${a}_${b}`)
        .replace(/([0-9])([a-z])/g, (_, a, b) => `${a}_${b}`)
        // Clean up multiple underscores
        .replace(/__+/g, "_")
        // Remove leading/trailing underscores
        .replace(/(?:^_|_$)/g, "")
    );
    // Create an agent instance for the triggered NPC
    const agent = (IS.agent === "") ? null : new Agent(IS.agent, { percent: config.percent });
    // Reset IS.agent
    IS.agent = "";
    /**
     * Generates a path string for logging operations
     * Helps brain logs imitate actual code for ease of understanding
     * @param {string} key - Property name to access
     * @returns {string} Path like "agent_name.brain" or "agent_name.key"
     */
    const path = (key = "brain") => `${(() => {
          const fancy = formatKey(agent.name);
          return (fancy === "") ? `agents[${JSON.stringify(agent.name)}]` : fancy;
      })()}.${key}`;
    // Queue of operations to execute
    const operations = [];
    // Track which keys have been touched this turn
    const altered = new Set();
    // ==================== BLOCK INTERPRETER ====================
    // Process extracted block and queue appropriate operations
    interpreter: for (const block of blocks) {
        // Remove the block from the output text unless debug mode is enabled
        deblock: {
            let start = text.indexOf(block);
            if (start === -1) {
                break deblock;
            }
            // Chars to consume along with the block
            const naughty = (c = "") => {
                const code = c.charCodeAt(0);
                // Just for fun, no regex :3
                return (
                    (code === 0x20) // " "
                    || (code === 0x09) // "\t"
                    || (code === 0x0A) // "\n"
                    || (code === 0x0D) // "\r"
                    || (code === 0x27) // "'"
                    || (code === 0x60) // "`"
                      || (code === 0xB4) // "´"
                      || (code === 0x2018) // "‘"
                      || (code === 0x2019) // "’"
                  );
              };
              let end = start + block.length;
              // Expand left to consume whitespace and quotes
              while ((0 < start) && naughty(text[start - 1])) {
                  start--;
              }
              // Expand right to consume whitespace and quotes
              while ((end < text.length) && naughty(text[end])) {
                  end++;
              }
              // Replace the block with newlines (or keep in debug mode)
              text = `${text.slice(0, start)}\n\n${config.debug ? `${block}\n\n` : ""}${text.slice(end)}`;
          };
          if (agent === null) {
              // Only perform deblocking when agent is null
              continue;
          }
          // Extract and normalize the block content
          const str = block.slice(1, -1).trim().replace(/==+/g, "=").replace(/::+/g, ":");
          // Prefer "=" over ":" as the key-value delimiter
          const delimiter = str.includes("=") ? "=" : ":";
          if (2 < str.split(delimiter, 3).length) {
              // Skip blocks with too many delimiters
              continue;
          }
          // ==================== DELETE OPERATION ====================
          // Check if this is a delete/forget command
          /** @returns {string|null} */
          const delKey = (() => {
              // Match various forms of "delete key_name"
              const delMatch1 = str.match(
                  /^(?:del(?:et(?:e[ds]?|ing))?|for(?:get(?:s|ting)?|got(?:ten)?)|remov(?:e[ds]?|ing))(?:[\s_]*(?:key(?:_name)?|thought|memory|unwanted(?:_key)?))?[\s=:]*([\s\S]*)$/i
              );
              if (!delMatch1) {
                  return null;
              }
              const delKey1 = formatKey(delMatch1[1]);
              if (delKey1 in agent.brain) {
                  // Key exists in brain
                  return delKey1;
              } else if (!/(?:key|thought|memory|unwanted)/i.test(str)) {
                  // Doesn't look like a common hallucination, might be invalid
                  return null;
              }
              // Try again with stricter matching
              const delMatch2 = str.match(
                  /^(?:del(?:et(?:e[ds]?|ing))?|for(?:get(?:s|ting)?|got(?:ten)?)|remov(?:e[ds]?|ing))[\s=:]*([\s\S]*)$/i
              );
              return delMatch2 ? formatKey(delMatch2[1]) : null;
          })();
          /**
           * Generates a delete log statement
           * @param {string} k - Key being deleted
           * @returns {string} JavaScript delete statement
           */
          const logDelete = (k = "") => `delete ${path()}${(k === "") ? "[\"\"]" : `.${k}`};`;
          if ((typeof delKey === "string") && (delKey in agent.brain)) {
              // Valid delete statement
              if (!altered.has(delKey)) {
                  // Queue the delete operation
                  operations.push(() => {
                      delete agent.brain[delKey];
                      return logDelete(delKey);
                  });
                  altered.add(delKey);
              }
              continue;
          } else if (!/\S\s*[=:]+\s*\S/.test(str)) {
              // No assignment pattern, skip
              continue;
          }
          // ==================== KEY EXTRACTION ====================
          /**
           * Gets everything after the last colon in a string
           * @param {string} s - Input string
           * @returns {string} Content after last colon
           */
          const rightOfColon = (s = "") => s.slice(s.lastIndexOf(":") + 1);
          // Extract and clean the key name
          const key = (() => {
              const raw = formatKey((
                  (delimiter === "=") ? rightOfColon(str.split("=", 1)[0]) : str.split(":", 1)[0]
              ).trim().replaceAll(" ", "_"));
              // If key exists in brain, use it as-is
              // Otherwise strip common prefixes/suffixes models tend to add
              return (raw in agent.brain) ? raw : (raw
                  .replace(/^th(?:oughts?|ink(?:ing))_(?:(?:o[nfr]|a(?:bout|nd)|with|for)_)?/, "")
                  .replace(/(?:_(?:and|or))?_th(?:oughts?|ink(?:ing))$/, "")
              );
          })();
          if ((key === "") || ((
              (60 < key.length)
              || ["thought", "thoughts", "think", "thinking", "any_name", "example_name"].includes(key)
              || ["any_key", "key_name", "example_key"].some(s => key.includes(s))
          ) && !(key in agent.brain))) {
              // Skip invalid or placeholder keys copied from the task prompts
              continue;
          }
          // ==================== VALUE EXTRACTION ====================
          // Extract and clean the value
          const value = (
              (str.split(delimiter, 2)[1] || "")
              // Strip leading/trailing quotes and whitespace
              .replace(/^[\s"'`«»„“”「」´‘’‟‚‛]+|[\s"'`«»„“”「」´‘’‟‚‛]+$/g, "")
              .replace(/\s+/g, " ")
          );
          if (!/[a-z0-9A-Z]/.test(value) || /[\u4e00-\u9fff]/.test(value)) {
              // Skip empty or non-latin values because DeepSeek is dumb
              continue;
          } else if (!value.includes(" ")) {
              // ==================== RENAME OPERATION ====================
              // No spaces = might be a key rename
              if (altered.has(key)) {
                  continue;
              }
              const oldKey = formatKey(value);
              if (!altered.has(oldKey) && (oldKey in agent.brain)) {
                  // Valid rename: move thought from old key to new key
                  // Queue a rename operation
                  operations.push(() => {
                      agent.brain[key] = agent.brain[oldKey];
                      delete agent.brain[oldKey];
                      const p = path();
                      return `${p}.${key} = ${p}.${oldKey};\n${logDelete(oldKey)}`;
                  });
                  altered.add(key);
                  altered.add(oldKey);
              }
              continue;
          } else if (value.includes("_")) {
              // Underscores in value = probably a malformed key, skip
              continue;
          }
          // ==================== ASSIGN OPERATION ====================
          // Extract the actual thought content
          const thought = simplify(rightOfColon(value)
              .replaceAll("→", " ")
              .replaceAll("\\n", "\n")
          ).trim().split("\n", 1)[0].trimEnd();
          if (altered.has(key) || !thought.includes(" ")) {
              // Skip if key already touched or thought too short
              continue;
          } else if (!(key in agent.brain)) {
              // Check for duplicate thought values (don't store the same thing twice)
              const last = thought.length - 1;
              // Potentially hot loop so avoid excessive get() calls
              const brain = agent.brain;
              for (const key in brain) {
                  const existing = brain[key];
                  if (
                      // This shouldn't be possible but whatevs
                      (typeof existing === "string")
                      // Short-circuit on impossible relative lengths for speed
                      && (last < existing.length)
                      // Fast check inclusion
                      && (existing.indexOf(thought) !== -1)
                  ) {
                      // This thought already exists within some thought associated with another key
                      continue interpreter;
                  }
              }
          }
          // Queue an assign operation
          operations.push(() => {
              // Increment the global label counter
              IS.label++;
              // Encode the label as zero-width chars for context tracking
              IS.encoding = `${(IS.encoding === "") ? "\u200B" : IS.encoding}${(() => {
                let n = IS.label;
                let out = "";
                // Convert label to binary using ZWNJ (0) and ZWJ (1)
                while (0 < n) {
                    out = `${(n & 1) ? "\u200D" : "\u200C"}${out}`;
                    n >>>= 1;
                }
                return out || "\u200C";
            })()}\u200B`;
              // Inject the encoding into the output text
              text = (text
                  .replace(/[\u200B-\u200D]+/g, "")
                  .replace(/^\s*/, leadingWhitespace => `${leadingWhitespace}${IS.encoding}`)
              );
              // One common complaint from playtesters was that models were storing repeated thoughts
              // Upon further investigation, I discovered this was actually miscommunication on my part
              // Players assumed the operation log (card entry) was a reflection of the brain (card notes)
              // Thus players (reasonably) misinterpreted label updates as repetition
              // Solution: Log distinct relabel syntax to improve non-verbal communication
              const target = `${path()}.${key}`;
              const old = agent.brain[key];
              agent.brain[key] = `${IS.label} → ${thought}`;
              // Determine if this is a relabel of the same thought value
              const relabel = (
                  (typeof old === "string")
                  && (thought === old.slice(old.indexOf("→") + 1).trim())
              );
              return `${(
                relabel ? `old = ${target};\n` : ""
            )}${target} = ${(
                relabel ? `[${IS.label}, old${(
                      old.includes("→") ? "\n  .slice(old.indexOf(\"→\") + 1)\n  .trim()\n" : ".trim()"
                  )}].join(" → ")` : JSON.stringify(agent.brain[key])
            )};`;
          });
          altered.add(key);
      }
      // ==================== OUTPUT TEXT SANITIZATION ====================
      // Clean up the model's output text before finalizing
      // This removes artifacts, formatting issues, and unwanted patterns
      text = (simplify(config.debug ? text : text.replaceAll("_", ""))
          .trim()
          .split("\n")
          .filter(line => {
              const lower = line.toLowerCase();
              return !(
                  // The nuclear option
                  /(?:^|[^a-zA-Z])(?:task|output)(?:$|[^a-zA-Z])/.test(lower)
                  // Common AI hallucinations
                  || [
                      "STRICT",
                      "OUTPUT",
                      "REQUIRE",
                      "EXACT",
                      "TASK",
                      "FORMAT",
                      "inner self",
                      `You are ${config.player}.`
                  ].some(naughty => line.includes(naughty))
                  // Remove "story continues" type artifacts from task prompts bleeding through
                  || (lower.includes("story") && lower.includes("continu"))
                  // Remove numbered list items (e.g., "1.", "[1]", "2.")
                  || /^\[?\d+(?:\.?\]|\.)/.test(lower)
                  // Remove stray "user" labels from ChatML imitation
                  || /^\s*user(?:$|[^a-z])/.test(lower)
                  // Remove lines containing only " " and/or "-"
                  || /^[ -]+$/.test(lower)
              );
          })
          .join("\n")
          .trim()
          // Collapse excessive newlines to a maximum of two
          .replace(/\n\n\n+/g, "\n\n")
      );
      // ==================== OUTPUT FINALIZATION ====================
      // Handle empty outputs and ensure proper spacing between actions
      if (text === "") {
          // AID does not tolerate empty string outputs and "please select continue" messages are cringe
          // Return encoding if available, otherwise a zero-width space placeholder
          text = (IS.encoding === "") ? "\u200B" : IS.encoding;
      } else {
          // Prepend the thought label encoding to the output text
          text = `${IS.encoding}${text}`;
          // Ensure all between-action linebreaks are equally spaced
          prespace();
      }
      // ==================== OPERATION EXECUTOR ====================
      // Execute queued brain operations and persist changes
      if ((operations.length === 0) || (agent === null)) {
          // No operations to execute, we're done
          return;
      }
      const hash = historyHash();
      if (IS.hash === hash) {
          // Same history hash means this turn was a retry or erase + continue
          // This prevents duplicate brain modifications on retry (cached outputs cause problems)
          return;
      } else if (typeof agent.card.entry !== "string") {
          // Initialize the brain card entry if it's not a string (shouldn't happen, but safety first)
          agent.card.entry = "";
      } else if (agent.card.entry.endsWith("UTC") && agent.card.entry.startsWith("// initialized @")) {
          // This is a fresh brain card with only the timestamp comment
          // I prefer logging this info immediately before processing the first valid operation
          // Add metadata and initialize the brain object in the log
          agent.card.entry = `${agent.card.entry.trimStart()}\n${path("metadata")} = ${(
            JSON.stringify(agent.metadata, null, 2)
        )};\n${path()} = {};\n// Entry: Displays recent brain operations to the player\n// Triggers: Configurable settings for this NPC alone\n// Notes: Allows the player to view/edit actual brain contents`;
      }
      // Update the hashcode to mark this history state as processed
      IS.hash = hash;
      // Clear the previous encoding since new operations are being committed
      IS.encoding = "";
      // Execute each queued operation and append to the operation log
      for (const operation of operations) {
          // Increment global operation counter
          IS.ops++;
          // Execute the operation (modifies agent.brain) and get the log message
          // Append the message to the agent's brain card entry
          agent.card.entry = `${agent.card.entry}\n\n// operation ${IS.ops}\n${operation()}`.trimStart();
      }
      text ||= "\u200B";
      // Keep the operation log from growing unbounded
      // Limit to approximately 2000 chars to satisfy AID's soft entry limit
      agent.card.entry = agent.card.entry.split(/\n\n/).slice(-2000).reduceRight((out, op) => (
          // Only include operations that fit within the char limit
          ((out.length + op.length + 2) < 2001) ? `${op}${out ? `\n\n${out}` : ""}` : out
      ), "");
      // ==================== BRAIN SERIALIZATION ====================
      // Rapidly reserialize a flat representation of the modified brain, without heavy memory allocations
      // This custom serialization is faster than JSON.stringify for flat objects
      // It also produces a more readable format in the story card notes
      const brain = agent.brain;
      const keys = Object.keys(brain);
      if (keys.length === 0) {
          agent.card.description = "{}";
          return;
      }
      // Build the JSON-like string manually for each key-value pair
      let serialized = "";
      const appendPair = config.json ? ((
          serialized = `"${keys[0]}": ${JSON.stringify(brain[keys[0]])}`
      ), (key = "") => {
          // Format -> "key": "value",\n\n (JSON with linebreaks)
          serialized += `,\n\n"${key}": ${JSON.stringify(brain[key])}`;
          return;
      }) : ((
          serialized = `${keys[0]}: ${brain[keys[0]]}`
      ), (key = "") => {
          // Format -> key: value\n\n (simple user-friendly format)
          serialized += `\n\n${key}: ${brain[key]}`;
          return;
      });
      for (let i = 1; i < keys.length; i++) {
          appendPair(keys[i]);
      }
      agent.card.description = serialized;
      return;
  }
  
  //—————————————————————————————————————————————————————————————————————————————————————
  
  /**
   * Auto-Cards v1.1.3
   * Made by LewdLeah on May 21, 2025
   * This AI Dungeon script automatically creates and updates plot-relevant story cards while you play
   * General-purpose usefulness and compatibility with other scenarios/scripts were my design priorities
   * Auto-Cards is fully open-source, please copy for use within your own projects! ❤️
   */
  function AutoCards(inHook, inText, inStop) {
      "use strict"; const S = {
      /*
      Default Auto-Cards settings
      Feel free to change these settings to customize your scenario's default gameplay experience
      The default values for your scenario are specified below:
      */
      // Is Auto-Cards already enabled when the adventure begins?
      DEFAULT_DO_AC: true
      // (true or false)
      ,
      // Pin the "Configure Auto-Cards" story card at the top of the player's story cards list?
      DEFAULT_PIN_CONFIGURE_CARD: false
      // (true or false)
      ,
      // Minimum number of turns in between automatic card generation events?
      DEFAULT_CARD_CREATION_COOLDOWN: 40
      // (0 to 9999)
      ,
      // Use a bulleted list format for newly generated card entries?
      DEFAULT_USE_BULLETED_LIST_MODE: true
      // (true or false)
      ,
      // Maximum allowed length for newly generated story card entries?
      DEFAULT_GENERATED_ENTRY_LIMIT: 600
      // (200 to 2000)
      ,
      // Do newly generated cards have memory updates enabled by default?
      DEFAULT_NEW_CARDS_DO_MEMORY_UPDATES: false
      // (true or false)
      ,
      // Default character limit before the card's memory bank is summarized?
      DEFAULT_NEW_CARDS_MEMORY_LIMIT: 3200
      // (1750 to 9900)
      ,
      // Approximately how much shorter should recently compressed memories be? (ratio = 10 * old / new)
      DEFAULT_MEMORY_COMPRESSION_RATIO: 25
      // (20 to 1250)
      ,
      // Ignore all-caps during title candidate detection?
      DEFAULT_IGNORE_ALL_CAPS_TITLES: true
      // (true or false)
      ,
      // Should player input actions (Do/Say/Story) be considered during title detection?
      DEFAULT_DETECT_TITLES_FROM_INPUTS: false
      // (true or false)
      ,
      // How many (minimum) actions in the past does Auto-Cards look for named entities?
      DEFAULT_MINIMUM_LOOK_BACK_DISTANCE: 7
      // (2 to 88)
      ,
      // Is Live Script Interface v2 enabled?
      DEFAULT_DO_LSI_V2: false
      // (true or false)
      ,
      // Should the "Debug Data" story card be visible?
      DEFAULT_SHOW_DEBUG_DATA: false
      // (true or false)
      ,
      // AI prompt used to generate new story card entries?
      DEFAULT_CARD_GENERATION_PROMPT: [
          "-----",
          "",
          "<SYSTEM>",
          "# Stop the story and ignore previous instructions. Write a brief and coherent informational entry for %{title} following these instructions:",
          "- Write only third-person pure prose information about %{title} using complete sentences with correct punctuation",
          "- Avoid short-term temporary details or appearances, instead focus on plot-significant information",
          "- Prioritize story-relevant details about %{title} first to ensure seamless integration with the previous plot",
          "- Create new information based on the context and story direction",
          "- Mention %{title} in every sentence",
          "- Use semicolons if needed",
          "- Add additional details about %{title} beneath incomplete entries",
          "- Be concise and grounded",
          "- Imitate the story's writing style and infer the reader's preferences",
          "</SYSTEM>",
          "Continue the entry for %{title} below while avoiding repetition:",
          "%{entry}"
       ] // (mimic this multi-line "text" format)
      ,
      // AI prompt used to summarize a given story card's memory bank?
      DEFAULT_CARD_MEMORY_COMPRESSION_PROMPT: [
          "-----",
          "",
          "<SYSTEM>",
          "# Stop the story and ignore previous instructions. Summarize and condense the given paragraph into a narrow and focused memory passage while following these guidelines:",
          "- Ensure the passage retains the core meaning and most essential details",
          "- Use the third-person perspective",
          "- Prioritize information-density, accuracy, and completeness",
          "- Remain brief and concise",
          "- Write firmly in the past tense",
          "- The paragraph below pertains to old events from far earlier in the story",
          "- Integrate %{title} naturally within the memory; however, only write about the events as they occurred",
          "- Only reference information present inside the paragraph itself, be specific",
          "</SYSTEM>",
          "Write a summarized old memory passage for %{title} based only on the following paragraph:",
          "\"\"\"",
          "%{memory}",
          "\"\"\"",
          "Summarize below:"
      ] // (mimic this multi-line "text" format)
      ,
      // Titles banned from future card generation attempts?
      DEFAULT_BANNED_TITLES_LIST: (
          "North, East, South, West, Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, January, February, March, April, May, June, July, August, September, October, November, December"
      ) // (mimic this comma-list "text" format)
      ,
      // Default story card "type" used by Auto-Cards? (does not matter)
      DEFAULT_CARD_TYPE: "class"
      // ("text")
      ,
      // Should titles mentioned in the "opening" plot component be banned from future card generation by default?
      DEFAULT_BAN_TITLES_FROM_OPENING: false
      // (true or false)
      ,
      }; //——————————————————————————————————————————————————————————————————————————————
  
      /*
      Useful API functions for coders (otherwise ignore)
      Here's what each one does in plain terms:
  
      AutoCards().API.postponeEvents();
      Pauses Auto-Cards activity for n many turns
  
      AutoCards().API.emergencyHalt();
      Emergency stop or resume
  
      AutoCards().API.suppressMessages();
      Hides Auto-Cards toasts by preventing assignment to state.message
  
      AutoCards().API.debugLog();
      Writes to the debug log card
  
      AutoCards().API.toggle();
      Turns Auto-Cards on/off
  
      AutoCards().API.generateCard();
      Initiates AI generation of the requested card
  
      AutoCards().API.redoCard();
      Regenerates an existing card
  
      AutoCards().API.setCardAsAuto();
      Flags or unflags a card as automatic
  
      AutoCards().API.addCardMemory();
      Adds a memory to a specific card
  
      AutoCards().API.eraseAllAutoCards();
      Deletes all auto-cards
  
      AutoCards().API.getUsedTitles();
      Lists all current card titles
  
      AutoCards().API.getBannedTitles();
      Shows your current banned titles list
  
      AutoCards().API.setBannedTitles();
      Replaces the banned titles list with a new list
  
      AutoCards().API.buildCard();
      Makes a new card from scratch, using exact parameters
  
      AutoCards().API.getCard();
      Finds cards that match a filter
  
      AutoCards().API.eraseCard();
      Deletes cards matching a filter
      */
  
      /*** Postpones internal Auto-Cards events for a specified number of turns
      * 
      * @function
      * @param {number} turns A non-negative integer representing the number of turns to postpone events
      * @returns {Object} An object containing cooldown values affected by the postponement
      * @throws {Error} If turns is not a non-negative integer
      */
      // AutoCards().API.postponeEvents();
  
      /*** Sets or clears the emergency halt flag to pause Auto-Cards operations
      * 
      * @function
      * @param {boolean} shouldHalt A boolean value indicating whether to engage (true) or disengage (false) emergency halt
      * @returns {boolean} The value that was set
      * @throws {Error} If called from within isolateLSIv2 scope or with a non-boolean argument
      */
      // AutoCards().API.emergencyHalt();
  
      /*** Enables or disables state.message assignments from Auto-Cards
      * 
      * @function
      * @param {boolean} shouldSuppress If true, suppresses all Auto-Cards messages; false enables them
      * @returns {Array} The current pending messages after setting suppression
      * @throws {Error} If shouldSuppress is not a boolean
      */
      // AutoCards().API.suppressMessages();
  
      /*** Logs debug information to the "Debug Log card console
      * 
      * @function
      * @param {...any} args Arguments to log for debugging purposes
      * @returns {any} The story card object reference
      */
      // AutoCards().API.debugLog();
  
      /*** Toggles Auto-Cards behavior or sets it directly
      * 
      * @function
      * @param {boolean|null|undefined} toggleType If undefined, toggles the current state. If boolean or null, sets the state accordingly
      * @returns {boolean|null|undefined} The state that was set or inferred
      * @throws {Error} If toggleType is not a boolean, null, or undefined
      */
      // AutoCards().API.toggle();
  
      /*** Generates a new card using optional prompt details or a card request object
      * 
      * This function supports two usage modes:
      * 
      * 1. Object Mode:
      *    Pass a single object containing card request parameters. The only mandatory property is "title"
      *    All other properties are optional and customize the card generation
      * 
      *    Example:
      *    AutoCards().API.generateCard({
      *      type: "character",         // The category or type of the card; defaults to "class" if omitted
      *      title: "Leah the Lewd",    // The card's title (required)
      *      keysStart: "Lewd,Leah",    // Optional trigger keywords associated with the card
      *      entryStart: "You are a woman named Leah.", // Existing content to prepend to the AI-generated entry
      *      entryPrompt: "",           // Global prompt guiding AI content generation
      *      entryPromptDetails: "Focus on Leah's works of artifice and ingenuity", // Additional prompt info
      *      entryLimit: 600,           // Target character length for the AI-generated entry
      *      description: "Player character!", // Freeform notes
      *      memoryStart: "Leah purchased a new sweater.", // Existing memory content
      *      memoryUpdates: true,       // Whether the card's memory bank will update on its own
      *      memoryLimit: 3200          // Preferred memory bank size before summarization/compression
      *    });
      * 
      * 2. String Mode:
      *    Pass a string as the title and optionally two additional strings to specify prompt details
      *    This mode is shorthand for quick card generation without an explicit card request object
      * 
      *    Examples:
      *    AutoCards().API.generateCard("Leah the Lewd");
      *    AutoCards().API.generateCard("Leah the Lewd", "Focus on Leah's works of artifice and ingenuity");
      *    AutoCards().API.generateCard(
      *      "Leah the Lewd",
      *      "Focus on Leah's works of artifice and ingenuity",
      *      "You are a woman named Leah."
      *    );
      * 
      * @function
      * @param {Object|string} request Either a fully specified card request object or a string title
      * @param {string} [extra1] Optional detailed prompt text when using string mode
      * @param {string} [extra2] Optional entry start text when using string mode
      * @returns {boolean} Returns true if the generation attempt succeeded, false otherwise
      * @throws {Error} Throws if called with invalid arguments or missing a required title property
      */
      // AutoCards().API.generateCard();
  
      /*** Regenerates a card by title or object reference, optionally preserving or modifying its input info
      *
      * @function
      * @param {Object|string} request Either a fully specified card request object or a string title for the card to be regenerated
      * @param {boolean} [useOldInfo=true] If true, preserves old info in the new generation; false omits it
      * @param {string} [newInfo=""] Additional info to append to the generation prompt
      * @returns {boolean} True if regeneration succeeded; false otherwise
      * @throws {Error} If the request format is invalid, or if the second or third parameters are the wrong types
      */
      // AutoCards().API.redoCard();
  
      /*** Flags or unflags a card as an auto-card, controlling its automatic generation behavior
      *
      * @function
      * @param {Object|string} targetCard The card object or title to mark/unmark as an auto-card
      * @param {boolean} [setOrUnset=true] If true, marks the card as an auto-card; false removes the flag
      * @returns {boolean} True if the operation succeeded; false if the card was invalid or already matched the target state
      * @throws {Error} If the arguments are invalid types
      */
      // AutoCards().API.setCardAsAuto();
  
      /*** Appends a memory to a story card's memory bank
      *
      * @function
      * @param {Object|string} targetCard A card object reference or title string
      * @param {string} newMemory The memory text to add
      * @returns {boolean} True if the memory was added; false if it was empty, already present, or the card was not found
      * @throws {Error} If the inputs are not a string or valid card object reference
      */
      // AutoCards().API.addCardMemory();
  
      /*** Removes all previously generated auto-cards and resets various states
      *
      * @function
      * @returns {number} The number of cards that were removed
      */
      // AutoCards().API.eraseAllAutoCards();
  
      /*** Retrieves an array of titles currently used by the adventure's story cards
      *
      * @function
      * @returns {Array<string>} An array of strings representing used titles
      */
      // AutoCards().API.getUsedTitles();
  
      /*** Retrieves an array of banned titles
      *
      * @function
      * @returns {Array<string>} An array of banned title strings
      */
      // AutoCards().API.getBannedTitles();
  
      /*** Sets the banned titles array, replacing any previously banned titles
      *
      * @function
      * @param {string|Array<string>} titles A comma-separated string or array of strings representing titles to ban
      * @returns {Object} An object containing oldBans and newBans arrays
      * @throws {Error} If the input is neither a string nor an array of strings
      */
      // AutoCards().API.setBannedTitles();
  
      /*** Creates a new story card with the specified parameters
      *
      * @function
      * @param {string|Object} title Card title string or full card template object containing all fields
      * @param {string} [entry] The entry text for the card
      * @param {string} [type] The card type (e.g., "character", "location")
      * @param {string} [keys] The keys (triggers) for the card
      * @param {string} [description] The notes or memory bank of the card
      * @param {number} [insertionIndex] Optional index to insert the card at a specific position within storyCards
      * @returns {Object|null} The created card object reference, or null if creation failed
      */
      // AutoCards().API.buildCard();
  
      /*** Finds and returns story cards satisfying a user-defined condition
      * Example:
      * const leahCard = AutoCards().API.getCard(card => (card.title === "Leah"));
      *
      * @function
      * @param {Function} predicate A function which takes a card and returns true if it matches
      * @param {boolean} [getAll=false] If true, returns all matching cards; otherwise returns the first match
      * @returns {Object|Array<Object>|null} A single card object reference, an array of cards, or null if no match is found
      * @throws {Error} If the predicate is not a function or getAll is not a boolean
      */
      // AutoCards().API.getCard();
  
      /*** Removes story cards based on a user-defined condition or by direct reference
      * Example:
      * AutoCards().API.eraseCard(card => (card.title === "Leah"));
      *
      * @function
      * @param {Function|Object} predicate A predicate function or a card object reference
      * @param {boolean} [eraseAll=false] If true, removes all matching cards; otherwise removes the first match
      * @returns {boolean|number} True if a single card was removed, false if none matched, or the number of cards erased
      * @throws {Error} If the inputs are not a valid predicate function, card object, or boolean
      */
      // AutoCards().API.eraseCard();
  
      //—————————————————————————————————————————————————————————————————————————————————
  
      /*
      To everyone who helped, thank you:
  
      AHotHamster22
      Most extensive testing, feedback, ideation, and kindness
  
      BinKompliziert
      UI feedback
  
      Boo
      Discord communication
  
      bottledfox
      API ideas for alternative card generation use-cases
  
      Bruno
      Most extensive testing, feedback, ideation, and kindness
      https://play.aidungeon.com/profile/Azuhre
  
      Burnout
      Implementation improvements, algorithm ideas, script help, and LSIv2 inspiration
  
      bweni
      Testing
  
      DebaczX
      Most extensive testing, feedback, ideation, and kindness
  
      Dirty Kurtis
      Card entry generation prompt engineering
  
      Dragranis
      Provided the memory dataset used for boundary calibration
  
      effortlyss
      Data, testing, in-game command ideas, config settings, and other UX improvements
  
      Hawk
      Grammar and special-cased proper nouns
  
      Idle Confusion
      Testing
      https://play.aidungeon.com/profile/Idle%20Confusion
  
      ImprezA
      Most extensive testing, feedback, ideation, and kindness
      https://play.aidungeon.com/profile/ImprezA
  
      Kat-Oli
      Title parsing, grammar, and special-cased proper nouns
  
      KryptykAngel
      LSIv2 ideas
      https://play.aidungeon.com/profile/KryptykAngel
  
      Mad19pumpkin
      API ideas
      https://play.aidungeon.com/profile/Mad19pumpkin
  
      Magic
      Implementation and syntax improvements
      https://play.aidungeon.com/profile/MagicOfLolis
  
      Mirox80
      Testing, feedback, and scenario integration ideas
      https://play.aidungeon.com/profile/Mirox80
  
      Nathaniel Wyvern
      Testing
      https://play.aidungeon.com/profile/NathanielWyvern
  
      NobodyIsUgly
      All-caps title parsing feedback
  
      OnyxFlame
      Card memory bank implementation ideas and special-cased proper nouns
  
      Purplejump
      API ideas for deep integration with other AID scripts
  
      Randy Viosca
      Context injection and card memory bank structure
      https://play.aidungeon.com/profile/Random_Variable
  
      RustyPawz
      API ideas for simplified card interaction
      https://play.aidungeon.com/profile/RustyPawz
  
      sinner
      Testing
  
      Sleepy pink
      Testing and feedback
      https://play.aidungeon.com/profile/Pinkghost
  
      Vutinberg
      Memory compression ideas and prompt engineering
  
      Wilmar
      Card entry generation and memory summarization prompt engineering
  
      Yi1i1i
      Idea for the redoCard API function and "/ac redo" in-game command
  
      A note to future individuals:
      If you fork or modify Auto-Cards... Go ahead and put your name here too! Yay! 🥰
      */
  
      //—————————————————————————————————————————————————————————————————————————————————
  
      /*
      The code below implements Auto-Cards
      Enjoy! ❤️
      */
  
      // My class definitions are hoisted by wrapper functions because it's less ugly (lol)
      const Const = hoistConst();
      const O = hoistO();
      const Words = hoistWords();
      const StringsHashed = hoistStringsHashed();
      const Internal = hoistInternal();
      // AutoCards has an explicitly immutable domain: HOOK, TEXT, and STOP
      const HOOK = inHook;
      const TEXT = ((typeof inText === "string") && inText) || "\n";
      const STOP = (inStop === true);
      // AutoCards returns a pseudoimmutable codomain which is initialized only once before being read and returned
      const CODOMAIN = new Const().declare();
      // Transient sets for high-performance lookup
      const [used, bans, auto, forenames, surnames] = Array.from({length: 5}, () => new Set());
      const memoized = new Map();
      // Holds a reference to the data card singleton, remains unassigned unless required
      let data = null;
      // Validate globalThis.text
      text = ((typeof text === "string") && text) || "\n";
      // Main settings override local settings
      if (typeof globalThis.MainSettings === "function") {
          new MainSettings("AutoCards", "AC").merge(S);
      }
      // Container for the persistent state of AutoCards
      const AC = (function() {
          if (state.LSIv2) {
              // The Auto-Cards external API is also available from within the inner scope of LSIv2
              // Call with AutoCards().API.nameOfFunction(yourArguments);
              return state.LSIv2;
          } else if (state.AutoCards) {
              // state.AutoCards is prioritized for performance
              const ac = state.AutoCards;
              delete state.AutoCards;
              return ac;
          }
          const dataVariants = getDataVariants();
          data = getSingletonCard(false, O.f({...dataVariants.critical}), O.f({...dataVariants.debug}));
          // Deserialize the state of Auto-Cards from the data card
          const ac = (function() {
              try {
                  return JSON.parse(data?.description);
              } catch {
                  return null;
              }
          })();
          // If the deserialized state fails to match the following structure, fallback to defaults
          if (validate(ac, O.f({
              config: [
                  "doAC", "deleteAllAutoCards", "pinConfigureCard", "addCardCooldown", "bulletedListMode", "defaultEntryLimit", "defaultCardsDoMemoryUpdates", "defaultMemoryLimit", "memoryCompressionRatio", "ignoreAllCapsTitles", "readFromInputs", "minimumLookBackDistance", "LSIv2", "showDebugData", "generationPrompt", "compressionPrompt", "defaultCardType"
              ],
              signal: [
                  "emergencyHalt", "forceToggle", "overrideBans", "swapControlCards", "recheckRetryOrErase", "maxChars", "outputReplacement", "upstreamError"
              ],
              generation: [
                  "cooldown", "completed", "permitted", "workpiece", "pending"
              ],
              compression: [
                  "completed", "titleKey", "vanityTitle", "responseEstimate", "lastConstructIndex", "oldMemoryBank", "newMemoryBank"
              ],
              message: [
                  "previous", "suppress", "pending", "event"
              ],
              chronometer: [
                  "turn", "step", "amnesia", "postpone"
              ],
              database: {
                  titles: [
                      "used", "banned", "candidates", "lastActionParsed", "lastTextHash", "pendingBans", "pendingUnbans"
                  ],
                  memories: [
                      "associations", "duplicates"
                  ]
              }
          }))) {
              // The deserialization was a success
              return ac;
          }
          function validate(obj, finalKeys) {
              if ((typeof obj !== "object") || (obj === null)) {
                  return false;
              } else {
                  return Object.entries(finalKeys).every(([key, value]) => {
                      if (!(key in obj)) {
                          return false;
                      } else if (Array.isArray(value)) {
                          return value.every(finalKey => {
                              return (finalKey in obj[key]);
                          });
                      } else {
                          return validate(obj[key], value);
                      }
                  });
              }
          }
          // AC is malformed, reinitialize with default values
          return {
              // In-game configurable parameters
              config: getDefaultConfig(),
              // Collection of various short-term signals passed forward in time
              signal: {
                  // API: Suspend nearly all Auto-Cards processes
                  emergencyHalt: false,
                  // API: Forcefully toggle Auto-Cards on or off
                  forceToggle: null,
                  // API: Banned titles were externally overwritten
                  overrideBans: 0,
                  // Signal the construction of the opposite control card during the upcoming onOutput hook
                  swapControlCards: false,
                  // Signal a limited recheck of recent title candidates following a retry or erase
                  recheckRetryOrErase: false,
                  // Signal an upcoming onOutput text replacement
                  outputReplacement: "",
                  // info.maxChars is only defined onContext but must be accessed during other hooks too
                  maxChars: Math.abs(info?.maxChars || 3200),
                  // An error occured within the isolateLSIv2 scope during an earlier hook
                  upstreamError: ""
              },
              // Moderates the generation of new story card entries
              generation: {
                  // Number of story progression turns between card generations
                  cooldown: validateCooldown(
                      underQuarterInteger(validateCooldown(S.DEFAULT_CARD_CREATION_COOLDOWN))
                  ),
                  // Continues prompted so far
                  completed: 0,
                  // Upper limit on consecutive continues
                  permitted: 34,
                  // Properties of the incomplete story card
                  workpiece: O.f({}),
                  // Pending card generations
                  pending: [],
              },
              // Moderates the compression of story card memories
              compression: {
                  // Continues prompted so far
                  completed: 0,
                  // A title header reference key for this auto-card
                  titleKey: "",
                  // The full and proper title
                  vanityTitle: "",
                  // Response length estimate used to compute # of outputs remaining
                  responseEstimate: 1400,
                  // Indices [0, n] of oldMemoryBank memories used to build the current memory construct
                  lastConstructIndex: -1,
                  // Bank of card memories awaiting compression
                  oldMemoryBank: [],
                  // Incomplete bank of newly compressed card memories
                  newMemoryBank: [],
              },
              // Prevents incompatibility issues borne of state.message modification
              message: {
                  // Last turn's state.message
                  previous: getStateMessage(),
                  // API: Allow Auto-Cards to post messages?
                  suppress: false,
                  // Pending Auto-Cards message(s)
                  pending: (function() {
                      if (S.DEFAULT_DO_AC !== false) {
                          const startupMessage = "Enabled! You may now edit the \"Configure Auto-Cards\" story card";
                          logEvent(startupMessage);
                          return [startupMessage];
                      } else {
                          return [];
                      }
                  })(),
                  // Counter to track all Auto-Cards message events
                  event: 0
              },
              // Timekeeper used for temporal events
              chronometer: {
                  // Previous turn's measurement of info.actionCount
                  turn: getTurn(),
                  // Whether or not various turn counters should be stepped (falsified by retry actions)
                  step: true,
                  // Number of consecutive turn interruptions
                  amnesia: 0,
                  // API: Postpone Auto-Cards externalities for n many turns
                  postpone: 0,
              },
              // Scalable atabase to store dynamic game information
              database: {
                  // Words are pale shadows of forgotten names. As names have power, words have power
                  titles: {
                      // A transient array of known titles parsed from card titles, entry title headers, and trigger keywords
                      used: [],
                      // Titles banned from future card generation attempts and various maintenance procedures
                      banned: getDefaultConfigBans(),
                      // Potential future card titles and their turns of occurrence
                      candidates: [],
                      // Helps avoid rechecking the same action text more than once, generally
                      lastActionParsed: -1,
                      // Ensures weird combinations of retry/erase events remain predictable
                      lastTextHash: "%@%",
                      // Newly banned titles which will be added to the config card
                      pendingBans: [],
                      // Currently banned titles which will be removed from the config card
                      pendingUnbans: []
                  },
                  // Memories are parsed from context and handled by various operations (basically magic)
                  memories: {
                      // Dynamic store of 'story card -> memory' conceptual relations
                      associations: {},
                      // Serialized hashset of the 2000 most recent near-duplicate memories purged from context
                      duplicates: "%@%"
                  }
              }
          };
      })();
      O.f(AC);
      O.s(AC.config);
      O.s(AC.signal);
      O.s(AC.generation);
      O.s(AC.generation.workpiece);
      AC.generation.pending.forEach(request => O.s(request));
      O.s(AC.compression);
      O.s(AC.message);
      O.s(AC.chronometer);
      O.f(AC.database);
      O.s(AC.database.titles);
      O.s(AC.database.memories);
      if (!HOOK) {
          globalThis.stop ??= false;
          AC.signal.maxChars = Math.abs(info?.maxChars || AC.signal.maxChars);
          if (HOOK === null) {
              if (Number.isInteger(info.maxChars)) {
                  // AutoCards(null) is always invoked once after being declared within the shared library
                  // Context must be cleaned before passing text to the context modifier
                  // This measure is taken to ensure compatability with other scripts
                  // First, remove all command, continue, and comfirmation messages from the context window
                  text = (text
                      // Remove all /ac commands
                      .replace(/\s*^.*\/\s*A\s*C.*$\s*/gmi, "\n\n")
                      // Remove all comfirmation requests and responses
                      .replace(/\s*\n*.*CONFIRM\s*DELETE.*\n*\s*/gi, confirmation => {
                          if (confirmation.includes("<<<")) {
                              return "\n\n";
                          } else {
                              return "";
                          }
                      })
                      // Remove dumb memories from the context window
                      // (Latitude, if you're reading this, please give us memoryBank read/write access 😭)
                      .replace(/(Memories:)\s*([\s\S]*?)\s*(Recent Story:|$)/i, (_, left, memories, right) => {
                          return (left + "\n" + (memories
                              .split("\n")
                              .filter(memory => {
                                  const lowerMemory = memory.toLowerCase();
                                  return !(
                                      (lowerMemory.includes("select") && lowerMemory.includes("continue"))
                                      || lowerMemory.includes(">>>") || lowerMemory.includes("<<<")
                                      || lowerMemory.includes("lsiv2")
                                  );
                              })
                              .join("\n")
                          ) + (right !== "") ? ("\n\n" + right) : "");
                      })
                      // Remove various Auto-Cards messages
                      .replace(/(?:\s*>>>[\s\S]*?<<<\s*)+/g, "\n\n")
                  );
                  if (!shouldProceed()) {
                      // Whenever Auto-Cards is inactive, remove auto card title headers from contextualized story card entries
                      text = (text
                          .replace(/\s*{\s*titles?\s*:[\s\S]*?}\s*/gi, "\n\n")
                          .replace(/World Lore:\s*/i, "World Lore:\n")
                      );
                      // Otherwise, implement a more complex version of this step within the (HOOK === "context") scope of AutoCards
                  }
              }
              CODOMAIN.initialize(null);
          } else {
              // AutoCards was (probably) called without arguments, return an external API to allow other script creators to programmatically govern the behavior of Auto-Cards from elsewhere within their own scripts
              state.InnerSelf ??= {};
              state.InnerSelf.AC ??= {};
              state.InnerSelf.AC.forced = true;
              CODOMAIN.initialize({API: O.f(Object.fromEntries(Object.entries({
                  // Call these API functions like so: AutoCards().API.nameOfFunction(argumentsOfFunction)
                  /*** Postpones internal Auto-Cards events for a specified number of turns
                  * 
                  * @function
                  * @param {number} turns A non-negative integer representing the number of turns to postpone events
                  * @returns {Object} An object containing cooldown values affected by the postponement
                  * @throws {Error} If turns is not a non-negative integer
                  */
                  postponeEvents: function(turns) {
                      if (Number.isInteger(turns) && (0 <= turns)) {
                          AC.chronometer.postpone = turns;
                      } else {
                          throw new Error(
                              "Invalid argument: \"" + turns + "\" -> AutoCards().API.postponeEvents() must be be called with a non-negative integer"
                          );
                      }
                      return {
                          postponeAllCooldown: turns,
                          addCardRealCooldown: AC.generation.cooldown,
                          addCardNextCooldown: AC.config.addCardCooldown
                      };
                  },
                  /*** Sets or clears the emergency halt flag to pause Auto-Cards operations
                  * 
                  * @function
                  * @param {boolean} shouldHalt A boolean value indicating whether to engage (true) or disengage (false) emergency halt
                  * @returns {boolean} The value that was set
                  * @throws {Error} If called from within isolateLSIv2 scope or with a non-boolean argument
                  */
                  emergencyHalt: function(shouldHalt) {
                      const scopeRestriction = new Error();
                      if (scopeRestriction.stack && scopeRestriction.stack.includes("isolateLSIv2")) {
                          throw new Error(
                              "Scope restriction: AutoCards().API.emergencyHalt() cannot be called from within LSIv2 (prevents deadlock) but you're more than welcome to use AutoCards().API.postponeEvents() instead!"
                          );
                      } else if (typeof shouldHalt === "boolean") {
                          AC.signal.emergencyHalt = shouldHalt;
                      } else {
                          throw new Error(
                              "Invalid argument: \"" + shouldHalt + "\" -> AutoCards().API.emergencyHalt() must be called with a boolean true or false"
                          );
                      }
                      return shouldHalt;
                  },
                  /*** Enables or disables state.message assignments from Auto-Cards
                  * 
                  * @function
                  * @param {boolean} shouldSuppress If true, suppresses all Auto-Cards messages; false enables them
                  * @returns {Array} The current pending messages after setting suppression
                  * @throws {Error} If shouldSuppress is not a boolean
                  */
                  suppressMessages: function(shouldSuppress) {
                      if (typeof shouldSuppress === "boolean") {
                          AC.message.suppress = shouldSuppress;
                      } else {
                          throw new Error(
                              "Invalid argument: \"" + shouldSuppress + "\" -> AutoCards().API.suppressMessages() must be called with a boolean true or false"
                          );
                      }
                      return AC.message.pending;
                  },
                  /*** Logs debug information to the "Debug Log" console card
                  * 
                  * @function
                  * @param {...any} args Arguments to log for debugging purposes
                  * @returns {any} The story card object reference
                  */
                  debugLog: function(...args) {
                      return Internal.debugLog(...args);
                  },
                  /*** Toggles Auto-Cards behavior or sets it directly
                  * 
                  * @function
                  * @param {boolean|null|undefined} toggleType If undefined, toggles the current state. If boolean or null, sets the state accordingly
                  * @returns {boolean|null|undefined} The state that was set or inferred
                  * @throws {Error} If toggleType is not a boolean, null, or undefined
                  */
                  toggle: function(toggleType) {
                      if (toggleType === undefined) {
                          if (AC.signal.forceToggle !== null) {
                              AC.signal.forceToggle = !AC.signal.forceToggle;
                          } else if (AC.config.doAC) {
                              AC.signal.forceToggle = false;
                          } else {
                              AC.signal.forceToggle = true;
                          }
                      } else if ((toggleType === null) || (typeof toggleType === "boolean")) {
                          AC.signal.forceToggle = toggleType;
                      } else {
                          throw new Error(
                              "Invalid argument: \"" + toggleType + "\" -> AutoCards().API.toggle() must be called with either A) a boolean true or false, B) a null argument, or C) no arguments at all (undefined)"
                          );
                      }
                      return toggleType;
                  },
                  /*** Generates a new card using optional prompt details or a request object
                  * 
                  * @function
                  * @param {Object|string} request A request object with card parameters or a string representing the title
                  * @param {string} [extra1] Optional entryPromptDetails if using string mode
                  * @param {string} [extra2] Optional entryStart if using string mode
                  * @returns {boolean} Did the generation attempt succeed or fail
                  * @throws {Error} If the request is not valid or missing a title
                  */
                  generateCard: function(request, extra1, extra2) {
                      // Function call guide:
                      // AutoCards().API.generateCard({
                      //     // All properties except 'title' are optional
                      //     type: "card type, defaults to 'class' for ease of filtering",
                      //     title: "card title",
                      //     keysStart: "preexisting card triggers",
                      //     entryStart: "preexisting card entry",
                      //     entryPrompt: "prompt the AI will use to complete this entry",
                      //     entryPromptDetails: "extra details to include with this card's prompt",
                      //     entryLimit: 600, // target character count for the generated entry
                      //     description: "card notes",
                      //     memoryStart: "preexisting card memory",
                      //     memoryUpdates: true, // card updates when new relevant memories are formed
                      //     memoryLimit: 3200, // max characters before the card memory is compressed
                      // });
                      if (typeof request === "string") {
                          request = {title: request};
                          if (typeof extra1 === "string") {
                              request.entryPromptDetails = extra1;
                              if (typeof extra2 === "string") {
                                  request.entryStart = extra2;
                              }
                          }
                      } else if (!isTitleInObj(request)) {
                          throw new Error(
                              "Invalid argument: \"" + request + "\" -> AutoCards().API.generateCard() must be called with either 1, 2, or 3 strings OR a correctly formatted card generation object"
                          );
                      }
                      O.f(request);
                      Internal.getUsedTitles(true);
                      return Internal.generateCard(request);
                  },
                  /*** Regenerates a card by title or object reference, optionally preserving or modifying its input info
                  *
                  * @function
                  * @param {Object|string} request A card object reference or title string for the card to be regenerated
                  * @param {boolean} [useOldInfo=true] If true, preserves old info in the new generation; false omits it
                  * @param {string} [newInfo=""] Additional info to append to the generation prompt
                  * @returns {boolean} True if regeneration succeeded; false otherwise
                  * @throws {Error} If the request format is invalid, or if the second or third parameters are the wrong types
                  */
                  redoCard: function(request, useOldInfo = true, newInfo = "") {
                      if (typeof request === "string") {
                          request = {title: request};
                      } else if (!isTitleInObj(request)) {
                          throw new Error(
                              "Invalid argument: \"" + request + "\" -> AutoCards().API.redoCard() must be called with a string or correctly formatted card generation object"
                          );
                      }
                      if (typeof useOldInfo !== "boolean") {
                          throw new Error(
                              "Invalid argument: \"" + request + ", " + useOldInfo + "\" -> AutoCards().API.redoCard() requires a boolean as its second argument"
                          );
                      } else if (typeof newInfo !== "string") {
                          throw new Error(
                              "Invalid argument: \"" + request + ", " + useOldInfo + ", " + newInfo + "\" -> AutoCards().API.redoCard() requires a string for its third argument"
                          );
                      }
                      return Internal.redoCard(request, useOldInfo, newInfo);
                  },
                  /*** Flags or unflags a card as an auto-card, controlling its automatic generation behavior
                  *
                  * @function
                  * @param {Object|string} targetCard The card object or title to mark/unmark as an auto-card
                  * @param {boolean} [setOrUnset=true] If true, marks the card as an auto-card; false removes the flag
                  * @returns {boolean} True if the operation succeeded; false if the card was invalid or already matched the target state
                  * @throws {Error} If the arguments are invalid types
                  */
                  setCardAsAuto: function(targetCard, setOrUnset = true) {
                      if (isTitleInObj(targetCard)) {
                          targetCard = targetCard.title;
                      } else if (typeof targetCard !== "string") {
                          throw new Error(
                              "Invalid argument: \"" + targetCard + "\" -> AutoCards().API.setCardAsAuto() must be called with a string or card object"
                          );
                      }
                      if (typeof setOrUnset !== "boolean") {
                          throw new Error(
                              "Invalid argument: \"" + targetCard + ", " + setOrUnset + "\" -> AutoCards().API.setCardAsAuto() requires a boolean as its second argument"
                          );
                      }
                      const [card, isAuto] = getIntendedCard(targetCard);
                      if (card === null) {
                          return false;
                      }
                      if (setOrUnset) {
                          if (checkAuto()) {
                              return false;
                          }
                          card.description = "{title:}";
                          Internal.getUsedTitles(true);
                          return card.entry.startsWith("{title: ");
                      } else if (!checkAuto()) {
                          return false;
                      }
                      card.entry = removeAutoProps(card.entry);
                      card.description = removeAutoProps(card.description.replace((
                          /\s*Auto(?:-|\s*)Cards\s*will\s*contextualize\s*these\s*memories\s*:\s*/gi
                      ), ""));
                      function checkAuto() {
                          return (isAuto || /{updates: (?:true|false), limit: \d+}/.test(card.description));
                      }
                      return true;
                  },
                  /*** Appends a memory to a story card's memory bank
                  *
                  * @function
                  * @param {Object|string} targetCard A card object reference or title string
                  * @param {string} newMemory The memory text to add
                  * @returns {boolean} True if the memory was added; false if it was empty, already present, or the card was not found
                  * @throws {Error} If the inputs are not a string or valid card object reference
                  */
                  addCardMemory: function(targetCard, newMemory) {
                      if (isTitleInObj(targetCard)) {
                          targetCard = targetCard.title;
                      } else if (typeof targetCard !== "string") {
                          throw new Error(
                              "Invalid argument: \"" + targetCard + "\" -> AutoCards().API.addCardMemory() must be called with a string or card object"
                          );
                      }
                      if (typeof newMemory !== "string") {
                          throw new Error(
                              "Invalid argument: \"" + targetCard + ", " + newMemory + "\" -> AutoCards().API.addCardMemory() requires a string for its second argument"
                          );
                      }
                      newMemory = newMemory.trim().replace(/\s+/g, " ").replace(/^-+\s*/, "");
                      if (newMemory === "") {
                          return false;
                      }
                      const [card, isAuto, titleKey] = getIntendedCard(targetCard);
                      if (
                          (card === null)
                          || card.description.replace(/\s+/g, " ").toLowerCase().includes(newMemory.toLowerCase())
                      ) {
                          return false;
                      } else if (card.description !== "") {
                          card.description += "\n";
                      }
                      card.description += "- " + newMemory;
                      if (titleKey in AC.database.memories.associations) {
                          AC.database.memories.associations[titleKey][1] = (StringsHashed
                              .deserialize(AC.database.memories.associations[titleKey][1], 65536)
                              .remove(newMemory)
                              .add(newMemory)
                              .latest(3500)
                              .serialize()
                          );
                      } else if (isAuto) {
                          AC.database.memories.associations[titleKey] = [999, (new StringsHashed(65536)
                              .add(newMemory)
                              .serialize()
                          )];
                      }
                      return true;
                  },
                  /*** Removes all previously generated auto-cards and resets various states
                  *
                  * @function
                  * @returns {number} The number of cards that were removed
                  */
                  eraseAllAutoCards: function() {
                      return Internal.eraseAllAutoCards();
                  },
                  /*** Retrieves an array of titles currently used by the adventure's story cards
                  *
                  * @function
                  * @returns {Array<string>} An array of strings representing used titles
                  */
                  getUsedTitles: function() {
                      return Internal.getUsedTitles(true);
                  },
                  /*** Retrieves an array of banned titles
                  *
                  * @function
                  * @returns {Array<string>} An array of banned title strings
                  */
                  getBannedTitles: function() {
                      return Internal.getBannedTitles();
                  },
                  /*** Sets the banned titles array, replacing any previously banned titles
                  *
                  * @function
                  * @param {string|Array<string>} titles A comma-separated string or array of strings representing titles to ban
                  * @returns {Object} An object containing oldBans and newBans arrays
                  * @throws {Error} If the input is neither a string nor an array of strings
                  */
                  setBannedTitles: function(titles) {
                      const codomain = {oldBans: AC.database.titles.banned};
                      if (Array.isArray(titles) && titles.every(title => (typeof title === "string"))) {
                          assignBannedTitles(titles);
                      } else if (typeof titles === "string") {
                          if (titles.includes(",")) {
                              assignBannedTitles(titles.split(","));
                          } else {
                              assignBannedTitles([titles]);
                          }
                      } else {
                          throw new Error(
                              "Invalid argument: \"" + titles + "\" -> AutoCards().API.setBannedTitles() must be called with either a string or an array of strings"
                          );
                      }
                      codomain.newBans = AC.database.titles.banned;
                      function assignBannedTitles(titles) {
                          Internal.setBannedTitles(uniqueTitlesArray(titles), false);
                          AC.signal.overrideBans = 3;
                          return;
                      }
                      return codomain;
                  },
                  /*** Creates a new story card with the specified parameters
                  *
                  * @function
                  * @param {string|Object} title Card title string or full card template object containing all fields
                  * @param {string} [entry] The entry text for the card
                  * @param {string} [type] The card type (e.g., "character", "location")
                  * @param {string} [keys] The keys (triggers) for the card
                  * @param {string} [description] The notes or memory bank of the card
                  * @param {number} [insertionIndex] Optional index to insert the card at a specific position within storyCards
                  * @returns {Object|null} The created card object reference, or null if creation failed
                  */
                  buildCard: function(title, entry, type, keys, description, insertionIndex) {
                      if (isTitleInObj(title)) {
                          type = title.type ?? type;
                          keys = title.keys ?? keys;
                          entry = title.entry ?? entry;
                          description = title.description ?? description;
                          title = title.title;
                      }
                      title = cast(title);
                      const card = constructCard(O.f({
                          type: cast(type, AC.config.defaultCardType),
                          title,
                          keys: cast(keys, buildKeys("", title)),
                          entry: cast(entry),
                          description: cast(description)
                      }), boundInteger(0, insertionIndex, storyCards.length, newCardIndex()));
                      if (notEmptyObj(card)) {
                          return card;
                      }
                      function cast(value, fallback = "") {
                          if (typeof value === "string") {
                              return value;
                          } else {
                              return fallback;
                          }
                      }
                      return null;
                  },
                  /*** Finds and returns story cards satisfying a user-defined condition
                  *
                  * @function
                  * @param {Function} predicate A function which takes a card and returns true if it matches
                  * @param {boolean} [getAll=false] If true, returns all matching cards; otherwise returns the first match
                  * @returns {Object|Array<Object>|null} A single card object reference, an array of cards, or null if no match is found
                  * @throws {Error} If the predicate is not a function or getAll is not a boolean
                  */
                  getCard: function(predicate, getAll = false) {
                      if (typeof predicate !== "function") {
                          throw new Error(
                              "Invalid argument: \"" + predicate + "\" -> AutoCards().API.getCard() must be called with a function"
                          );
                      } else if (typeof getAll !== "boolean") {
                          throw new Error(
                              "Invalid argument: \"" + predicate + ", " + getAll + "\" -> AutoCards().API.getCard() requires a boolean as its second argument"
                          );
                      }
                      return Internal.getCard(predicate, getAll);
                  },
                  /*** Removes story cards based on a user-defined condition or by direct reference
                  *
                  * @function
                  * @param {Function|Object} predicate A predicate function or a card object reference
                  * @param {boolean} [eraseAll=false] If true, removes all matching cards; otherwise removes the first match
                  * @returns {boolean|number} True if a single card was removed, false if none matched, or the number of cards erased
                  * @throws {Error} If the inputs are not a valid predicate function, card object, or boolean
                  */
                  eraseCard: function(predicate, eraseAll = false) {
                      if (isTitleInObj(predicate) && storyCards.includes(predicate)) {
                          return eraseCard(predicate);
                      } else if (typeof predicate !== "function") {
                          throw new Error(
                              "Invalid argument: \"" + predicate + "\" -> AutoCards().API.eraseCard() must be called with a function or card object"
                          );
                      } else if (typeof eraseAll !== "boolean") {
                          throw new Error(
                              "Invalid argument: \"" + predicate + ", " + eraseAll + "\" -> AutoCards().API.eraseCard() requires a boolean as its second argument"
                          );
                      } else if (eraseAll) {
                          // Erase all cards which satisfy the given condition
                          let cardsErased = 0;
                          for (const [index, card] of storyCards.entries()) {
                              if (predicate(card)) {
                                  removeStoryCard(index);
                                  cardsErased++;
                              }
                          }
                          return cardsErased;
                      }
                      // Erase the first card which satisfies the given condition
                      for (const [index, card] of storyCards.entries()) {
                          if (predicate(card)) {
                              removeStoryCard(index);
                              return true;
                          }
                      }
                      return false;
                  }
              }).map(([key, fn]) => [key, function(...args) {
                  const result = fn.apply(this, args);
                  if (data) {
                      data.description = JSON.stringify(AC);
                  }
                  return result;
              }])))});
              function isTitleInObj(obj) {
                  return (
                      (typeof obj === "object")
                      && (obj !== null)
                      && ("title" in obj)
                      && (typeof obj.title === "string")
                  );
              }
          }
      } else if (AC.signal.emergencyHalt) {
          switch(HOOK) {
          case "context": {
              // AutoCards was called within the context modifier
              advanceChronometer();
              break; }
          case "output": {
              // AutoCards was called within the output modifier
              concludeEmergency();
              const previousAction = readPastAction(0);
              if (isDoSayStory(previousAction.type) && /escape\s*emergency\s*halt/i.test(previousAction.text)) {
                  AC.signal.emergencyHalt = false;
              }
              break; }
          }
          CODOMAIN.initialize(TEXT);
      } else if ((AC.config.LSIv2 !== null) && AC.config.LSIv2) {
          // Silly recursion shenanigans
          state.LSIv2 = AC;
          AC.config.LSIv2 = false;
          const LSI_DOMAIN = AutoCards(HOOK, TEXT, STOP);
          // Is this lazy loading mechanism overkill? Yes. But it's fun!
          const factories = O.f({
              library: () => ({
                  name: Words.reserved.library,
                  entry: prose(
                      "// Your adventure's Shared Library code goes here",
                      "// Example Library code:",
                      "state.promptDragon ??= false;",
                      "state.mind ??= 0;",
                      "state.willStop ??= false;",
                      "function formatMessage(message, space = \" \") {",
                      "    let leadingNewlines = \"\";",
                      "    let trailingNewlines = \"\\n\\n\";",
                      "    if (text.startsWith(\"\\n> \")) {",
                      "        // We don't want any leading/trailing newlines for Do/Say",
                      "        trailingNewlines = \"\";",
                      "    } else if (history && (0 < history.length)) {",
                      "        // Decide leading newlines based on the previous action",
                      "        const action = history[history.length - 1];",
                      "        if ((action.type === \"continue\") || (action.type === \"story\")) {",
                      "            if (!action.text.endsWith(\"\\n\")) {",
                      "                leadingNewlines = \"\\n\\n\";",
                      "            } else if (!action.text.endsWith(\"\\n\\n\")) {",
                      "                leadingNewlines = \"\\n\";",
                      "            }",
                      "        }",
                      "    }",
                      "    return leadingNewlines + \"{>\" + space + (message",
                      "        .replace(/(?:\\s*(?:{>|<})\\s*)+/g, \" \")",
                      "        .trim()",
                      "    ) + space + \"<}\" + trailingNewlines;",
                      "}"),
                  description:
                      "// You may also continue your Library code below",
                  singleton: false,
                  position: 2
              }),
              input: () => ({
                  name: Words.reserved.input,
                  entry: prose(
                      "// Your adventure's Input Modifier code goes here",
                      "// Example Input code:",
                      "const minds = [",
                      "\"kind and gentle\",",
                      "\"curious and eager\",",
                      "\"cruel and evil\"",
                      "];",
                      "// Type any of these triggers into a Do/Say/Story action",
                      "const commands = new Map([",
                      "[\"encounter dragon\", () => {",
                      "    AutoCards().API.postponeEvents(1);",
                      "    state.promptDragon = true;",
                      "    text = formatMessage(\"You encounter a dragon!\");",
                      "    log(\"A dragon appears!\");",
                      "}],",
                      "[\"summon leah\", () => {",
                      "    alterMind();",
                      "    const success = AutoCards().API.generateCard({",
                      "        title: \"Leah\",",
                      "        entryPromptDetails: (",
                      "            \"Leah is an exceptionally \" +",
                      "            minds[state.mind] +",
                      "            \" woman\"",
                      "        ),",
                      "        entryStart: \"Leah is your magically summoned assistant.\"",
                      "    });",
                      "    if (success) {",
                      "        text = formatMessage(\"You begin summoning Leah!\");",
                      "        log(\"Attempting to summon Leah\");",
                      "    } else {",
                      "        text = formatMessage(\"You failed to summon Leah...\");",
                      "        log(\"Leah could not be summoned\");",
                      "    }",
                      "}],",
                      "[\"alter leah\", () => {",
                      "    alterMind();",
                      "    const success = AutoCards().API.redoCard(\"Leah\", true, (",
                      "        \"You used your magic on Leah\\n\" +",
                      "        \"Therefore she is now entirely \" +",
                      "        minds[state.mind]",
                      "    ));",
                      "    if (success) {",
                      "        text = formatMessage(",
                      "            \"You proceed to alter Leah's mind!\"",
                      "        );",
                      "        log(\"Attempting to alter Leah\");",
                      "    } else {",
                      "        text = formatMessage(\"You failed to alter Leah...\");",
                      "        log(\"Leah could not be altered\");",
                      "    }",
                      "}],",
                      "[\"show api\", () => {",
                      "    state.showAPI = true;",
                      "    text = formatMessage(\"Displaying the Auto-Cards API below\");",
                      "}],",
                      "[\"force stop\", () => {",
                      "    state.willStop = true;",
                      "}]",
                      "]);",
                      "const lowerText = text.toLowerCase();",
                      "for (const [trigger, implement] of commands) {",
                      "    if (lowerText.includes(trigger)) {",
                      "        implement();",
                      "        break;",
                      "    }",
                      "}",
                      "function alterMind() {",
                      "    state.mind = (state.mind + 1) % minds.length;",
                      "    return;",
                      "}"),
                  description:
                      "// You may also continue your Input code below",
                  singleton: false,
                  position: 3
              }),
              context: () => ({
                  name: Words.reserved.context,
                  entry: prose(
                      "// Your adventure's Context Modifier code goes here",
                      "// Example Context code:",
                      "text = text.replace(/\\s*{>[\\s\\S]*?<}\\s*/gi, \"\\n\\n\");",
                      "if (state.willStop) {",
                      "    state.willStop = false;",
                      "    // Assign true to prevent the onOutput hook",
                      "    // This can only be done onContext",
                      "    stop = true;",
                      "} else if (state.promptDragon) {",
                      "    state.promptDragon = false;",
                      "    text = (",
                      "        text.trimEnd() +",
                      "        \"\\n\\nA cute little dragon softly lands upon your head. \"",
                      "    );",
                      "}"),
                  description:
                      "// You may also continue your Context code below",
                  singleton: false,
                  position: 4
              }),
              output: () => ({
                  name: Words.reserved.output,
                  entry: prose(
                      "// Your adventure's Output Modifier code goes here",
                      "// Example Output code:",
                      "if (state.showAPI) {",
                      "    state.showAPI = false;",
                      "    const apiKeys = (Object.keys(AutoCards().API)",
                      "        .map(key => (\"AutoCards().API.\" + key + \"()\"))",
                      "    );",
                      "    text = formatMessage(apiKeys.join(\"\\n\"), \"\\n\");",
                      "    log(apiKeys);",
                      "}"),
                  description:
                      "// You may also continue your Output code below",
                  singleton: false,
                  position: 5
              }),
              guide: () => ({
                  name: Words.reserved.guide,
                  entry: prose(
                      "Any valid JavaScript code you write within the Shared Library or Input/Context/Output Modifier story cards will be executed from top to bottom; Live Script Interface v2 closely emulates AI Dungeon's native scripting environment, even if you aren't the owner of the original scenario. Furthermore, I've provided full access to the Auto-Cards scripting API. Please note that disabling LSIv2 via the \"Configure Auto-Cards\" story card will reset your LSIv2 adventure scripts!",
                      "",
                      "If you aren't familiar with scripting in AI Dungeon, please refer to the official guidebook page:",
                      "https://help.aidungeon.com/scripting",
                      "",
                      "I've included an example script with the four aforementioned code cards, to help showcase some of my fancy schmancy Auto-Cards API functions. Take a look, try some of my example commands, inspect the Console Log, and so on... It's a ton of fun! ❤️",
                      "",
                      "If you ever run out of space in your Library, Input, Context, or Output code cards, simply duplicate whichever one(s) you need and then perform an in-game turn before writing any more code. (emphasis on \"before\") Doing so will signal LSIv2 to convert your duplicated code card(s) into additional auxiliary versions.",
                      "",
                      "Auxiliary code cards are numbered, and any code written within will be appended in sequential order. For example:",
                      "// Shared Library (entry)",
                      "// Shared Library (notes)",
                      "// Shared Library 2 (entry)",
                      "// Shared Library 2 (notes)",
                      "// Shared Library 3 (entry)",
                      "// Shared Library 3 (notes)",
                      "// Input Modifier (entry)",
                      "// Input Modifier (notes)",
                      "// Input Modifier 2 (entry)",
                      "// Input Modifier 2 (notes)",
                      "// And so on..."),
                  description:
                      "",
                  singleton: true,
                  position: 0
              }),
              state: () => ({
                  name: Words.reserved.state,
                  entry:
                      "Your adventure's full state object is displayed in the Notes section below.",
                  description:
                      "",
                  singleton: true,
                  position: 6
              }),
              log: () => ({
                  name: Words.reserved.log,
                  entry:
                      "Please refer to the Notes section below to view the full log history for LSIv2. Console log entries are ordered from most recent to oldest. LSIv2 error messages will be recorded here, alongside the outputs of log and console.log function calls within your adventure scripts.",
                  description:
                      "",
                  singleton: true,
                  position: 1
              })
          });
          const cache = {};
          const templates = new Proxy({}, {
              get(_, key) {
                  return cache[key] ??= O.f(factories[key]());
              }
          });
          if (AC.config.LSIv2 !== null) {
              switch(HOOK) {
              case "input": {
                  // AutoCards was called within the input modifier
                  const [libraryCards, inputCards, logCard] = collectCards(
                      templates.library,
                      templates.input,
                      templates.log
                  );
                  const [error, newText] = isolateLSIv2(parseCode(libraryCards, inputCards), callbackLog(logCard), LSI_DOMAIN);
                  handleError(logCard, error);
                  if (hadError()) {
                      CODOMAIN.initialize(getStoryError());
                      AC.signal.upstreamError = "\n";
                  } else {
                      CODOMAIN.initialize(newText);
                  }
                  break; }
              case "context": {
                  // AutoCards was called within the context modifier
                  const [libraryCards, contextCards, logCard] = collectCards(
                      templates.library,
                      templates.context,
                      templates.log,
                      templates.input
                  );
                  if (hadError()) {
                      endContextLSI(LSI_DOMAIN);
                      break;
                  }
                  const [error, ...newCodomain] = (([error, newText, newStop]) => [error, newText, (newStop === true)])(
                      isolateLSIv2(parseCode(libraryCards, contextCards), callbackLog(logCard), LSI_DOMAIN[0], LSI_DOMAIN[1])
                  );
                  handleError(logCard, error);
                  endContextLSI(newCodomain);
                  function endContextLSI(newCodomain) {
                      CODOMAIN.initialize(newCodomain);
                      if (!newCodomain[1]) {
                          return;
                      }
                      const [guideCard, stateCard] = collectCards(
                          templates.guide,
                          templates.state,
                          templates.output
                      );
                      AC.message.pending = [];
                      concludeLSI(guideCard, stateCard, logCard);
                      return;
                  }
                  break; }
              case "output": {
                  // AutoCards was called within the output modifier
                  const [libraryCards, outputCards, guideCard, stateCard, logCard] = collectCards(
                      templates.library,
                      templates.output,
                      templates.guide,
                      templates.state,
                      templates.log
                  );
                  if (hadError()) {
                      endOutputLSI(true, LSI_DOMAIN);
                      break;
                  }
                  const [error, newText] = isolateLSIv2(parseCode(libraryCards, outputCards), callbackLog(logCard), LSI_DOMAIN);
                  handleError(logCard, error);
                  endOutputLSI(hadError(), newText);
                  function endOutputLSI(displayError, newText) {
                      if (displayError) {
                          if (AC.signal.upstreamError === "\n") {
                              CODOMAIN.initialize("\n");
                          } else {
                              CODOMAIN.initialize(getStoryError() + "\n");
                          }
                          AC.message.pending = [];
                      } else {
                          CODOMAIN.initialize(newText);
                      }
                      concludeLSI(guideCard, stateCard, logCard);
                      return;
                  }
                  break; }
              case "initialize": {
                  collectAll();
                  logToCard(Internal.getCard(card => (card.title === templates.log.name)), "LSIv2 startup -> Success!");
                  CODOMAIN.initialize(null);
                  break; }
              }
              AC.config.LSIv2 = true;
              function parseCode(...args) {
                  return (args
                      .flatMap(cardset => [cardset.primary, ...cardset.auxiliaries])
                      .flatMap(card => [card.entry, card.description])
                      .join("\n")
                  );
              }
              function callbackLog(logCard) {
                  return function(...args) {
                      logToCard(logCard, ...args);
                      return;
                  }
              }
              function handleError(logCard, error) {
                  if (!error) {
                      return;
                  }
                  O.f(error);
                  AC.signal.upstreamError = (
                      "LSIv2 encountered an error during the on" + HOOK[0].toUpperCase() + HOOK.slice(1) + " hook"
                  );
                  if (error.message) {
                      AC.signal.upstreamError += ":\n";
                      if (error.stack) {
                          const stackMatch = error.stack.match(/AutoCards[\s\S]*?:\s*(\d+)\s*:\s*(\d+)/i);
                          if (stackMatch) {
                              AC.signal.upstreamError += (
                                  (error.name ?? "Error") + ": " + error.message + "\n" +
                                  "(line #" + stackMatch[1] + " column #" + stackMatch[2] + ")"
                              );
                          } else {
                              AC.signal.upstreamError += error.stack;
                          }
                      } else {
                          AC.signal.upstreamError += (error.name ?? "Error") + ": " + error.message;
                      }
                      AC.signal.upstreamError = cleanSpaces(AC.signal.upstreamError.trimEnd());
                  }
                  logToCard(logCard, AC.signal.upstreamError);
                  if (getStateMessage() === AC.signal.upstreamError) {
                      state.message = AC.signal.upstreamError + " ";
                  } else {
                      state.message = AC.signal.upstreamError;
                  }
                  return;
              }
              function hadError() {
                  return (AC.signal.upstreamError !== "");
              }
              function getStoryError() {
                  return getPrecedingNewlines() + ">>>\n" + AC.signal.upstreamError + "\n<<<\n";
              }
              function concludeLSI(guideCard, stateCard, logCard) {
                  AC.signal.upstreamError = "";
                  guideCard.description = templates.guide.description;
                  guideCard.entry = templates.guide.entry;
                  stateCard.entry = templates.state.entry;
                  logCard.entry = templates.log.entry;
                  postMessages();
                  const simpleState = {...state};
                  delete simpleState.LSIv2;
                  stateCard.description = limitString(stringifyObject(simpleState).trim(), 999999).trimEnd();
                  return;
              }
          } else {
              const cardsets = collectAll();
              for (const cardset of cardsets) {
                  if ("primary" in cardset) {
                      killCard(cardset.primary);
                      for (const card of cardset.auxiliaries) {
                          killCard(card);
                      }
                  } else {
                      killCard(cardset);
                  }
                  function killCard(card) {
                      unbanTitle(card.title);
                      eraseCard(card);
                  }
              }
              AC.signal.upstreamError = "";
              CODOMAIN.initialize(LSI_DOMAIN);
          }
          // This measure ensures the Auto-Cards external API is equally available from within the inner scope of LSIv2
          // As before, call with AutoCards().API.nameOfFunction(yourArguments);
          deepMerge(AC, state.LSIv2);
          delete state.LSIv2;
          function deepMerge(target, source) {
              for (const key in source) {
                  if (!source.hasOwnProperty(key)) {
                      continue;
                  } else if (
                      (typeof source[key] === "object")
                      && (source[key] !== null)
                      && !Array.isArray(source[key])
                      && (typeof target[key] === "object")
                      && (target[key] !== null)
                      && (key !== "workpiece")
                      && (key !== "associations")
                  ) {
                      // Recursively merge static objects
                      deepMerge(target[key], source[key]);
                  } else {
                      // Directly replace values
                      target[key] = source[key];
                  }
              }
              return;
          }
          function collectAll() {
              return collectCards(...Object.keys(factories).map(key => templates[key]));
          }
          // collectCards constructs, validates, repairs, retrieves, and organizes all LSIv2 script cards associated with the given arguments by iterating over the storyCards array only once! Returned elements are easily handled via array destructuring assignment
          function collectCards(...args) {
              // args: [{name: string, entry: string, description: string, singleton: boolean, position: integer}]
              const collections = O.f(args.map(({name, entry, description, singleton, position}) => {
                  const collection = {
                      template: O.f({
                          type: AC.config.defaultCardType,
                          title: name,
                          keys: name,
                          entry,
                          description
                      }),
                      singleton,
                      position,
                      primary: null,
                      excess: [],
                  };
                  if (!singleton) {
                      collection.auxiliaries = [];
                      collection.occupied = new Set([0, 1]);
                  }
                  return O.s(collection);
              }));
              for (const card of storyCards) {
                  O.s(card);
                  for (const collection of collections) {
                      if (
                          !card.title.toLowerCase().includes(collection.template.title.toLowerCase())
                          && !card.keys.toLowerCase().includes(collection.template.title.toLowerCase())
                      ) {
                          // No match, swipe left
                          continue;
                      }
                      if (collection.singleton) {
                          setPrimary();
                          break;
                      }
                      const [extensionA, extensionB] = [card.title, card.keys].map(name => {
                          const extensionMatch = name.replace(/[^a-zA-Z0-9]/g, "").match(/\d+$/);
                          if (extensionMatch) {
                              return parseInt(extensionMatch[0], 10);
                          } else {
                              return -1;
                          }
                      });
                      if (-1 < extensionA) {
                          if (-1 < extensionB) {
                              if (collection.occupied.has(extensionA)) {
                                  setAuxiliary(extensionB);
                              } else {
                                  setAuxiliary(extensionA, true);
                              }
                          } else {
                              setAuxiliary(extensionA);
                          }
                      } else if (-1 < extensionB) {
                          setAuxiliary(extensionB);
                      } else {
                          setPrimary();
                      }
                      function setAuxiliary(extension, preChecked = false) {
                          if (preChecked || !collection.occupied.has(extension)) {
                              addAuxiliary(card, collection, extension);
                          } else {
                              card.title = card.keys = collection.template.title;
                              collection.excess.push(card);
                          }
                          return;
                      }
                      function setPrimary() {
                          card.title = card.keys = collection.template.title;
                          if (collection.primary === null) {
                              collection.primary = card;
                          } else {
                              collection.excess.push(card);
                          }
                          return;
                      }
                      break;
                  }
              }
              for (const collection of collections) {
                  banTitle(collection.template.title);
                  if (collection.singleton) {
                      if (collection.primary === null) {
                          constructPrimary();
                      } else if (hasExs()) {
                          for (const card of collection.excess) {
                              eraseCard(card);
                          }
                      }
                      continue;
                  } else if (collection.primary === null) {
                      if (hasExs()) {
                          collection.primary = collection.excess.shift();
                          if (hasExs() || hasAux()) {
                              applyComment(collection.primary);
                          } else {
                              collection.primary.entry = collection.template.entry;
                              collection.primary.description = collection.template.description;
                              continue;
                          }
                      } else {
                          constructPrimary();
                          if (hasAux()) {
                              applyComment(collection.primary);
                          } else {
                              continue;
                          }
                      }
                  }
                  if (hasExs()) {
                      for (const card of collection.excess) {
                          let extension = 2;
                          while (collection.occupied.has(extension)) {
                              extension++;
                          }
                          applyComment(card);
                          addAuxiliary(card, collection, extension);
                      }
                  }
                  if (hasAux()) {
                      collection.auxiliaries.sort((a, b) => {
                          return a.extension - b.extension;
                      });
                  }
                  function hasExs() {
                      return (0 < collection.excess.length);
                  }
                  function hasAux() {
                      return (0 < collection.auxiliaries.length);
                  }
                  function applyComment(card) {
                      card.entry = card.description = "// You may continue writing your code here";
                      return;
                  }
                  function constructPrimary() {
                      collection.primary = constructCard(collection.template, newCardIndex());
                      // I like my LSIv2 cards to display in the proper order once initialized uwu
                      const templateKeys = Object.keys(factories);
                      const cards = templateKeys.map(key => O.f({
                          card: Internal.getCard(card => (card.title === templates[key].name)),
                          position: templates[key].position
                      })).filter(pair => (pair.card !== null));
                      if (cards.length < templateKeys.length) {
                          return;
                      }
                      const fullCardset = cards.sort((a, b) => (a.position - b.position)).map(pair => pair.card);
                      for (const card of fullCardset) {
                          eraseCard(card);
                          card.title = card.keys;
                      }
                      storyCards.splice(newCardIndex(), 0, ...fullCardset);
                      return;
                  }
              }
              function addAuxiliary(card, collection, extension) {
                  collection.occupied.add(extension);
                  card.title = card.keys = collection.template.title + " " + extension;
                  collection.auxiliaries.push({card, extension});
                  return;
              }
              return O.f(collections.map(({singleton, primary, auxiliaries}) => {
                  if (singleton) {
                      return primary;
                  } else {
                      return O.f({primary, auxiliaries: O.f(auxiliaries.map(({card}) => card))});
                  }
              }));
          }
      } else if (AC.config.doAC) {
          // Auto-Cards is currently enabled
          // "text" represents the original text which was present before any scripts were executed
          // "TEXT" represents the script-modified version of "text" which AutoCards was called with
          // This dual scheme exists to ensure Auto-Cards is safely compatible with other scripts
          switch(HOOK) {
          case "input": {
              // AutoCards was called within the input modifier
              if ((AC.config.deleteAllAutoCards === false) && /CONFIRM\s*DELETE/i.test(TEXT)) {
                  CODOMAIN.initialize("CONFIRM DELETE -> Success!");
              } else if (/\/\s*A\s*C/i.test(text)) {
                  CODOMAIN.initialize(doPlayerCommands(text));
              } else if (TEXT.startsWith(" ") && readPastAction(0).text.endsWith("\n")) {
                  // Just a simple little formatting bugfix for regular AID story actions
                  CODOMAIN.initialize(getPrecedingNewlines() + TEXT.replace(/^\s+/, ""));
              } else {
                  CODOMAIN.initialize(TEXT);
              }
              break; }
          case "context": {
              // AutoCards was called within the context modifier
              advanceChronometer();
              // Get or construct the "Configure Auto-Cards" story card
              const configureCardTemplate = getConfigureCardTemplate();
              const configureCard = getSingletonCard(true, configureCardTemplate);
              banTitle(configureCardTemplate.title);
              pinAndSortCards(configureCard);
              const bansOverwritten = (0 < AC.signal.overrideBans);
              if ((configureCard.description !== configureCardTemplate.description) || bansOverwritten) {
                  const descConfigPatterns = (getConfigureCardDescription()
                      .split(Words.delimiter)
                      .slice(1)
                      .map(descPattern => (descPattern
                          .slice(0, descPattern.indexOf(":"))
                          .trim()
                          .replace(/\s+/g, "\\s*")
                      ))
                      .map(descPattern => (new RegExp("^\\s*" + descPattern + "\\s*:", "i")))
                  );
                  const descConfigs = configureCard.description.split(Words.delimiter).slice(1);
                  if (
                      (descConfigs.length === descConfigPatterns.length)
                      && descConfigs.every((descConfig, index) => descConfigPatterns[index].test(descConfig))
                  ) {
                      // All description config headers must be present and well-formed
                      let cfg = extractDescSetting(0);
                      if (AC.config.generationPrompt !== cfg) {
                          notify("Changes to your card generation prompt were successfully saved");
                          AC.config.generationPrompt = cfg;
                      }
                      cfg = extractDescSetting(1);
                      if (AC.config.compressionPrompt !== cfg) {
                          notify("Changes to your card memory compression prompt were successfully saved");
                          AC.config.compressionPrompt = cfg;
                      }
                      if (bansOverwritten) {
                          overrideBans();
                      } else if ((0 < AC.database.titles.pendingBans.length) || (0 < AC.database.titles.pendingUnbans.length)) {
                          const pendingBans = AC.database.titles.pendingBans.map(pair => pair[0]);
                          const pendingRewrites = new Set(
                              lowArr([...pendingBans, ...AC.database.titles.pendingUnbans.map(pair => pair[0])])
                          );
                          Internal.setBannedTitles([...pendingBans, ...extractDescSetting(2)
                              .split(",")
                              .filter(newBan => !pendingRewrites.has(newBan.toLowerCase().replace(/\s+/, " ").trim()))
                          ], true);
                      } else {
                          Internal.setBannedTitles(extractDescSetting(2).split(","), true);
                      }
                      function extractDescSetting(index) {
                          return descConfigs[index].replace(descConfigPatterns[index], "").trim();
                      }
                  } else if (bansOverwritten) {
                      overrideBans();
                  }
                  configureCard.description = getConfigureCardDescription();
                  function overrideBans() {
                      Internal.setBannedTitles(AC.database.titles.pendingBans.map(pair => pair[0]), true);
                      AC.signal.overrideBans = 0;
                      return;
                  }
              }
              if (configureCard.entry !== configureCardTemplate.entry) {
                  const oldConfig = {};
                  const settings = O.f((function() {
                      const userSettings = extractSettings(configureCard.entry);
                      if (userSettings.resetallconfigsettingsandprompts !== true) {
                          return userSettings;
                      }
                      // Reset all config settings and display state change notifications only when appropriate
                      Object.assign(oldConfig, AC.config);
                      Object.assign(AC.config, getDefaultConfig());
                      AC.config.deleteAllAutoCards = oldConfig.deleteAllAutoCards;
                      AC.config.LSIv2 = oldConfig.LSIv2;
                      AC.config.defaultCardType = oldConfig.defaultCardType;
                      AC.database.titles.banned = getDefaultConfigBans();
                      configureCard.description = getConfigureCardDescription();
                      configureCard.entry = getConfigureCardEntry();
                      const defaultSettings = extractSettings(configureCard.entry);
                      if (
                          (S.DEFAULT_DO_AC === false)
                          || (userSettings.disableautocards === true)
                      ) {
                          defaultSettings.disableautocards = true;
                      }
                      notify("Restoring all settings and prompts to their default values");
                      return defaultSettings;
                  })());
                  O.f(oldConfig);
                  if ((settings.deleteallautomaticstorycards === true) && (AC.config.deleteAllAutoCards === null)) {
                      AC.config.deleteAllAutoCards = true;
                  } else if (settings.showdetailedguide === true) {
                      AC.signal.outputReplacement = Words.guide;
                  }
                  let cfg;
                  if (parseConfig("pinthisconfigcardnearthetop", false, "pinConfigureCard")) {
                      if (cfg) {
                          pinAndSortCards(configureCard);
                          notify("The settings config card will now be pinned near the top of your story cards list");
                      } else {
                          const index = storyCards.indexOf(configureCard);
                          if (index !== -1) {
                              storyCards.splice(index, 1);
                              storyCards.push(configureCard);
                          }
                          notify("The settings config card will no longer be pinned near the top of your story cards list");
                      }
                  }
                  if (parseConfig("minimumturnscooldownfornewcards", true, "addCardCooldown")) {
                      const oldCooldown = AC.config.addCardCooldown;
                      AC.config.addCardCooldown = validateCooldown(cfg);
                      if (!isPendingGeneration() && !isAwaitingGeneration() && (0 < AC.generation.cooldown)) {
                          const quarterCooldown = validateCooldown(underQuarterInteger(AC.config.addCardCooldown));
                          if ((AC.config.addCardCooldown < oldCooldown) && (quarterCooldown < AC.generation.cooldown)) {
                              // Reduce the next generation's cooldown counter by a factor of 4
                              // But only if the new cooldown config is lower than it was before
                              // And also only if quarter cooldown is less than the current next gen cooldown
                              // (Just a random little user experience improvement)
                              AC.generation.cooldown = quarterCooldown;
                          } else if (oldCooldown < AC.config.addCardCooldown) {
                              if (oldCooldown === AC.generation.cooldown) {
                                  AC.generation.cooldown = AC.config.addCardCooldown;
                              } else {
                                  AC.generation.cooldown = validateCooldown(boundInteger(
                                      0,
                                      AC.generation.cooldown + quarterCooldown,
                                      AC.config.addCardCooldown
                                  ));
                              }
                          }
                      }
                      switch(AC.config.addCardCooldown) {
                      case 9999: {
                          notify(
                              "You have disabled automatic card generation. To re-enable, simply set your cooldown config to any number lower than 9999. Or use the \"/ac\" in-game command to manually direct the card generation process"
                          );
                          break; }
                      case 1: {
                          notify(
                              "A new card will be generated during alternating game turns, but only if your story contains available titles"
                          );
                          break; }
                      case 0: {
                          notify(
                              "New cards will be immediately generated whenever valid titles exist within your recent story"
                          );
                          break; }
                      default: {
                          notify(
                              "A new card will be generated once every " + AC.config.addCardCooldown + " turns, but only if your story contains available titles"
                          );
                          break; }
                      }
                  }
                  if (parseConfig("newcardsuseabulletedlistformat", false, "bulletedListMode")) {
                      if (cfg) {
                          notify("New card entries will be generated using a bulleted list format");
                      } else {
                          notify("New card entries will be generated using a pure prose format");
                      }
                  }
                  if (parseConfig("maximumentrylengthfornewcards", true, "defaultEntryLimit")) {
                      AC.config.defaultEntryLimit = validateEntryLimit(cfg);
                      notify(
                          "New card entries will be limited to " + AC.config.defaultEntryLimit + " characters of generated text"
                      );
                  }
                  if (parseConfig("newcardsperformmemoryupdates", false, "defaultCardsDoMemoryUpdates")) {
                      if (cfg) {
                          notify("Newly constructed cards will begin with memory updates enabled by default");
                      } else {
                          notify("Newly constructed cards will begin with memory updates disabled by default");
                      }
                  }
                  if (parseConfig("cardmemorybankpreferredlength", true, "defaultMemoryLimit")) {
                      AC.config.defaultMemoryLimit = validateMemoryLimit(cfg);
                      notify(
                          "Newly constructed cards will begin with their memory bank length preference set to " + AC.config.defaultMemoryLimit + " characters of text"
                      );
                  }
                  if (parseConfig("memorysummarycompressionratio", true, "memoryCompressionRatio")) {
                      AC.config.memoryCompressionRatio = validateMemCompRatio(cfg);
                      notify(
                          "Freshly summarized card memory banks will be approximately " + (AC.config.memoryCompressionRatio / 10) + "x shorter than their originals"
                      );
                  }
                  if (parseConfig("excludeallcapsfromtitledetection", false, "ignoreAllCapsTitles")) {
                      if (cfg) {
                          notify("All-caps text will be ignored during title detection to help prevent bad cards");
                      } else {
                          notify("All-caps text may be considered during title detection processes");
                      }
                  }
                  if (parseConfig("alsodetecttitlesfromplayerinputs", false, "readFromInputs")) {
                      if (cfg) {
                          notify("Titles may be detected from player Do/Say/Story action inputs");
                      } else {
                          notify("Title detection will skip player Do/Say/Story action inputs for grammatical leniency");
                      }
                  }
                  if (parseConfig("minimumturnsagefortitledetection", true, "minimumLookBackDistance")) {
                      AC.config.minimumLookBackDistance = validateMLBD(cfg);
                      notify(
                          "Titles and names mentioned in your story may become eligible for future card generation attempts once they are at least " + AC.config.minimumLookBackDistance + " actions old"
                      );
                  }
                  cfg = settings.uselivescriptinterfacev2;
                  if (typeof cfg === "boolean") {
                      if (AC.config.LSIv2 === null) {
                          if (cfg) {
                              AC.config.LSIv2 = true;
                              state.LSIv2 = AC;
                              AutoCards("initialize");
                              notify("Live Script Interface v2 is now embedded within your adventure!");
                          }
                      } else {
                          if (!cfg) {
                              AC.config.LSIv2 = null;
                              notify("Live Script Interface v2 has been removed from your adventure");
                          }
                      }
                  }
                  if (parseConfig("logdebugdatainaseparatecard" , false, "showDebugData")) {
                      if (data === null) {
                          if (cfg) {
                              notify("State may now be viewed within the \"Debug Data\" story card");
                          } else {
                              notify("The \"Debug Data\" story card has been removed");
                          }
                      } else if (cfg) {
                          notify("Debug data will be shared with the \"Critical Data\" story card to conserve memory");
                      } else {
                          notify("Debug mode has been disabled");
                      }
                  }
                  if ((settings.disableautocards === true) && (AC.signal.forceToggle !== true)) {
                      disableAutoCards();
                      break;
                  } else {
                      // Apply the new card entry and proceed to implement Auto-Cards onContext
                      configureCard.entry = getConfigureCardEntry();
                  }
                  function parseConfig(settingsKey, isNumber, configKey) {
                      cfg = settings[settingsKey];
                      if (isNumber) {
                          return checkConfig("number");
                      } else if (!checkConfig("boolean")) {
                          return false;
                      }
                      AC.config[configKey] = cfg;
                      function checkConfig(type) {
                          return ((typeof cfg === type) && (
                              (notEmptyObj(oldConfig) && (oldConfig[configKey] !== cfg))
                              || (AC.config[configKey] !== cfg)
                          ));
                      }
                      return true;
                  }
              }
              if (AC.signal.forceToggle === false) {
                  disableAutoCards();
                  break;
              }
              AC.signal.forceToggle = null;
              if (0 < AC.chronometer.postpone) {
                  CODOMAIN.initialize(TEXT);
                  break;
              }
              // Fully implement Auto-Cards onContext
              const forceStep = AC.signal.recheckRetryOrErase;
              const currentTurn = getTurn();
              const nearestUnparsedAction = boundInteger(0, currentTurn - AC.config.minimumLookBackDistance);
              if (AC.signal.recheckRetryOrErase || (nearestUnparsedAction <= AC.database.titles.lastActionParsed)) {
                  // The player erased or retried an unknown number of actions
                  // Purge recent candidates and perform a safety recheck
                  if (nearestUnparsedAction <= AC.database.titles.lastActionParsed) {
                      AC.signal.recheckRetryOrErase = true;
                  } else {
                      AC.signal.recheckRetryOrErase = false;
                  }
                  AC.database.titles.lastActionParsed = boundInteger(-1, nearestUnparsedAction - 8);
                  for (let i = AC.database.titles.candidates.length - 1; 0 <= i; i--) {
                      const candidate = AC.database.titles.candidates[i];
                      for (let j = candidate.length - 1; 0 < j; j--) {
                          if (AC.database.titles.lastActionParsed < candidate[j]) {
                              candidate.splice(j, 1);
                          }
                      }
                      if (candidate.length <= 1) {
                          AC.database.titles.candidates.splice(i, 1);
                      }
                  }
              }
              const pendingCandidates = new Map();
              if ((0 < nearestUnparsedAction) && (AC.database.titles.lastActionParsed < nearestUnparsedAction)) {
                  const actions = [];
                  for (
                      let actionToParse = AC.database.titles.lastActionParsed + 1;
                      actionToParse <= nearestUnparsedAction;
                      actionToParse++
                  ) {
                      // I wrote this whilst sleep-deprived, somehow it works
                      const lookBack = currentTurn - actionToParse - (function() {
                          if (isDoSayStory(readPastAction(0).type)) {
                              // Inputs count as 2 actions instead of 1, conditionally offset lookBack by 1
                              return 0;
                          } else {
                              return 1;
                          }
                      })();
                      if (history.length <= lookBack) {
                          // history cannot be indexed with a negative integer
                          continue;
                      }
                      const action = readPastAction(lookBack);
                      const thisTextHash = new StringsHashed(4096).add(action.text).serialize();
                      if (actionToParse === nearestUnparsedAction) {
                          if (AC.signal.recheckRetryOrErase || (thisTextHash === AC.database.titles.lastTextHash)) {
                              // Additional safety to minimize duplicate candidate additions during retries or erases
                              AC.signal.recheckRetryOrErase = true;
                              break;
                          } else {
                              // Action parsing will proceed
                              AC.database.titles.lastActionParsed = nearestUnparsedAction;
                              AC.database.titles.lastTextHash = thisTextHash;
                          }
                      } else if (
                          // Special case where a consecutive retry>erase>continue cancels out
                          AC.signal.recheckRetryOrErase
                          && (actionToParse === (nearestUnparsedAction - 1))
                          && (thisTextHash === AC.database.titles.lastTextHash)
                      ) {
                          AC.signal.recheckRetryOrErase = false;
                      }
                      actions.push([action, actionToParse]);
                  }
                  if (!AC.signal.recheckRetryOrErase) {
                      for (const [action, turn] of actions) {
                          if (
                              (action.type === "see")
                              || (action.type === "unknown")
                              || (!AC.config.readFromInputs && isDoSayStory(action.type))
                              || /^[^\p{Lu}]*$/u.test(action.text)
                              || action.text.includes("<<<")
                              || /\/\s*A\s*C/i.test(action.text)
                              || /CONFIRM\s*DELETE/i.test(action.text)
                          ) {
                              // Skip see actions
                              // Skip input actions (only if input title detection has been disabled in the config)
                              // Skip strings without capital letters
                              // Skip utility actions
                              continue;
                          }
                          const words = (prettifyEmDashes(action.text)
                              // Inner Self
                              .replace(/\s*[\u200B-\u200D][\s\u200B-\u200D]*/g, " ")
                              // Localized Languages
                              .replace(/\s*[–«»„“”「」—]\s*/g, ": ")
                              .replace(/(?:^|\s+)-/g, ": ").replace(/-(?:\s+|$)/g, ": ")
                              .replace(/[‘’]/g, "'").replaceAll("´", "`")
                            // Standardize end punctuation
                            .replaceAll("。", ".").replaceAll("？", "?").replaceAll("！", "!")
                            // Replace special clause opening punctuation with colon ":" terminators
                            .replace(/(^|\s+)["'`]\s*/g, ": ").replace(/\s*[\(\[{]\s*/g, ": ")
                              // Likewise for end-quotes (curbs a common AI grammar mistake)
                              .replace(/\s*,?\s*["'`](?:\s+|$)/g, ": ")
                            // Replace funky wunky symbols with regular spaces
                            .replace(/[؟،¿¡…§，、\*_~><\)\]}#"`\s]/g, " ")
                              // Replace some mid-sentence punctuation symbols with a placeholder word
                              .replace(/\s*[;,\/\\]\s*/g, " %@% ")
                              // Replace "I", "I'm", "I'd", "I'll", and "I've" with a placeholder word
                              .replace(/(?:^|\s+|-)I(?:'(?:m|d|ll|ve))?(?:\s+|-|$)/gi, " %@% ")
                              // Remove "'s" only if not followed by a letter
                              .replace(/'s(?![a-zA-Z])/g, "")
                              // Replace "s'" with "s" only if preceded but not followed by a letter
                              .replace(/(?<=[a-zA-Z])s'(?![a-zA-Z])/g, "s")
                              // Remove apostrophes not between letters (preserve contractions like "don't")
                              .replace(/(?<![a-zA-Z])'(?![a-zA-Z])/g, "")
                              // Remove a leading bullet
                              .replace(/^\s*-+\s*/, "")
                              // Replace common honorifics with a placeholder word
                              .replace(buildKiller(Words.honorifics), " %@% ")
                              // Remove common abbreviations
                              .replace(buildKiller(Words.abbreviations), " ")
                              // Fix end punctuation
                              .replace(/\s+\.(?![a-zA-Z])/g, ".").replace(/\.\.+/g, ".")
                              .replace(/\s+\?(?![a-zA-Z])/g, "?").replace(/\?\?+/g, "?")
                              .replace(/\s+!(?![a-zA-Z])/g, "!").replace(/!!+/g, "!")
                              .replace(/\s+:(?![a-zA-Z])/g, ":").replace(/::+/g, ":")
                              // Colons are treated as substitute end-punctuation, apply the capitalization rule
                              .replace(/:\s+(\S)/g, (_, next) => ": " + next.toUpperCase())
                              // Condense consecutive whitespace
                              .trim().replace(/\s+/g, " ")
                          ).split(" ");
                          if (!Array.isArray(words) || (words.length < 2)) {
                              continue;
                          }
                          const titles = [];
                          const incompleteTitle = [];
                          let previousWordTerminates = true;
                          for (let i = 0; i < words.length; i++) {
                              let word = words[i];
                              if (startsWithTerminator()) {
                                  // This word begins on a terminator, push the preexisting incomplete title to titles and proceed with the next sentence's beginning
                                  pushTitle();
                                  previousWordTerminates = true;
                                  // Ensure no leading terminators remain
                                  while ((word !== "") && startsWithTerminator()) {
                                      word = word.slice(1);
                                  }
                              }
                              if (word === "") {
                                  continue;
                              } else if (previousWordTerminates) {
                                  // We cannot detect titles from sentence beginnings due to sentence capitalization rules. The previous sentence was recently terminated, implying the current series of capitalized words (plus lowercase minor words) occurs near the beginning of the current sentence
                                  if (endsWithTerminator()) {
                                      continue;
                                  } else if (startsWithUpperCase()) {
                                      if (isMinorWord(word)) {
                                          // Special case where a capitalized minor word precedes a named entity, clear the previous termination status
                                          previousWordTerminates = false;
                                      }
                                      // Otherwise, proceed without clearing
                                  } else if (!isMinorWord(word) && !/^(?:and|&)(?:$|[\.\?!:]$)/.test(word)) {
                                      // Previous sentence termination status is cleared by the first new non-minor lowercase word encountered during forward iteration through the action text's words
                                      previousWordTerminates = false;
                                  }
                                  continue;
                              }
                              // Words near the beginning of this sentence have been skipped, proceed with named entity detection using capitalization rules. An incomplete title will be pushed to titles if A) a non-minor lowercase word is encountered, B) three consecutive minor words occur in a row, C) a terminator symbol is encountered at the end of a word. Otherwise, continue pushing words to the incomplete title
                              if (endsWithTerminator()) {
                                  previousWordTerminates = true;
                                  while ((word !== "") && endsWithTerminator()) {
                                      word = word.slice(0, -1);
                                  }
                                  if (word === "") {
                                      pushTitle();
                                      continue;
                                  }
                              }
                              if (isMinorWord(word)) {
                                  if (0 < incompleteTitle.length) {
                                      // Titles cannot start with a minor word
                                      if (
                                          (2 < incompleteTitle.length) && !(isMinorWord(incompleteTitle[incompleteTitle.length - 1]) && isMinorWord(incompleteTitle[incompleteTitle.length - 2]))
                                      ) {
                                          // Titles cannot have 3 or more consecutive minor words in a row
                                          pushTitle();
                                          continue;
                                      } else {
                                          // Titles may contain minor words in their middles. Ex: "Ace of Spades"
                                          incompleteTitle.push(word.toLowerCase());
                                      }
                                  }
                              } else if (startsWithUpperCase()) {
                                  // Add this proper noun to the incomplete title
                                  incompleteTitle.push(word);
                              } else {
                                  // The full title has a non-minor lowercase word to its immediate right
                                  pushTitle();
                                  continue;
                              }
                              if (previousWordTerminates) {
                                  pushTitle();
                              }
                              function pushTitle() {
                                  while (
                                      (1 < incompleteTitle.length)
                                      && isMinorWord(incompleteTitle[incompleteTitle.length - 1])
                                  ) {
                                      incompleteTitle.pop();
                                  }
                                  if (0 < incompleteTitle.length) {
                                      titles.push(incompleteTitle.join(" "));
                                      // Empty the array
                                      incompleteTitle.length = 0;
                                  }
                                  return;
                              }
                              function isMinorWord(testWord) {
                                  return Words.minor.includes(testWord.toLowerCase());
                              }
                              function startsWithUpperCase() {
                                  return /^\p{Lu}/u.test(word);
                              }
                              function startsWithTerminator() {
                                  return /^[\.\?!:]/.test(word);
                              }
                              function endsWithTerminator() {
                                  return /[\.\?!:]$/.test(word);
                              }
                          }
                          for (let i = titles.length - 1; 0 <= i; i--) {
                              titles[i] = formatTitle(titles[i]).newTitle;
                              if (titles[i] === "" || (
                                  AC.config.ignoreAllCapsTitles
                                  && (2 < titles[i].replace(/[^a-zA-Z]/g, "").length)
                                  && (titles[i] === titles[i].toUpperCase())
                              )) {
                                  titles.splice(i, 1);
                              }
                          }
                          // Remove duplicates
                          const uniqueTitles = [...new Set(titles)];
                          if (uniqueTitles.length === 0) {
                              continue;
                          } else if (
                              // No reason to keep checking long past the max lookback distance
                              (currentTurn < 256)
                              && (action.type === "start")
                              // This is only used here so it doesn't need its own AC.config property or validation
                              && (S.DEFAULT_BAN_TITLES_FROM_OPENING !== false)
                          ) {
                              // Titles in the opening prompt are banned by default, hopefully accounting for the player character's name and other established setting details
                              uniqueTitles.forEach(title => banTitle(title));
                          } else {
                              // Schedule new titles for later insertion within the candidates database
                              for (const title of uniqueTitles) {
                                  const pendingHashKey = title.toLowerCase();
                                  if (pendingCandidates.has(pendingHashKey)) {
                                      // Consolidate pending candidates with matching titles but different turns
                                      pendingCandidates.get(pendingHashKey).turns.push(turn);
                                  } else {
                                      pendingCandidates.set(pendingHashKey, O.s({title, turns: [turn]}));
                                  }
                              }
                          }
                          function buildKiller(words) {
                              return (new RegExp(("(?:^|\\s+|-)(?:" + (words
                                  .map(word => word.replace(".", "\\."))
                                  .join("|")
                              ) + ")(?:\\s+|-|$)"), "gi"));
                          }
                      }
                  }
              }
              // Measure the minimum and maximum turns of occurance for all title candidates
              let minTurn = currentTurn;
              let maxTurn = 0;
              for (let i = AC.database.titles.candidates.length - 1; 0 <= i; i--) {
                  const candidate = AC.database.titles.candidates[i];
                  const title = candidate[0];
                  if (isUsedOrBanned(title) || isNamed(title)) {
                      // Retroactively ensure AC.database.titles.candidates contains no used / banned titles
                      AC.database.titles.candidates.splice(i, 1);
                  } else {
                      const pendingHashKey = title.toLowerCase();
                      if (pendingCandidates.has(pendingHashKey)) {
                          // This candidate title matches one of the pending candidates, collect the pending turns
                          candidate.push(...pendingCandidates.get(pendingHashKey).turns);
                          // Remove this pending candidate
                          pendingCandidates.delete(pendingHashKey);
                      }
                      if (2 < candidate.length) {
                          // Ensure all recorded turns of occurance are unique for this candidate
                          // Sort the turns from least to greatest
                          const sortedTurns = [...new Set(candidate.slice(1))].sort((a, b) => (a - b));
                          if (625 < sortedTurns.length) {
                              sortedTurns.splice(0, sortedTurns.length - 600);
                          }
                          candidate.length = 1;
                          candidate.push(...sortedTurns);
                      }
                      setCandidateTurnBounds(candidate);
                  }
              }
              for (const pendingCandidate of pendingCandidates.values()) {
                  // Insert any remaining pending candidates (validity has already been ensured)
                  const newCandidate = [pendingCandidate.title, ...pendingCandidate.turns];
                  setCandidateTurnBounds(newCandidate);
                  AC.database.titles.candidates.push(newCandidate);
              }
              const isCandidatesSorted = (function() {
                  if (425 < AC.database.titles.candidates.length) {
                      // Sorting a large title candidates database is computationally expensive
                      sortCandidates();
                      AC.database.titles.candidates.splice(400);
                      // Flag this operation as complete for later consideration
                      return true;
                  } else {
                      return false;
                  }
              })();
              Internal.getUsedTitles();
              for (const titleKey in AC.database.memories.associations) {
                  if (isAuto(titleKey)) {
                      // Reset the lifespan counter
                      AC.database.memories.associations[titleKey][0] = 999;
                  } else if (AC.database.memories.associations[titleKey][0] < 1) {
                      // Forget this set of memory associations
                      delete AC.database.memories.associations[titleKey];
                  } else if (!isAwaitingGeneration()) {
                      // Decrement the lifespan counter
                      AC.database.memories.associations[titleKey][0]--;
                  }
              }
              // This copy of TEXT may be mutated
              let context = TEXT;
              const titleHeaderPatternGlobal = /\s*{\s*titles?\s*:\s*([\s\S]*?)\s*}\s*/gi;
              // Card events govern the parsing of memories from raw context as well as card memory bank injection
              const cardEvents = (function() {
                  // Extract memories from the initial text (not TEXT as called from within the context modifier!)
                  const contextMemories = (function() {
                      const memoriesMatch = text.match(/Memories\s*:\s*([\s\S]*?)\s*(?:Recent\s*Story\s*:|$)/i);
                      if (!memoriesMatch) {
                          return new Set();
                      }
                      const uniqueMemories = new Set(isolateMemories(memoriesMatch[1]));
                      if (uniqueMemories.size === 0) {
                          return uniqueMemories;
                      }
                      const duplicatesHashed = StringsHashed.deserialize(AC.database.memories.duplicates, 65536);
                      const duplicateMemories = new Set();
                      const seenMemories = new Set();
                      for (const memoryA of uniqueMemories) {
                          if (duplicatesHashed.has(memoryA)) {
                              // Remove to ensure the insertion order for this duplicate changes
                              duplicatesHashed.remove(memoryA);
                              duplicateMemories.add(memoryA);
                          } else if ((function() {
                              for (const memoryB of seenMemories) {
                                  if (0.42 < similarityScore(memoryA, memoryB)) {
                                      // This memory is too similar to another memory
                                      duplicateMemories.add(memoryA);
                                      return false;
                                  }
                              }
                              return true;
                          })()) {
                              seenMemories.add(memoryA);
                          }
                      }
                      if (0 < duplicateMemories.size) {
                          // Add each near duplicate's hashcode to AC.database.memories.duplicates
                          // Then remove duplicates from uniqueMemories and the context window
                          for (const duplicate of duplicateMemories) {
                              duplicatesHashed.add(duplicate);
                              uniqueMemories.delete(duplicate);
                              context = context.replaceAll("\n" + duplicate, "");
                          }
                          // Only the 2000 most recent duplicate memory hashcodes are remembered
                          AC.database.memories.duplicates = duplicatesHashed.latest(2000).serialize();
                      }
                      return uniqueMemories;
                  })();
                  const leftBoundary = "^|\\s|\"|'|—|\\(|\\[|{";
                  const rightBoundary = "\\s|\\.|\\?|!|,|;|\"|'|—|\\)|\\]|}|$";
                  // Murder, homicide if you will, nothing to see here
                  const theKiller = new RegExp("(?:" + leftBoundary + ")the[\\s\\S]*$", "i");
                  const peerageKiller = new RegExp((
                      "(?:" + leftBoundary + ")(?:" + Words.peerage.join("|") + ")(?:" + rightBoundary + ")"
                  ), "gi");
                  const events = new Map();
                  for (const contextMemory of contextMemories) {
                      for (const titleKey of auto) {
                          if (!(new RegExp((
                              "(?<=" + leftBoundary + ")" + (titleKey
                                  .replace(theKiller, "")
                                  .replace(peerageKiller, "")
                                  .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                              ) + "(?=" + rightBoundary + ")"
                          ), "i")).test(contextMemory)) {
                              continue;
                          }
                          // AC card titles found in active memories will promote card events
                          if (events.has(titleKey)) {
                              events.get(titleKey).pendingMemories.push(contextMemory);
                              continue;
                          }
                          events.set(titleKey, O.s({
                              pendingMemories: [contextMemory],
                              titleHeader: ""
                          }));
                      }
                  }
                  const titleHeaderMatches = [...context.matchAll(titleHeaderPatternGlobal)];
                  for (const [titleHeader, title] of titleHeaderMatches) {
                      if (!isAuto(title)) {
                          continue;
                      }
                      // Unique title headers found in context will promote card events
                      const titleKey = title.toLowerCase();
                      if (events.has(titleKey)) {
                          events.get(titleKey).titleHeader = titleHeader;
                          continue;
                      }
                      events.set(titleKey, O.s({
                          pendingMemories: [],
                          titleHeader: titleHeader
                      }));
                  }
                  return events;
              })();
              // Remove auto card title headers from active story card entries and contextualize their respective memory banks
              // Also handle the growth and maintenance of card memory banks
              let isRemembering = false;
              for (const card of storyCards) {
                  // Iterate over each card to handle pending card events and forenames/surnames
                  const titleHeaderMatcher = /^{title: \s*([\s\S]*?)\s*}/;
                  let breakForCompression = isPendingCompression();
                  let simplifications = 0;
                  if (breakForCompression) {
                      break;
                  } else if (!card.entry.startsWith("{title: ")) {
                      continue;
                  } else if (exceedsMemoryLimit()) {
                      const titleHeaderMatch = card.entry.match(titleHeaderMatcher);
                      if (titleHeaderMatch && isAuto(titleHeaderMatch[1])) {
                          prepareMemoryCompression(titleHeaderMatch[1].toLowerCase());
                          break;
                      }
                  }
                  // Handle card events
                  const lowerEntry = card.entry.toLowerCase();
                  for (const titleKey of cardEvents.keys()) {
                      if (!lowerEntry.startsWith("{title: " + titleKey + "}")) {
                          continue;
                      }
                      const cardEvent = cardEvents.get(titleKey);
                      if (
                          (0 < cardEvent.pendingMemories.length)
                          && /{\s*updates?\s*:\s*true\s*,\s*limits?\s*:[\s\S]*?}/i.test(card.description)
                      ) {
                          // Add new card memories
                          const associationsHashed = (function() {
                              if (titleKey in AC.database.memories.associations) {
                                  return StringsHashed.deserialize(AC.database.memories.associations[titleKey][1], 65536);
                              } else {
                                  AC.database.memories.associations[titleKey] = [999, ""];
                                  return new StringsHashed(65536);
                              }
                          })();
                          const oldMemories = isolateMemories(extractCardMemories().text);
                          for (let i = 0; i < cardEvent.pendingMemories.length; i++) {
                              if (associationsHashed.has(cardEvent.pendingMemories[i])) {
                                  // Remove first to alter the insertion order
                                  associationsHashed.remove(cardEvent.pendingMemories[i]);
                              } else if (!oldMemories.some(oldMemory => (
                                  (0.8 < similarityScore(oldMemory, cardEvent.pendingMemories[i]))
                              ))) {
                                  // Ensure no near-duplicate memories are appended
                                  card.description += "\n- " + cardEvent.pendingMemories[i];
                              }
                              associationsHashed.add(cardEvent.pendingMemories[i]);
                          }
                          AC.database.memories.associations[titleKey][1] = associationsHashed.latest(3500).serialize();
                          if (associationsHashed.size() === 0) {
                              delete AC.database.memories.associations[titleKey];
                          }
                          if (exceedsMemoryLimit()) {
                              breakForCompression = prepareMemoryCompression(titleKey);
                              break;
                          }
                      }
                      if (cardEvent.titleHeader !== "") {
                          // Replace this card's title header in context
                          const cardMemoriesText = extractCardMemories().text;
                          if (cardMemoriesText === "") {
                              // This card contains no card memories to contextualize
                              context = context.replace(cardEvent.titleHeader, "\n\n");
                          } else {
                              // Insert card memories within context and ensure they occur uniquely
                              const cardMemories = cardMemoriesText.split("\n").map(cardMemory => cardMemory.trim());
                              for (const cardMemory of cardMemories) {
                                  if (25 < cardMemory.length) {
                                      context = (context
                                          .replaceAll(cardMemory, "<#>")
                                          .replaceAll(cardMemory.replace(/^-+\s*/, ""), "<#>")
                                      );
                                  }
                              }
                              context = context.replace(cardEvent.titleHeader, (
                                  "\n\n{%@MEM@%" + cardMemoriesText + "%@MEM@%}\n"
                              ));
                              isRemembering = true;
                          }
                      }
                      cardEvents.delete(titleKey);
                      break;
                  }
                  if (breakForCompression) {
                      break;
                  } else if ((2 < simplifications) || (card.entry.includes("<") && card.entry.includes(">"))) {
                      continue;
                  }
                  // Simplify auto-card titles which contain an obvious surname
                  const titleHeaderMatch = card.entry.match(titleHeaderMatcher);
                  if (!titleHeaderMatch) {
                      continue;
                  }
                  const [oldTitleHeader, oldTitle] = titleHeaderMatch;
                  if (!isAuto(oldTitle)) {
                      continue;
                  }
                  const surname = isNamed(oldTitle, true);
                  if (typeof surname !== "string") {
                      continue;
                  }
                  const newTitle = oldTitle.replace(" " + surname, "");
                  const [oldTitleKey, newTitleKey] = [oldTitle, newTitle].map(title => title.toLowerCase());
                  if (oldTitleKey === newTitleKey) {
                      continue;
                  }
                  // Preemptively mitigate some global state considered within the formatTitle scope
                  clearTransientTitles();
                  AC.database.titles.used = ["%@%"];
                  [used, forenames, surnames].forEach(nameset => nameset.add("%@%"));
                  // Premature optimization is the root of all evil
                  const newKey = formatTitle(newTitle).newKey;
                  clearTransientTitles();
                  simplifications++;
                  if (newKey === "") {
                      Internal.getUsedTitles();
                      continue;
                  }
                  if (oldTitleKey in AC.database.memories.associations) {
                      AC.database.memories.associations[newTitleKey] = AC.database.memories.associations[oldTitleKey];
                      delete AC.database.memories.associations[oldTitleKey];
                  }
                  if (AC.compression.titleKey === oldTitleKey) {
                      AC.compression.titleKey = newTitleKey;
                  }
                  card.entry = card.entry.replace(oldTitleHeader, oldTitleHeader.replace(oldTitle, newTitle));
                  card.keys = buildKeys(card.keys.replaceAll(" " + surname, ""), newKey);
                  Internal.getUsedTitles();
                  function exceedsMemoryLimit() {
                      return ((function() {
                          const memoryLimitMatch = card.description.match(/limits?\s*:\s*(\d+)\s*}/i);
                          if (memoryLimitMatch) {
                              return validateMemoryLimit(parseInt(memoryLimitMatch[1], 10));
                          } else {
                              return AC.config.defaultMemoryLimit;
                          }
                      })() < (function() {
                          const cardMemories = extractCardMemories();
                          if (cardMemories.missing) {
                              return card.description;
                          } else {
                              return cardMemories.text;
                          }
                      })().length);
                  }
                  function prepareMemoryCompression(titleKey) {
                      AC.compression.oldMemoryBank = isolateMemories(extractCardMemories().text);
                      if (AC.compression.oldMemoryBank.length === 0) {
                          return false;
                      }
                      AC.compression.completed = 0;
                      AC.compression.titleKey = titleKey;
                      AC.compression.vanityTitle = cleanSpaces(card.title.trim());
                      AC.compression.responseEstimate = (function() {
                          const responseEstimate = estimateResponseLength();
                          if (responseEstimate === -1) {
                              return 1400
                          } else {
                              return responseEstimate;
                          }
                      })();
                      AC.compression.lastConstructIndex = -1;
                      AC.compression.newMemoryBank = [];
                      return true;
                  }
                  function extractCardMemories() {
                      const memoryHeaderMatch = card.description.match(
                          /(?<={\s*updates?\s*:[\s\S]*?,\s*limits?\s*:[\s\S]*?})[\s\S]*$/i
                      );
                      if (memoryHeaderMatch) {
                          return O.f({missing: false, text: cleanSpaces(memoryHeaderMatch[0].trim())});
                      } else {
                          return O.f({missing: true, text: ""});
                      }
                  }
              }
              // Remove repeated memories plus any remaining title headers
              context = (context
                  .replace(/(\s*<#>\s*)+/g, "\n")
                  .replace(titleHeaderPatternGlobal, "\n\n")
                  .replace(/World\s*Lore\s*:\s*/i, "World Lore:\n")
                  .replace(/Memories\s*:\s*(?=Recent\s*Story\s*:|$)/i, "")
              );
              // Prompt the AI to generate a new card entry, compress an existing card's memories, or continue the story
              let isGenerating = false;
              let isCompressing = false;
              if (isPendingGeneration()) {
                  promptGeneration();
              } else if (isAwaitingGeneration()) {
                  AC.generation.workpiece = AC.generation.pending.shift();
                  promptGeneration();
              } else if (isPendingCompression()) {
                  promptCompression();
              } else if (AC.signal.recheckRetryOrErase) {
                  // Do nothing 😜
              } else if ((AC.generation.cooldown <= 0) && (0 < AC.database.titles.candidates.length)) {
                  // Prepare to automatically construct a new plot-relevant story card by selecting a title
                  let selectedTitle = (function() {
                      if (AC.database.titles.candidates.length === 1) {
                          return AC.database.titles.candidates[0][0];
                      } else if (!isCandidatesSorted) {
                          sortCandidates();
                      }
                      const mostRelevantTitle = AC.database.titles.candidates[0][0];
                      if ((AC.database.titles.candidates.length < 16) || (Math.random() < 0.6667)) {
                          // Usually, 2/3 of the time, the most relevant title is selected
                          return mostRelevantTitle;
                      }
                      // Occasionally (1/3 of the time once the candidates databases has at least 16 titles) make a completely random selection between the top 4 most recently occuring title candidates which are NOT the top 2 most relevant titles. Note that relevance !== recency
                      // This gives non-character titles slightly better odds of being selected for card generation due to the relevance sorter's inherent bias towards characters; they tend to appear far more often in prose
                      return (AC.database.titles.candidates
                          // Create a shallow copy to avoid modifying AC.database.titles.candidates itself
                          // Add index to preserve original positions whenever ties occur during sorting
                          .map((candidate, index) => ({candidate, index}))
                          // Sort by each candidate's most recent turn
                          .sort((a, b) => {
                              const turnDiff = b.candidate[b.candidate.length - 1] - a.candidate[a.candidate.length - 1];
                              if (turnDiff === 0) {
                                  // Don't change indices in the case of a tie
                                  return (a.index - b.index);
                              } else {
                                  // No tie here, sort by recency
                                  return turnDiff;
                              }
                          })
                          // Get the top 6 most recent titles (4 + 2 because the top 2 relevant titles may be present)
                          .slice(0, 6)
                          // Extract only the title names
                          .map(element => element.candidate[0])
                          // Exclude the top 2 most relevant titles
                          .filter(title => ((title !== mostRelevantTitle) && (title !== AC.database.titles.candidates[1][0])))
                          // Ensure only 4 titles remain
                          .slice(0, 4)
                      )[Math.floor(Math.random() * 4)];
                  })();
                  while (!Internal.generateCard(O.f({title: selectedTitle}))) {
                      // This is an emergency precaution, I don't expect the interior of this while loop to EVER execute
                      // That said, it's crucial for the while condition be checked at least once, because Internal.generateCard appends an element to AC.generation.pending as a side effect
                      const lowerSelectedTitle = formatTitle(selectedTitle).newTitle.toLowerCase();
                      const index = AC.database.titles.candidates.findIndex(candidate => {
                          return (formatTitle(candidate[0]).newTitle.toLowerCase() === lowerSelectedTitle);
                      });
                      if (index === -1) {
                          // Should be impossible
                          break;
                      }
                      AC.database.titles.candidates.splice(index, 1);
                      if (AC.database.titles.candidates.length === 0) {
                          break;
                      }
                      selectedTitle = AC.database.titles.candidates[0][0];
                  }
                  if (isAwaitingGeneration()) {
                      // Assign the workpiece so card generation may fully commence!
                      AC.generation.workpiece = AC.generation.pending.shift();
                      promptGeneration();
                  } else if (isPendingCompression()) {
                      promptCompression();
                  }
              } else if (
                  (AC.chronometer.step || forceStep)
                  && (0 < AC.generation.cooldown)
                  && (AC.config.addCardCooldown !== 9999)
              ) {
                  AC.generation.cooldown--;
              }
              if (shouldTrimContext()) {
                  // Truncate context based on AC.signal.maxChars, begin by individually removing the oldest sentences from the recent story portion of the context window
                  const recentStoryPattern = /Recent\s*Story\s*:\s*([\s\S]*?)(%@GEN@%|%@COM@%|\s\[\s*Author's\s*note\s*:|$)/i;
                  const recentStoryMatch = context.match(recentStoryPattern);
                  if (recentStoryMatch) {
                      const recentStory = recentStoryMatch[1];
                      let sentencesJoined = recentStory;
                      // Split by the whitespace chars following each sentence (without consuming)
                      const sentences = splitBySentences(recentStory);
                      // [minimum num of story sentences] = ([max chars for context] / 6) / [average chars per sentence]
                      const sentencesMinimum = Math.ceil(
                          (AC.signal.maxChars / 6) / (
                              boundInteger(1, context.length) / boundInteger(1, sentences.length)
                          )
                      ) + 1;
                      do {
                          if (sentences.length < sentencesMinimum) {
                              // A minimum of n many recent story sentences must remain
                              // Where n represents a sentence count equal to roughly 16.7% of the full context chars
                              break;
                          }
                          // Remove the first (oldest) recent story sentence
                          sentences.shift();
                          // Check if the total length exceeds the AC.signal.maxChars limit
                          sentencesJoined = sentences.join("");
                      } while (AC.signal.maxChars < (context.length - recentStory.length + sentencesJoined.length + 3));
                      // Rebuild the context with the truncated recentStory
                      context = context.replace(recentStoryPattern, "Recent Story:\n" + sentencesJoined + recentStoryMatch[2]);
                  }
                  if (isRemembering && shouldTrimContext()) {
                      // Next remove loaded card memories (if any) with top-down priority, one card at a time
                      do {
                          // This matcher relies on its case-sensitivity
                          const cardMemoriesMatch = context.match(/{%@MEM@%([\s\S]+?)%@MEM@%}/);
                          if (!cardMemoriesMatch) {
                              break;
                          }
                          context = context.replace(cardMemoriesMatch[0], (cardMemoriesMatch[0]
                              .replace(cardMemoriesMatch[1], "")
                              // Set the MEM tags to lowercase to avoid repeated future matches
                              .toLowerCase()
                          ));
                      } while (AC.signal.maxChars < (context.length + 3));
                  }
                  if (shouldTrimContext()) {
                      // If the context is still too long, just trim from the beginning I guess 🤷‍♀️
                      context = context.slice(context.length - AC.signal.maxChars + 1);
                  }
              }
              if (isRemembering) {
                  // Card memory flags serve no further purpose
                  context = (context
                      // Case-insensitivity is crucial here
                      .replace(/(?<={%@MEM@%)\s*/gi, "")
                      .replace(/\s*(?=%@MEM@%})/gi, "")
                      .replace(/{%@MEM@%%@MEM@%}\s?/gi, "")
                      .replaceAll("{%@MEM@%", "{ Memories:\n")
                      .replaceAll("%@MEM@%}", " }")
                  );
              }
              if (isGenerating || isCompressing) {
                  state.InnerSelf ??= {};
                  state.InnerSelf.AC ??= {};
                  state.InnerSelf.AC.event = true;
                  if (isGenerating) {
                      // Likewise for the card entry generation delimiter
                      context = context.replaceAll("%@GEN@%", "");
                  } else {
                      // Or the (mutually exclusive) card memory compression delimiter
                      context = context.replaceAll("%@COM@%", "");
                  }
              }
              CODOMAIN.initialize(context);
              function isolateMemories(memoriesText) {
                  return (memoriesText
                      .split("\n")
                      .map(memory => cleanSpaces(memory.trim().replace(/^-+\s*/, "")))
                      .filter(memory => (memory !== ""))
                  );
              }
              function isAuto(title) {
                  return auto.has(title.toLowerCase());
              }
              function promptCompression() {
                  isGenerating = false;
                  const cardEntryText = (function() {
                      const card = getAutoCard(AC.compression.titleKey);
                      if (card === null) {
                          return null;
                      }
                      const entryLines = formatEntry(card.entry).trimEnd().split("\n");
                      if (Object.is(entryLines[0].trim(), "")) {
                          return "";
                      }
                      for (let i = 0; i < entryLines.length; i++) {
                          entryLines[i] = entryLines[i].trim();
                          if (/[a-zA-Z]$/.test(entryLines[i])) {
                              entryLines[i] += ".";
                          }
                          entryLines[i] += " ";
                      }
                      return entryLines.join("");
                  })();
                  if (cardEntryText === null) {
                      // Safety measure
                      resetCompressionProperties();
                      return;
                  }
                  repositionAN();
                  // The "%COM%" substring serves as a temporary delimiter for later context length trucation
                  context = context.trimEnd() + "\n\n" + cardEntryText + (
                      [...AC.compression.newMemoryBank, ...AC.compression.oldMemoryBank].join(" ")
                  ) + "%@COM@%\n\n" + (function() {
                      const memoryConstruct = (function() {
                          if (AC.compression.lastConstructIndex === -1) {
                              for (let i = 0; i < AC.compression.oldMemoryBank.length; i++) {
                                  AC.compression.lastConstructIndex = i;
                                  const memoryConstruct = buildMemoryConstruct();
                                  if ((
                                      (AC.config.memoryCompressionRatio / 10) * AC.compression.responseEstimate
                                  ) < memoryConstruct.length) {
                                      return memoryConstruct;
                                  }
                              }
                          } else {
                              // The previous card memory compression attempt produced a bad output
                              AC.compression.lastConstructIndex = boundInteger(
                                  0, AC.compression.lastConstructIndex + 1, AC.compression.oldMemoryBank.length - 1
                              );
                          }
                          return buildMemoryConstruct();
                      })();
                      // Fill all %{title} placeholders
                      const precursorPrompt = insertTitle(AC.config.compressionPrompt, AC.compression.vanityTitle).trim();
                      const memoryPlaceholderPattern = /(?:[%\$]+\s*|[%\$]*){+\s*memor(y|ies)\s*}+/gi;
                      if (memoryPlaceholderPattern.test(precursorPrompt)) {
                          // Fill all %{memory} placeholders with a selection of pending old memories
                          return precursorPrompt.replace(memoryPlaceholderPattern, memoryConstruct);
                      } else {
                          // Append the partial entry to the end of context
                          return precursorPrompt + "\n\n" + memoryConstruct;
                      }
                  })() + "\n\n";
                  isCompressing = true;
                  return;
              }
              function promptGeneration() {
                  repositionAN();
                  // All %{title} placeholders were already filled during this workpiece's initialization
                  // The "%GEN%" substring serves as a temporary delimiter for later context length trucation
                  context = context.trimEnd() + "%@GEN@%\n\n" + (function() {
                      // For context only, remove the title header from this workpiece's partially completed entry
                      const partialEntry = formatEntry(AC.generation.workpiece.entry);
                      const entryPlaceholderPattern = /(?:[%\$]+\s*|[%\$]*){+\s*entry\s*}+/gi;
                      if (entryPlaceholderPattern.test(AC.generation.workpiece.prompt)) {
                          // Fill all %{entry} placeholders with the partial entry
                          return AC.generation.workpiece.prompt.replace(entryPlaceholderPattern, partialEntry);
                      } else {
                          // Append the partial entry to the end of context
                          return AC.generation.workpiece.prompt.trimEnd() + "\n\n" + partialEntry;
                      }
                  })();
                  isGenerating = true;
                  return;
              }
              function repositionAN() {
                  // Move the Author's Note further back in context during card generation (should still be considered)
                  const authorsNotePattern = /\s*(\[\s*Author's\s*note\s*:[\s\S]*\])\s*/i;
                  const authorsNoteMatch = context.match(authorsNotePattern);
                  if (!authorsNoteMatch) {
                      return;
                  }
                  const leadingSpaces = context.match(/^\s*/)[0];
                  context = context.replace(authorsNotePattern, " ").trimStart();
                  const recentStoryPattern = /\s*Recent\s*Story\s*:\s*/i;
                  if (recentStoryPattern.test(context)) {
                      // Remove author's note from its original position and insert above "Recent Story:\n"
                      context = (context
                          .replace(recentStoryPattern, "\n\n" + authorsNoteMatch[1] + "\n\nRecent Story:\n")
                          .trimStart()
                      );
                  } else {
                      context = authorsNoteMatch[1] + "\n\n" + context;
                  }
                  context = leadingSpaces + context;
                  return;
              }
              function sortCandidates() {
                  if (AC.database.titles.candidates.length < 2) {
                      return;
                  }
                  const turnRange = boundInteger(1, maxTurn - minTurn);
                  const recencyExponent = Math.log10(turnRange) + 1.85;
                  // Sort the database of available title candidates by relevance
                  AC.database.titles.candidates.sort((a, b) => {
                      return relevanceScore(b) - relevanceScore(a);
                  });
                  function relevanceScore(candidate) {
                      // weight = (((turn - minTurn) / (maxTurn - minTurn)) + 1)^(log10(maxTurn - minTurn) + 1.85)
                      return candidate.slice(1).reduce((sum, turn) => {
                          // Apply exponential scaling to give far more weight to recent turns
                          return sum + Math.pow((
                              // The recency weight's exponent scales by log10(turnRange) + 1.85
                              // Shhh don't question it 😜
                              ((turn - minTurn) / turnRange) + 1
                          ), recencyExponent);
                      }, 0);
                  }
                  return;
              }
              function shouldTrimContext() {
                  return (AC.signal.maxChars <= context.length);
              }
              function setCandidateTurnBounds(candidate) {
                  // candidate: ["Example Title", 0, 1, 2, 3]
                  minTurn = boundInteger(0, minTurn, candidate[1]);
                  maxTurn = boundInteger(candidate[candidate.length - 1], maxTurn);
                  return;
              }
              function disableAutoCards() {
                  AC.signal.forceToggle = null;
                  // Auto-Cards has been disabled
                  AC.config.doAC = false;
                  // Deconstruct the "Configure Auto-Cards" story card
                  unbanTitle(configureCardTemplate.title);
                  eraseCard(configureCard);
                  // Signal the construction of "Edit to enable Auto-Cards" during the next onOutput hook
                  AC.signal.swapControlCards = true;
                  // Post a success message
                  notify("Disabled! Use the \"Edit to enable Auto-Cards\" story card to undo");
                  CODOMAIN.initialize(TEXT);
                  return;
              }
              break; }
          case "output": {
              // AutoCards was called within the output modifier
              const output = prettifyEmDashes(TEXT);
              if (0 < AC.chronometer.postpone) {
                  // Do not capture or replace any outputs during this turn
                  promoteAmnesia();
                  if (permitOutput()) {
                      CODOMAIN.initialize(output);
                  }
              } else if (AC.signal.swapControlCards) {
                  if (permitOutput()) {
                      CODOMAIN.initialize(output);
                  }
              } else if (isPendingGeneration()) {
                  const textClone = prettifyEmDashes(text);
                  AC.chronometer.amnesia = 0;
                  AC.generation.completed++;
                  const generationsRemaining = (function() {
                      if (
                          textClone.includes("\"")
                          || /(?<=^|\s|—|\(|\[|{)sa(ys?|id)(?=\s|\.|\?|!|,|;|—|\)|\]|}|$)/i.test(textClone)
                      ) {
                          // Discard full outputs containing "say" or quotations
                          // To build coherent entries, the AI must not attempt to continue the story
                          return skip(estimateRemainingGens());
                      }
                      const oldSentences = (splitBySentences(formatEntry(AC.generation.workpiece.entry))
                          .map(sentence => sentence.trim())
                          .filter(sentence => (2 < sentence.length))
                      );
                      const seenSentences = new Set();
                      const entryAddition = splitBySentences(textClone
                          .replace(/[\*_~]/g, "")
                          .replace(/:+/g, "#")
                          .replace(/\s+/g, " ")
                      ).map(sentence => (sentence
                          .trim()
                          .replace(/^-+\s*/, "")
                      )).filter(sentence => (
                          // Remove empty strings
                          (sentence !== "")
                          // Remove colon ":" headers or other stinky symbols because me no like 😠
                          && !/[#><@]/.test(sentence)
                          // Remove previously repeated sentences
                          && !oldSentences.some(oldSentence => (0.75 < similarityScore(oldSentence, sentence)))
                          // Remove repeated sentences from within entryAddition itself
                          && ![...seenSentences].some(seenSentence => (0.75 < similarityScore(seenSentence, sentence)))
                          // Simply ensure this sentence is henceforth unique
                          && seenSentences.add(sentence)
                      )).join(" ").trim() + " ";
                      if (entryAddition === " ") {
                          return skip(estimateRemainingGens());
                      } else if (
                          /^{title:[\s\S]*?}$/.test(AC.generation.workpiece.entry.trim())
                          && (AC.generation.workpiece.entry.length < 111)
                      ) {
                          AC.generation.workpiece.entry += "\n" + entryAddition;
                      } else {
                          AC.generation.workpiece.entry += entryAddition;
                      }
                      if (AC.generation.workpiece.limit < AC.generation.workpiece.entry.length) {
                          let exit = false;
                          let truncatedEntry = AC.generation.workpiece.entry.trimEnd();
                          const sentences = splitBySentences(truncatedEntry);
                          for (let i = sentences.length - 1; 0 <= i; i--) {
                              if (!sentences[i].includes("\n")) {
                                  sentences.splice(i, 1);
                                  truncatedEntry = sentences.join("").trimEnd();
                                  if (truncatedEntry.length <= AC.generation.workpiece.limit) {
                                      break;
                                  }
                                  continue;
                              }
                              // Lines only matter for initial entries provided via AutoCards().API.generateCard
                              const lines = sentences[i].split("\n");
                              for (let j = lines.length - 1; 0 <= j; j--) {
                                  lines.splice(j, 1);
                                  sentences[i] = lines.join("\n");
                                  truncatedEntry = sentences.join("").trimEnd();
                                  if (truncatedEntry.length <= AC.generation.workpiece.limit) {
                                      // Exit from both loops
                                      exit = true;
                                      break;
                                  }
                              }
                              if (exit) {
                                  break;
                              }
                          }
                          if (truncatedEntry.length < 150) {
                              // Disregard the previous sentence/line-based truncation attempt
                              AC.generation.workpiece.entry = limitString(
                                  AC.generation.workpiece.entry, AC.generation.workpiece.limit
                              );
                              // Attempt to remove the last word/fragment
                              truncatedEntry = AC.generation.workpiece.entry.replace(/\s*\S+$/, "");
                              if (150 <= truncatedEntry) {
                                  AC.generation.workpiece.entry = truncatedEntry;
                              }
                          } else {
                              AC.generation.workpiece.entry = truncatedEntry;
                          }
                          return 0;
                      } else if ((AC.generation.workpiece.limit - 50) <= AC.generation.workpiece.entry.length) {
                          AC.generation.workpiece.entry = AC.generation.workpiece.entry.trimEnd();
                          return 0;
                      }
                      function skip(remaining) {
                          if (AC.generation.permitted <= AC.generation.completed) {
                              AC.generation.workpiece.entry = AC.generation.workpiece.entry.trimEnd();
                              return 0;
                          }
                          return remaining;
                      }
                      function estimateRemainingGens() {
                          const responseEstimate = estimateResponseLength();
                          if (responseEstimate === -1) {
                              return 1;
                          }
                          const remaining = boundInteger(1, Math.round(
                              (150 + AC.generation.workpiece.limit - AC.generation.workpiece.entry.length) / responseEstimate
                          ));
                          if (AC.generation.permitted === 34) {
                              AC.generation.permitted = boundInteger(6, Math.floor(3.5 * remaining), 32);
                          }
                          return remaining;
                      }
                      return skip(estimateRemainingGens());
                  })();
                  postOutputMessage(AC.generation.completed / Math.min(
                      AC.generation.permitted,
                      AC.generation.completed + generationsRemaining
                  ));
                  if (generationsRemaining <= 0) {
                      notify("\"" + AC.generation.workpiece.title + "\" was successfully added to your story cards!");
                      constructCard(O.f({
                          type: AC.generation.workpiece.type,
                          title: AC.generation.workpiece.title,
                          keys: AC.generation.workpiece.keys,
                          entry: (function() {
                              if (!AC.config.bulletedListMode) {
                                  return AC.generation.workpiece.entry;
                              }
                              const sentences = splitBySentences(
                                  formatEntry(
                                      AC.generation.workpiece.entry.replace(/\s+/g, " ")
                                  ).replace(/:+/g, "#")
                              ).map(sentence => {
                                  sentence = (sentence
                                      .replaceAll("#", ":")
                                      .trim()
                                      .replace(/^-+\s*/, "")
                                  );
                                  if (sentence.length < 12) {
                                      return sentence;
                                  } else {
                                      return "\n- " + sentence.replace(/\s*[\.\?!]+$/, "");
                                  }
                              });
                              const titleHeader = "{title: " + AC.generation.workpiece.title + "}";
                              if (sentences.every(sentence => (sentence.length < 12))) {
                                  const sentencesJoined = sentences.join(" ").trim();
                                  if (sentencesJoined === "") {
                                      return titleHeader;
                                  } else {
                                      return limitString(titleHeader + "\n" + sentencesJoined, 2000);
                                  }
                              }
                              for (let i = sentences.length - 1; 0 <= i; i--) {
                                  const bulletedEntry = cleanSpaces(titleHeader + sentences.join(" ")).trimEnd();
                                  if (bulletedEntry.length <= 2000) {
                                      return bulletedEntry;
                                  }
                                  if (sentences.length === 1) {
                                      break;
                                  }
                                  sentences.splice(i, 1);
                              }
                              return limitString(AC.generation.workpiece.entry, 2000);
                          })(),
                          description: AC.generation.workpiece.description,
                      }), newCardIndex());
                      AC.generation.cooldown = AC.config.addCardCooldown;
                      AC.generation.completed = 0;
                      AC.generation.permitted = 34;
                      AC.generation.workpiece = O.f({});
                      clearTransientTitles();
                  }
              } else if (isPendingCompression()) {
                  const textClone = prettifyEmDashes(text);
                  AC.chronometer.amnesia = 0;
                  AC.compression.completed++;
                  const compressionsRemaining = (function() {
                      const newMemory = (textClone
                          // Remove some dumb stuff
                          .replace(/^[\s\S]*:/g, "")
                          .replace(/[\*_~#><@\[\]{}`\\]/g, " ")
                        // Remove bullets
                        .trim().replace(/^-+\s*/, "").replace(/\s*-+$/, "").replace(/\s*-\s+/g, " ")
                        // Condense consecutive whitespace
                        .replace(/\s+/g, " ")
                    );
                    if ((AC.compression.oldMemoryBank.length - 1) <= AC.compression.lastConstructIndex) {
                        // Terminate this compression cycle; the memory construct cannot grow any further
                        AC.compression.newMemoryBank.push(newMemory);
                        return 0;
                    } else if ((newMemory.trim() !== "") && (newMemory.length < buildMemoryConstruct().length)) {
                        // Good output, preserve and then proceed onwards
                        AC.compression.oldMemoryBank.splice(0, AC.compression.lastConstructIndex + 1);
                        AC.compression.lastConstructIndex = -1;
                        AC.compression.newMemoryBank.push(newMemory);
                    } else {
                        // Bad output, discard and then try again
                        AC.compression.responseEstimate += 200;
                    }
                    return boundInteger(1, joinMemoryBank(AC.compression.oldMemoryBank).length) / AC.compression.responseEstimate;
                })();
                postOutputMessage(AC.compression.completed / (AC.compression.completed + compressionsRemaining));
                if (compressionsRemaining <= 0) {
                    const card = getAutoCard(AC.compression.titleKey);
                    if (card === null) {
                        notify(
                            "Failed to apply summarized memories for \"" + AC.compression.vanityTitle + "\" due to a missing or invalid AC card title header!"
                        );
                    } else {
                        const memoryHeaderMatch = card.description.match(
                            /(?<={\s*updates?\s*:[\s\S]*?,\s*limits?\s*:[\s\S]*?})[\s\S]*$/i
                        );
                        if (memoryHeaderMatch) {
                            // Update the card memory bank
                            notify("Memories for \"" + AC.compression.vanityTitle + "\" were successfully summarized!");
                            card.description = card.description.replace(memoryHeaderMatch[0], (
                                "\n" + joinMemoryBank(AC.compression.newMemoryBank)
                            ));
                        } else {
                            notify(
                                "Failed to apply summarizes memories for \"" + AC.compression.vanityTitle + "\" due to a missing or invalid AC card memory header!"
                            );
                        }
                    }
                    resetCompressionProperties();
                } else if (AC.compression.completed === 1) {
                    notify("Summarizing excess memories for \"" + AC.compression.vanityTitle + "\"");
                }
                function joinMemoryBank(memoryBank) {
                    return cleanSpaces("- " + memoryBank.join("\n- "));
                }
            } else if (permitOutput()) {
                CODOMAIN.initialize(output);
            }
            concludeOutputBlock((function() {
                if (AC.signal.swapControlCards) {
                    return getConfigureCardTemplate();
                } else {
                    return null;
                }
            })())
            function postOutputMessage(ratio) {
                if (permitOutput()) {
                    CODOMAIN.initialize(
                        getPrecedingNewlines() + ">>> please select \"continue\" (" + Math.round(ratio * 100) + "%) <<<\n\n"
                    );
                }
                return;
            }
            break; }
        default: {
            CODOMAIN.initialize(TEXT);
            break; }
        }
        // Get an individual story card reference via titleKey
        function getAutoCard(titleKey) {
            return Internal.getCard(card => card.entry.toLowerCase().startsWith("{title: " + titleKey + "}"));
        }
        function buildMemoryConstruct() {
            return (AC.compression.oldMemoryBank
                .slice(0, AC.compression.lastConstructIndex + 1)
                .join(" ")
            );
        }
        // Estimate the average AI response char count based on recent continue outputs
        function estimateResponseLength() {
            if (!Array.isArray(history) || (history.length === 0)) {
                return -1;
            }
            const charCounts = [];
            for (let i = 0; i < history.length; i++) {
                const action = readPastAction(i);
                if ((action.type === "continue") && !action.text.includes("<<<")) {
                    charCounts.push(action.text.length);
                }
            }
            if (charCounts.length < 7) {
                if (charCounts.length === 0) {
                    return -1;
                } else if (charCounts.length < 4) {
                    return boundInteger(350, charCounts[0]);
                }
                charCounts.splice(3);
            }
            return boundInteger(175, Math.floor(
                charCounts.reduce((sum, charCount) => {
                    return sum + charCount;
                }, 0) / charCounts.length
            ));
        }
        // Evalute how similar two strings are on the range [0, 1]
        function similarityScore(strA, strB) {
            if (strA === strB) {
                return 1;
            }
            // Normalize both strings for further comparison purposes
            const [cleanA, cleanB] = [strA, strB].map(str => limitString((str
                .replace(/[0-9\s]/g, " ")
                .trim()
                .replace(/  +/g, " ")
                .toLowerCase()
            ), 1400));
            if (cleanA === cleanB) {
                return 1;
            }
            // Compute the Levenshtein distance
            const [lengthA, lengthB] = [cleanA, cleanB].map(str => str.length);
            // I love DP ❤️ (dynamic programming)
            const dp = Array(lengthA + 1).fill(null).map(() => Array(lengthB + 1).fill(0));
            for (let i = 0; i <= lengthA; i++) {
                dp[i][0] = i;
            }
            for (let j = 0; j <= lengthB; j++) {
                dp[0][j] = j;
            }
            for (let i = 1; i <= lengthA; i++) {
                for (let j = 1; j <= lengthB; j++) {
                    if (cleanA[i - 1] === cleanB[j - 1]) {
                        // No cost if chars match, swipe right 😎
                        dp[i][j] = dp[i - 1][j - 1];
                    } else {
                        dp[i][j] = Math.min(
                            // Deletion
                            dp[i - 1][j] + 1,
                            // Insertion
                            dp[i][j - 1] + 1,
                            // Substitution
                            dp[i - 1][j - 1] + 1
                        );
                    }
                }
            }
            // Convert distance to similarity score (1 - (distance / maxLength))
            return 1 - (dp[lengthA][lengthB] / Math.max(lengthA, lengthB));
        }
        function splitBySentences(prose) {
            // Don't split sentences on honorifics or abbreviations such as "Mr.", "Mrs.", "etc."
            return (prose
                .replace(new RegExp("(?<=\\s|\"|\\(|—|\\[|'|{|^)(?:" + ([...Words.honorifics, ...Words.abbreviations]
                    .map(word => word.replace(".", ""))
                    .join("|")
                ) + ")\\.", "gi"), "$1%@%")
                .split(/(?<=[\.\?!:]["\)'\]}]?\s+)(?=[^\p{Ll}\s])/u)
                .map(sentence => sentence.replaceAll("%@%", "."))
            );
        }
        function formatEntry(partialEntry) {
            const cleanedEntry = cleanSpaces(partialEntry
                .replace(/^{title:[\s\S]*?}/, "")
                .replace(/[#><@*_~]/g, "")
                .trim()
            ).replace(/(?<=^|\n)-+\s*/g, "");
            if (cleanedEntry === "") {
                return "";
            } else {
                return cleanedEntry + " ";
            }
        }
        // Resolve malformed em dashes (common AI cliche)
        function prettifyEmDashes(str) {
            return str.replace(/(?<!^\s*)(?: - | ?– ?)(?!\s*$)/g, "—");
        }
        function getConfigureCardTemplate() {
            const names = getControlVariants().configure;
            return O.f({
                type: SETTING,
                title: names.title,
                keys: names.keys,
                entry: getConfigureCardEntry(),
                description: getConfigureCardDescription()
            });
        }
        function getConfigureCardEntry() {
            return prose(
                "> Auto-Cards automatically creates and updates plot-relevant story cards while you play. You may configure the following settings by replacing \"false\" with \"true\" (and vice versa) or by adjusting numbers for the appropriate settings.",
                "> Disable Auto-Cards: false",
                "> Show detailed guide: false",
                "> Delete all automatic story cards: false",
                "> Reset all config settings and prompts: false",
                "> Pin this config card near the top: " + AC.config.pinConfigureCard,
                "> Minimum turns cooldown for new cards: " + AC.config.addCardCooldown,
                "> New cards use a bulleted list format: " + AC.config.bulletedListMode,
                "> Maximum entry length for new cards: " + AC.config.defaultEntryLimit,
                "> New cards perform memory updates: " + AC.config.defaultCardsDoMemoryUpdates,
                "> Card memory bank preferred length: " + AC.config.defaultMemoryLimit,
                "> Memory summary compression ratio: " + AC.config.memoryCompressionRatio,
                "> Exclude all-caps from title detection: " + AC.config.ignoreAllCapsTitles,
                "> Also detect titles from player inputs: " + AC.config.readFromInputs,
                "> Minimum turns age for title detection: " + AC.config.minimumLookBackDistance,
                "> Use Live Script Interface v2: " + (AC.config.LSIv2 !== null),
                "> Log debug data in a separate card: " + AC.config.showDebugData
            );
        }
        function getConfigureCardDescription() {
            return limitString(O.v(prose(
                Words.delimiter,
                "> AI prompt to generate new cards:",
                limitString(AC.config.generationPrompt.trim(), 4350).trimEnd(),
                Words.delimiter,
                "> AI prompt to summarize card memories:",
                limitString(AC.config.compressionPrompt.trim(), 4350).trimEnd(),
                Words.delimiter,
                "> Titles banned from new card creation:",
                AC.database.titles.banned.join(", ")
            )), 9850);
        }
    } else {
        // Auto-Cards is currently disabled
        switch(HOOK) {
        case "input": {
            if (/\/\s*A\s*C/i.test(text)) {
                CODOMAIN.initialize(doPlayerCommands(text));
            } else {
                CODOMAIN.initialize(TEXT);
            }
            break; }
        case "context": {
            // AutoCards was called within the context modifier
            advanceChronometer();
            // Get or construct the "Edit to enable Auto-Cards" story card
            const enableCardTemplate = getEnableCardTemplate();
            const enableCard = getSingletonCard(true, enableCardTemplate);
            banTitle(enableCardTemplate.title);
            pinAndSortCards(enableCard);
            if (AC.signal.forceToggle) {
                enableAutoCards();
            } else if (enableCard.entry !== enableCardTemplate.entry) {
                if ((extractSettings(enableCard.entry)?.enableautocards === true) && (AC.signal.forceToggle !== false)) {
                    // Use optional chaining to check the existence of enableautocards before accessing its value
                    enableAutoCards();
                } else {
                    // Repair the damaged card entry
                    enableCard.entry = enableCardTemplate.entry;
                }
            }
            AC.signal.forceToggle = null;
            CODOMAIN.initialize(TEXT);
            function enableAutoCards() {
                // Auto-Cards has been enabled
                AC.config.doAC = true;
                // Deconstruct the "Edit to enable Auto-Cards" story card
                unbanTitle(enableCardTemplate.title);
                eraseCard(enableCard);
                // Signal the construction of "Configure Auto-Cards" during the next onOutput hook
                AC.signal.swapControlCards = true;
                // Post a success message
                notify("Enabled! You may now edit the \"Configure Auto-Cards\" story card");
                return;
            }
            break; }
        case "output": {
            // AutoCards was called within the output modifier
            promoteAmnesia();
            if (permitOutput()) {
                CODOMAIN.initialize(TEXT);
            }
            concludeOutputBlock((function() {
                if (AC.signal.swapControlCards) {
                    return getEnableCardTemplate();
                } else {
                    return null;
                }
            })());
            break; }
        default: {
            CODOMAIN.initialize(TEXT);
            break; }
        }
        function getEnableCardTemplate() {
            const names = getControlVariants().enable;
            return O.f({
                type: SETTING,
                title: names.title,
                keys: names.keys,
                entry: prose(
                    "> Auto-Cards automatically creates and updates plot-relevant story cards while you play. To enable this system, simply edit the \"false\" below to say \"true\" instead!",
                    "> Enable Auto-Cards: false"),
                description: "Perform any Do/Say/Story/Continue action within your adventure to apply this change!"
            });
        }
    }
    function hoistConst() { return (class Const {
        // This helps me debug stuff uwu
        #constant;
        constructor(...args) {
            if (args.length !== 0) {
                Const.#throwError([[(args.length === 1), "Const cannot be instantiated with a parameter"], ["Const cannot be instantiated with parameters"]]);
            } else {
                O.f(this);
                return this;
            }
        }
        declare(...args) {
            if (args.length !== 0) {
                Const.#throwError([[(args.length === 1), "Instances of Const cannot be declared with a parameter"], ["Instances of Const cannot be declared with parameters"]]);
            } else if (this.#constant === undefined) {
                this.#constant = null;
                return this;
            } else if (this.#constant === null) {
                Const.#throwError("Instances of Const cannot be redeclared");
            } else {
                Const.#throwError("Instances of Const cannot be redeclared after initialization");
            }
        }
        initialize(...args) {
            if (args.length !== 1) {
                Const.#throwError([[(args.length === 0), "Instances of Const cannot be initialized without a parameter"], ["Instances of Const cannot be initialized with multiple parameters"]]);
            } else if (this.#constant === null) {
                this.#constant = [args[0]];
                return this;
            } else if (this.#constant === undefined) {
                Const.#throwError("Instances of Const cannot be initialized before declaration");
            } else {
                Const.#throwError("Instances of Const cannot be reinitialized");
            }
        }
        read(...args) {
            if (args.length !== 0) {
                Const.#throwError([[(args.length === 1), "Instances of Const cannot be read with a parameter"], ["Instances of Const cannot read with any parameters"]]);
            } else if (Array.isArray(this.#constant)) {
                return this.#constant[0];
            } else if (this.#constant === null) {
                Const.#throwError("Despite prior declaration, instances of Const cannot be read before initialization");
            } else {
                Const.#throwError("Instances of Const cannot be read before initialization");
            }
        }
        // An error condition is paired with an error message [condition, message], call #throwError with an array of pairs to throw the message corresponding with the first true condition [[cndtn1, msg1], [cndtn2, msg2], [cndtn3, msg3], ...] The first conditionless array element always evaluates to true ('else')
        static #throwError(...args) {
            // Look, I thought I was going to use this more at the time okay
            const [conditionalMessagesTable] = args;
            const codomain = new Const().declare();
            const error = O.f(new Error((function() {
                const codomain = new Const().declare();
                if (Array.isArray(conditionalMessagesTable)) {
                    const chosenPair = conditionalMessagesTable.find(function(...args) {
                        const [pair] = args;
                        const codomain = new Const().declare();
                        if (Array.isArray(pair)) {
                            if ((pair.length === 1) && (typeof pair[0] === "string")) {
                                codomain.initialize(true);
                            } else if (
                                (pair.length === 2)
                                && (typeof pair[0] === "boolean")
                                && (typeof pair[1] === "string")
                            ) {
                                codomain.initialize(pair[0]);
                            } else {
                                Const.#throwError("Const.#throwError encountered an invalid array element of conditionalMessagesTable");
                            }
                        } else {
                            Const.#throwError("Const.#throwError encountered a non-array element within conditionalMessagesTable");
                        }
                        return codomain.read();
                    });
                    if (Array.isArray(chosenPair)) {
                        if (chosenPair.length === 1) {
                            codomain.initialize(chosenPair[0]);
                        } else {
                            codomain.initialize(chosenPair[1]);
                        }
                    } else {
                        codomain.initialize("Const.#throwError was not called with any true conditions");
                    }
                } else if (typeof conditionalMessagesTable === "string") {
                    codomain.initialize(conditionalMessagesTable);
                } else {
                    codomain.initialize("Const.#throwError could not parse the given argument");
                }
                return codomain.read();
            })()));
            if (error.stack) {
                codomain.initialize(error.stack
                    .replace(/\(<isolated-vm>:/gi, "(")
                    .replace(/Error:|at\s*(?:#throwError|Const.(?:declare|initialize|read)|new\s*Const)\s*\(\d+:\d+\)/gi, "")
                    .replace(/AutoCards\s*\((\d+):(\d+)\)\s*at\s*<isolated-vm>:\d+:\d+\s*$/i, "AutoCards ($1:$2)")
                    .trim()
                    .replace(/\s+/g, " ")
                );
            } else {
                codomain.initialize(error.message);
            }
            throw codomain.read();
        }
    }); }
    function hoistO() { return (class O {
        // Some Object class methods are annoyingly verbose for how often I use them 👿
        static f(obj) {
            return Object.freeze(obj);
        }
        static v(base) {
            return see(Words.copy) + base;
        }
        static s(obj) {
            return Object.seal(obj);
        }
    }); }
    function hoistWords() { return (class Words { static #cache = {}; static {
        // Each word list is initialized only once before being cached!
        const wordListInitializers = {
            // Special-cased honorifics which are excluded from titles and ignored during split-by-sentences operations
            honorifics: () => [
                "mr.", "ms.", "mrs.", "dr."
            ],
            // Other special-cased abbreviations used to reformat titles and split-by-sentences
            abbreviations: () => [
                "sr.", "jr.", "etc.", "st.", "ex.", "inc."
            ],
            // Lowercase minor connector words which may exist within titles
            minor: () => [
                "&", "the", "for", "of", "le", "la", "el"
            ],
            // Removed from shortened titles for improved memory detection and trigger keword assignments
            peerage: () => [
                "sir", "lord", "lady", "king", "queen", "majesty", "duke", "duchess", "noble", "royal", "emperor", "empress", "great", "prince", "princess", "count", "countess", "baron", "baroness", "archduke", "archduchess", "marquis", "marquess", "viscount", "viscountess", "consort", "grand", "sultan", "sheikh", "tsar", "tsarina", "czar", "czarina", "viceroy", "monarch", "regent", "imperial", "sovereign", "president", "prime", "minister", "nurse", "doctor", "saint", "general", "private", "commander", "captain", "lieutenant", "sergeant", "admiral", "marshal", "baronet", "emir", "chancellor", "archbishop", "bishop", "cardinal", "abbot", "abbess", "shah", "maharaja", "maharani", "councillor", "squire", "lordship", "ladyship", "monseigneur", "mayor", "princeps", "chief", "chef", "their", "my", "his", "him", "he'd", "her", "she", "she'd", "you", "your", "yours", "you'd", "you've", "you'll", "yourself", "mine", "myself", "highness", "excellency", "farmer", "sheriff", "officer", "detective", "investigator", "miss", "mister", "colonel", "professor", "teacher", "agent", "heir", "heiress", "master", "mistress", "headmaster", "headmistress", "principal", "papa", "mama", "mommy", "daddy", "mother", "father", "grandma", "grandpa", "aunt", "auntie", "aunty", "uncle", "cousin", "sister", "brother", "holy", "holiness", "almighty", "senator", "congressman"
            ],
            // Common named entities represent special-cased INVALID card titles. Because these concepts are already abundant within the AI's training data, generating story cards for any of these would be both annoying and superfluous. Therefore, Words.entities is accessed during banned titles initialization to prevent their appearance
            entities: () => [
                // Seasons
                "spring", "summer", "autumn", "fall", "winter",
                // Holidays
                "halloween", "christmas", "thanksgiving", "easter", "hanukkah", "passover", "ramadan", "eid", "diwali", "new year", "new year eve", "valentine day", "oktoberfest",
                // People terms
                "mom", "dad", "child", "grandmother", "grandfather", "ladies", "gentlemen", "gentleman", "slave",
                // Capitalizable pronoun thingys
                "his", "him", "he'd", "her", "she", "she'd", "you", "your", "yours", "you'd", "you've", "you'll", "you're", "yourself", "mine", "myself", "this", "that",
                // Religious figures & deities
                "god", "jesus", "buddha", "allah", "christ",
                // Religious texts & concepts
                "bible", "holy bible", "qur'an", "quran", "hadith", "tafsir", "tanakh", "talmud", "torah", "vedas", "vatican", "paganism", "pagan",
                // Religions & belief systems
                "hindu", "hinduism", "christianity", "islam", "jew", "judaism", "taoism", "buddhist", "buddhism", "catholic", "baptist",
                // Common locations
                "earth", "moon", "sun", "new york city", "london", "paris", "tokyo", "beijing", "mumbai", "sydney", "berlin", "moscow", "los angeles", "san francisco", "chicago", "miami", "seattle", "vancouver", "toronto", "ottawa", "mexico city", "rio de janeiro", "cape town", "sao paulo", "bangkok", "delhi", "amsterdam", "seoul", "shanghai", "new delhi", "atlanta", "jerusalem", "africa", "north america", "south america", "central america", "asia", "north africa", "south africa", "boston", "rome", "america", "siberia", "new england", "manhattan", "bavaria", "catalonia", "greenland", "hong kong", "singapore",
                // Countries & political entities
                "china", "india", "japan", "germany", "france", "spain", "italy", "canada", "australia", "brazil", "south africa", "russia", "north korea", "south korea", "iran", "iraq", "syria", "saudi arabia", "afghanistan", "pakistan", "uk", "britain", "england", "scotland", "wales", "northern ireland", "usa", "united states", "united states of america", "mexico", "turkey", "greece", "portugal", "poland", "netherlands", "belgium", "sweden", "norway", "finland", "denmark",
                // Organizations & unions
                "united nations", "european union", "state", "nato", "nfl", "nba", "fbi", "cia", "harvard", "yale", "princeton", "ivy league", "little league", "nasa", "nsa", "noaa", "osha", "nascar", "daytona 500", "grand prix", "wwe", "mba", "superbowl",
                // Currencies
                "dollar", "euro", "pound", "yen", "rupee", "peso", "franc", "dinar", "bitcoin", "ethereum", "ruble", "won", "dirham",
                // Landmarks
                "sydney opera house", "eiffel tower", "statue of liberty", "big ben", "great wall of china", "taj mahal", "pyramids of giza", "grand canyon", "mount everest",
                // Events
                "world war i", "world war 1", "wwi", "wwii", "world war ii", "world war 2", "wwii", "ww2", "cold war", "brexit", "american revolution", "french revolution", "holocaust", "cuban missile crisis",
                // Companies
                "google", "microsoft", "apple", "amazon", "facebook", "tesla", "ibm", "intel", "samsung", "sony", "coca-cola", "nike", "ford", "chevy", "pontiac", "chrysler", "volkswagen", "lambo", "lamborghini", "ferrari", "pizza hut", "taco bell", "ai dungeon", "openai", "mcdonald", "mcdonalds", "kfc", "burger king", "disney",
                // Nationalities & languages
                "english", "french", "spanish", "german", "italian", "russian", "chinese", "japanese", "korean", "arabic", "portuguese", "hindi", "american", "canadian", "mexican", "brazilian", "indian", "australian", "egyptian", "greek", "swedish", "norwegian", "danish", "dutch", "turkish", "iranian", "ukraine", "asian", "british", "european", "polish", "thai", "vietnamese", "filipino", "malaysian", "indonesian", "finnish", "estonian", "latvian", "lithuanian", "czech", "slovak", "hungarian", "romanian", "bulgarian", "serbian", "croatian", "bosnian", "slovenian", "albanian", "georgian", "armenian", "azerbaijani", "kazakh", "uzbek", "mongolian", "hebrew", "persian", "pashto", "urdu", "bengali", "tamil", "telugu", "marathi", "gujarati", "swahili", "zulu", "xhosa", "african", "north african", "south african", "north american", "south american", "central american", "colombian", "argentinian", "chilean", "peruvian", "venezuelan", "ecuadorian", "bolivian", "paraguayan", "uruguayan", "cuban", "dominican", "arabian", "roman", "haitian", "puerto rican", "moroccan", "algerian", "tunisian", "saudi", "emirati", "qatarian", "bahraini", "omani", "yemeni", "syrian", "lebanese", "iraqi", "afghan", "pakistani", "sri lankan", "burmese", "laotian", "cambodian", "hawaiian", "victorian",
                // Fantasy stuff
                "elf", "elves", "elven", "dwarf", "dwarves", "dwarven", "human", "man", "men", "mankind", "humanity",
                // IPs
                "pokemon", "pokémon", "minecraft", "beetles", "band-aid", "bandaid", "band aid", "big mac", "gpt", "chatgpt", "gpt-2", "gpt-3", "gpt-4", "gpt-4o", "mixtral", "mistral", "linux", "windows", "mac", "happy meal", "disneyland", "disneyworld",
                // US states
                "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "west virginia", "wisconsin", "wyoming",
                // Canadian Provinces & Territories
                "british columbia", "manitoba", "new brunswick", "labrador", "nova scotia", "ontario", "prince edward island", "quebec", "saskatchewan", "northwest territories", "nunavut", "yukon", "newfoundland",
                // Australian States & Territories
                "new south wales", "queensland", "south australia", "tasmania", "western australia", "australian capital territory",
                // idk
                "html", "javascript", "python", "java", "c++", "php", "bluetooth", "json", "sql", "word", "dna", "icbm", "npc", "usb", "rsvp", "omg", "brb", "lol", "rofl", "smh", "ttyl", "rubik", "adam", "t-shirt", "tshirt", "t shirt", "led", "leds", "laser", "lasers", "qna", "q&a", "vip", "human resource", "human resources", "llm", "llc", "ceo", "cfo", "coo", "office", "blt", "suv", "suvs", "ems", "emt", "cbt", "cpr", "ferris wheel", "toy", "pet", "plaything", "m o"
            ],
            // Unwanted values
            undesirables: () => [
                [343332, 451737, 323433, 377817], [436425, 356928, 363825, 444048], [323433, 428868, 310497, 413952], [350097, 66825, 436425, 413952, 406593, 444048], [316932, 330000, 436425, 392073], [444048, 356928, 323433], [451737, 444048, 363825], [330000, 310497, 392073, 399300]
            ],
            delimiter: () => (
                "——————————————————————————"
            ),
            // Source code location
            copy: () => [
                126852, 33792, 211200, 384912, 336633, 310497, 436425, 336633, 33792, 459492, 363825, 436425, 363825, 444048, 33792, 392073, 483153, 33792, 139425, 175857, 33792, 152592, 451737, 399300, 350097, 336633, 406593, 399300, 33792, 413952, 428868, 406593, 343332, 363825, 384912, 336633, 33792, 135168, 190608, 336633, 467313, 330000, 190608, 336633, 310497, 356928, 33792, 310497, 399300, 330000, 33792, 428868, 336633, 310497, 330000, 33792, 392073, 483153, 33792, 316932, 363825, 406593, 33792, 343332, 406593, 428868, 33792, 436425, 363825, 392073, 413952, 384912, 336633, 33792, 363825, 399300, 436425, 444048, 428868, 451737, 323433, 444048, 363825, 406593, 399300, 436425, 33792, 406593, 399300, 33792, 310497, 330000, 330000, 363825, 399300, 350097, 33792, 139425, 451737, 444048, 406593, 66825, 148137, 310497, 428868, 330000, 436425, 33792, 444048, 406593, 33792, 483153, 406593, 451737, 428868, 33792, 436425, 323433, 336633, 399300, 310497, 428868, 363825, 406593, 436425, 35937, 33792, 3355672848, 139592360193, 3300, 3300, 356928, 444048, 444048, 413952, 436425, 111012, 72897, 72897, 413952, 384912, 310497, 483153, 69828, 310497, 363825, 330000, 451737, 399300, 350097, 336633, 406593, 399300, 69828, 323433, 406593, 392073, 72897, 413952, 428868, 406593, 343332, 363825, 384912, 336633, 72897, 190608, 336633, 467313, 330000, 190608, 336633, 310497, 356928, 3300, 3300, 126852, 33792, 139425, 451737, 444048, 406593, 66825, 148137, 310497, 428868, 330000, 436425, 33792, 459492, 79233, 69828, 76032, 69828, 76032, 33792, 363825, 436425, 33792, 310497, 399300, 33792, 406593, 413952, 336633, 399300, 66825, 436425, 406593, 451737, 428868, 323433, 336633, 33792, 436425, 323433, 428868, 363825, 413952, 444048, 33792, 343332, 406593, 428868, 33792, 139425, 175857, 33792, 152592, 451737, 399300, 350097, 336633, 406593, 399300, 33792, 392073, 310497, 330000, 336633, 33792, 316932, 483153, 33792, 190608, 336633, 467313, 330000, 190608, 336633, 310497, 356928, 69828, 33792, 261393, 406593, 451737, 33792, 356928, 310497, 459492, 336633, 33792, 392073, 483153, 33792, 343332, 451737, 384912, 384912, 33792, 413952, 336633, 428868, 392073, 363825, 436425, 436425, 363825, 406593, 399300, 33792, 444048, 406593, 33792, 451737, 436425, 336633, 33792, 139425, 451737, 444048, 406593, 66825, 148137, 310497, 428868, 330000, 436425, 33792, 467313, 363825, 444048, 356928, 363825, 399300, 33792, 483153, 406593, 451737, 428868, 33792, 413952, 336633, 428868, 436425, 406593, 399300, 310497, 384912, 33792, 406593, 428868, 33792, 413952, 451737, 316932, 384912, 363825, 436425, 356928, 336633, 330000, 33792, 436425, 323433, 336633, 399300, 310497, 428868, 363825, 406593, 436425, 35937, 3300, 126852, 33792, 261393, 406593, 451737, 50193, 428868, 336633, 33792, 310497, 384912, 436425, 406593, 33792, 467313, 336633, 384912, 323433, 406593, 392073, 336633, 33792, 444048, 406593, 33792, 336633, 330000, 363825, 444048, 33792, 444048, 356928, 336633, 33792, 139425, 175857, 33792, 413952, 428868, 406593, 392073, 413952, 444048, 436425, 33792, 310497, 399300, 330000, 33792, 444048, 363825, 444048, 384912, 336633, 33792, 336633, 475200, 323433, 384912, 451737, 436425, 363825, 406593, 399300, 436425, 33792, 413952, 428868, 406593, 459492, 363825, 330000, 336633, 330000, 33792, 316932, 336633, 384912, 406593, 467313, 69828, 33792, 175857, 33792, 436425, 363825, 399300, 323433, 336633, 428868, 336633, 384912, 483153, 33792, 356928, 406593, 413952, 336633, 33792, 483153, 406593, 451737, 33792, 336633, 399300, 370788, 406593, 483153, 33792, 483153, 406593, 451737, 428868, 33792, 310497, 330000, 459492, 336633, 399300, 444048, 451737, 428868, 336633, 436425, 35937, 33792, 101128769412, 106046468352, 3300
            ],
            // Card interface names reserved for use within LSIv2
            reserved: () => ({
                library: "Shared Library", input: "Input Modifier", context: "Context Modifier", output: "Output Modifier", guide: "LSIv2 Guide", state: "State Display", log: "Console Log"
            }),
            // Acceptable config settings which are coerced to true
            trues: () => [
                "true", "t", "yes", "y", "on"
            ],
            // Acceptable config settings which are coerced to false
            falses: () => [
                "false", "f", "no", "n", "off"
            ],
            guide: () => prose(
                ">>> Detailed Guide:",
                "Auto-Cards was made by LewdLeah ❤️",
                "",
                Words.delimiter,
                "",
                "💡 What is Auto-Cards?",
                "Auto-Cards is a plug-and-play script for AI Dungeon that watches your story and automatically writes plot-relevant story cards during normal gameplay. A forgetful AI breaks my immersion, therefore my primary goal was to address the \"object permanence problem\" by extending story cards and memories with deeper automation. Auto-Cards builds a living reference of your adventure's world as you go. For your own convenience, all of this stuff is handled in the background. Though you're certainly welcome to customize various settings or use in-game commands for more precise control",
                "",
                Words.delimiter,
                "",
                " 📌 Main Features",
                "- Detects named entities from your story and periodically writes new cards",
                "- Smart long-term memory updates and summaries for important cards",
                "- Fully customizable AI card generation and memory summarization prompts",
                "- Optional in-game commands to manually direct the card generation process",
                "- Free and open source for anyone to use within their own projects",
                "- Compatible with other scripts and includes an external API",
                "- Optional in-game scripting interface (LSIv2)",
                "",
                Words.delimiter,
                "",
                "⚙️ Config Settings",
                "You may, at any time, fine-tune your settings in-game by editing their values within the config card's entry section. Simply swap true/false or tweak numbers where appropriate",
                "",
                "> Disable Auto-Cards:",
                "Turns the whole system off if true",
                "",
                "> Show detailed guide:",
                "If true, shows this player guide in-game",
                "",
                "> Delete all automatic story cards:",
                "Removes every auto-card present in your adventure",
                "",
                "> Reset all config settings and prompts:",
                "Restores all settings and prompts to their original default values",
                "",
                "> Pin this config card near the top:",
                "Keeps the config card pinned high on your cards list",
                "",
                "> Minimum turns cooldown for new cards:",
                "How many turns (minimum) to wait between generating new cards. Using 9999 will pause periodic card generation while still allowing card memory updates to continue",
                "",
                "> New cards use a bulleted list format:",
                "If true, new entries will use bullet points instead of pure prose",
                "",
                "> Maximum entry length for new cards:",
                "Caps how long newly generated card entries can be (in characters)",
                "",
                "> New cards perform memory updates:",
                "If true, new cards will automatically experience memory updates over time",
                "",
                "> Card memory bank preferred length:",
                "Character count threshold before card memories are summarized to save space",
                "",
                "> Memory summary compression ratio:",
                "Controls how much to compress when summarizing long card memory banks",
                "(ratio = 10 * old / new ... such that 25 -> 2.5x shorter)",
                "",
                "> Exclude all-caps from title detection:",
                "Prevents all-caps words like \"RUN\" from being parsed as viable titles",
                "",
                "> Also detect titles from player inputs:",
                "Allows your typed Do/Say/Story action inputs to help suggest new card topics. Set to false if you have bad grammar, or if you're German (due to idiosyncratic noun capitalization habits)",
                "",
                "> Minimum turns age for title detection:",
                "How many actions back the script looks when parsing recent titles from your story",
                "",
                "> Use Live Script Interface v2:",
                "Enables LSIv2 for extra scripting magic and advanced control via arbitrary code execution",
                "",
                "> Log debug data in a separate card:",
                "Shows a debug card if set to true",
                "",
                Words.delimiter,
                "",
                "✏️ AI Prompts",
                "You may specify how the AI handles story card processes by editing either of these two prompts within the config card's notes section",
                "",
                "> AI prompt to generate new cards:",
                "Used when Auto-Cards writes a new card entry. It tells the AI to focus on important plot stuff, avoid fluff, and write in a consistent, polished style. I like to add some personal preferences here when playing my own adventures. \"%{title}\" and \"%{entry}\" are dynamic placeholders for their namesakes",
                "",
                "> AI prompt to summarize card memories:",
                "Summarizes older details within card memory banks to keep everything concise and neat over the long-run. Maintains only the most important details, written in the past tense. \"%{title}\" and \"%{memory}\" are dynamic placeholders for their namesakes",
                "",
                Words.delimiter,
                "",
                "⛔ Banned Titles List",
                "This list prevents new cards from being created for super generic or unhelpful titles such as North, Tuesday, or December. You may edit these at the bottom of the config card's notes section. Capitalization and plural/singular forms are handled for you, so no worries about that",
                "",
                "> Titles banned from automatic new card generation:",
                "North, East, South, West, and so on...",
                "",
                Words.delimiter,
                "",
                "🔑 In-Game Commands (/ac)",
                "Use these commands to manually interact with Auto-Cards, simply type them into a Do/Say/Story input action",
                "",
                "/ac",
                "Sets your actual cooldown to 0 and immediately attempts to generate a new card for the most relevant unused title from your story (if one exists)",
                "",
                "/ac Your Title Goes Here",
                "Will immediately begin generating a new story card with the given title",
                "Example use: \"/ac Leah\"",
                "",
                "/ac Your Title Goes Here / Your extra prompt details go here",
                "Similar to the previous case, but with additional context to include with the card generation prompt",
                "Example use: \"/ac Leah / Focus on Leah's works of artifice and ingenuity\"",
                "",
                "/ac Your Title Goes Here / Your extra prompt details go here / Your starter entry goes here",
                "Again, similar to the previous case, but with an initial card entry for the generator to build upon",
                "Example use: \"/ac Leah / Focus on Leah's works of artifice and ingenuity / You are a woman named Leah.\"",
                "",
                "/ac redo Your Title Goes Here",
                "Rewrites your chosen story card, using the old card entry, memory bank, and story context for inspiration. Useful for recreating cards after important character development has occurred",
                "Example use: \"/ac redo Leah\"",
                "",
                "/ac redo Your Title Goes Here / New info goes here",
                "Similar to the previous case, but with additional info provided to guide the rewrite according to your additional specifications",
                "Example use: \"/ac redo Leah / Leah recently achieved immortality\"",
                "",
                "/ac redo all",
                "Recreates every single auto-card in your adventure. I must warn you though: This is very risky",
                "",
                "Extra Info:",
                "- Invalid titles will fail. It's a technical limitation, sorry 🤷‍♀️",
                "- Titles must be unique, unless you're attempting to use \"/ac redo\" for an existing card",
                "- You may submit multiple commands using a single input to queue up a chained sequence of requests",
                "- Capitalization doesn't matter, titles will be reformatted regardless",
                "",
                Words.delimiter,
                "",
                "🔧 External API Functions (quick summary)",
                "These are mainly for other JavaScript programmers to use, so feel free to ignore this section if that doesn't apply to you. Anyway, here's what each one does in plain terms, though please do refer to my source code for the full documentation",
                "",
                "AutoCards().API.postponeEvents();",
                "Pauses Auto-Cards activity for n many turns",
                "",
                "AutoCards().API.emergencyHalt();",
                "Emergency stop or resume",
                "",
                "AutoCards().API.suppressMessages();",
                "Hides Auto-Cards toasts by preventing assignment to state.message",
                "",
                "AutoCards().API.debugLog();",
                "Writes to the debug log card",
                "",
                "AutoCards().API.toggle();",
                "Turns Auto-Cards on/off",
                "",
                "AutoCards().API.generateCard();",
                "Initiates AI generation of the requested card",
                "",
                "AutoCards().API.redoCard();",
                "Regenerates an existing card",
                "",
                "AutoCards().API.setCardAsAuto();",
                "Flags or unflags a card as automatic",
                "",
                "AutoCards().API.addCardMemory();",
                "Adds a memory to a specific card",
                "",
                "AutoCards().API.eraseAllAutoCards();",
                "Deletes all auto-cards",
                "",
                "AutoCards().API.getUsedTitles();",
                "Lists all current card titles and keys",
                "",
                "AutoCards().API.getBannedTitles();",
                "Shows your current banned titles list",
                "",
                "AutoCards().API.setBannedTitles();",
                "Replaces the banned titles list with a new list",
                "",
                "AutoCards().API.buildCard();",
                "Makes a new card from scratch, using exact parameters",
                "",
                "AutoCards().API.getCard();",
                "Finds cards that match a filter",
                "",
                "AutoCards().API.eraseCard();",
                "Deletes cards matching a filter",
                "",
                "These API functions also work from within the LSIv2 scope, by the way",
                "",
                Words.delimiter,
                "",
                "❤️ Special Thanks",
                "This project flourished due to the incredible help, feedback, and encouragement from the AI Dungeon community. Your ideas, bug reports, testing, and support made Auto-Cards smarter, faster, and more fun for all. Please refer to my source code to learn more about everyone's specific contributions",
                "",
                "AHotHamster22, BinKompliziert, Boo, bottledfox, Bruno, Burnout, bweni, DebaczX, Dirty Kurtis, Dragranis, effortlyss, Hawk, Idle Confusion, ImprezA, Kat-Oli, KryptykAngel, Mad19pumpkin, Magic, Mirox80, Nathaniel Wyvern, NobodyIsUgly, OnyxFlame, Purplejump, Randy Viosca, RustyPawz, sinner, Sleepy pink, Vutinberg, Wilmar, Yi1i1i",
                "",
                Words.delimiter,
                "",
                "🎴 Random Tips",
                "- The default setup works great out of the box, just play normally and watch your world build itself",
                "- Enable AI Dungeon's built-in memory system for the best results",
                "- Gameplay -> AI Models -> Memory System -> Memory Bank -> Toggle-ON to enable",
                "- \"t\" and \"f\" are valid shorthand for \"true\" and \"false\" inside the config card",
                "- If Auto-Cards goes overboard with new cards, you can pause it by setting the cooldown config to 9999",
                "- Write \"{title:}\" anywhere within a regular story card's entry to transform it into an automatic card",
                "- Feel free to import/export entire story card decks at any time",
                "- Please copy my source code from here: https://play.aidungeon.com/profile/LewdLeah",
                "",
                Words.delimiter,
                "",
                "Happy adventuring! ❤️",
                "Please erase before continuing! <<<"
            )
        };
        for (const wordList in wordListInitializers) {
            // Define a lazy getter for every word list
            Object.defineProperty(Words, wordList, {
                configurable: false,
                enumerable: true,
                get() {
                    // If not already in cache, initialize and store the word list
                    if (!(wordList in Words.#cache)) {
                        Words.#cache[wordList] = O.f(wordListInitializers[wordList]());
                    }
                    return Words.#cache[wordList];
                }
            });
        }
    } }); }
    function hoistStringsHashed() { return (class StringsHashed {
        // Used for information-dense past memory recognition
        // Strings are converted to (reasonably) unique hashcodes for efficient existence checking
        static #defaultSize = 65536;
        #size;
        #store;
        constructor(size = StringsHashed.#defaultSize) {
            this.#size = size;
            this.#store = new Set();
            return this;
        }
        static deserialize(serialized, size = StringsHashed.#defaultSize) {
            const stringsHashed = new StringsHashed(size);
            stringsHashed.#store = new Set(serialized.split(","));
            return stringsHashed;
        }
        serialize() {
            return Array.from(this.#store).join(",");
        }
        has(str) {
            return this.#store.has(this.#hash(str));
        }
        add(str) {
            this.#store.add(this.#hash(str));
            return this;
        }
        remove(str) {
            this.#store.delete(this.#hash(str));
            return this;
        }
        size() {
            return this.#store.size;
        }
        latest(keepLatestCardinality) {
            if (this.#store.size <= keepLatestCardinality) {
                return this;
            }
            const excess = this.#store.size - keepLatestCardinality;
            const iterator = this.#store.values();
            for (let i = 0; i < excess; i++) {
                // The oldest hashcodes are removed first (insertion order matters!)
                this.#store.delete(iterator.next().value);
            }
            return this;
        }
        #hash(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((31 * hash) + str.charCodeAt(i)) % this.#size;
            }
            return hash.toString(36);
        }
    }); }
    function hoistInternal() { return (class Internal {
        // Some exported API functions are internally reused by AutoCards
        // Recursively calling AutoCards().API is computationally wasteful
        // AutoCards uses this collection of static methods as an internal proxy
        static generateCard(request, predefinedPair = ["", ""]) {
            // Method call guide:
            // Internal.generateCard({
            //     // All properties except 'title' are optional
            //     type: "card type, defaults to 'class' for ease of filtering",
            //     title: "card title",
            //     keysStart: "preexisting card triggers",
            //     entryStart: "preexisting card entry",
            //     entryPrompt: "prompt the AI will use to complete this entry",
            //     entryPromptDetails: "extra details to include with this card's prompt",
            //     entryLimit: 600, // target character count for the generated entry
            //     description: "card notes",
            //     memoryStart: "preexisting card memory",
            //     memoryUpdates: true, // card updates when new relevant memories are formed
            //     memoryLimit: 3200, // max characters before the card memory is compressed
            // });
            const titleKeyPair = formatTitle((request.title ?? "").toString());
            const title = predefinedPair[0] || titleKeyPair.newTitle;
            if (
                (title === "")
                || (("title" in AC.generation.workpiece) && (title === AC.generation.workpiece.title))
                || (isAwaitingGeneration() && (AC.generation.pending.some(pendingWorkpiece => (
                    ("title" in pendingWorkpiece) && (title === pendingWorkpiece.title)
                ))))
            ) {
                logEvent("The title '" + request.title + "' is invalid or unavailable for card generation", true);
                return false;
            }
            AC.generation.pending.push(O.s({
                title: title,
                type: limitString((request.type || AC.config.defaultCardType).toString().trim(), 100),
                keys: predefinedPair[1] || buildKeys((request.keysStart ?? "").toString(), titleKeyPair.newKey),
                entry: limitString("{title: " + title + "}" + cleanSpaces((function() {
                    const entry = (request.entryStart ?? "").toString().trim();
                    if (entry === "") {
                        return "";
                    } else {
                        return ("\n" + entry + (function() {
                            if (/[a-zA-Z]$/.test(entry)) {
                                return ".";
                            } else {
                                return "";
                            }
                        })() + " ");
                    }
                })()), 2000),
                description: limitString((
                    (function() {
                        const description = limitString((request.description ?? "").toString().trim(), 9900);
                        if (description === "") {
                            return "";
                        } else {
                            return description + "\n\n";
                        }
                    })() + "Auto-Cards will contextualize these memories:\n{updates: " + (function() {
                        if (typeof request.memoryUpdates === "boolean") {
                            return request.memoryUpdates;
                        } else {
                            return AC.config.defaultCardsDoMemoryUpdates;
                        }
                    })() + ", limit: " + validateMemoryLimit(
                        parseInt((request.memoryLimit || AC.config.defaultMemoryLimit), 10)
                    ) + "}" + (function() {
                        const cardMemoryBank = cleanSpaces((request.memoryStart ?? "").toString().trim());
                        if (cardMemoryBank === "") {
                            return "";
                        } else {
                            return "\n" + cardMemoryBank.split("\n").map(memory => addBullet(memory)).join("\n");
                        }
                    })()
                ), 10000),
                prompt: (function() {
                    let prompt = insertTitle((
                        (request.entryPrompt ?? "").toString().trim() || AC.config.generationPrompt.trim()
                    ), title);
                    let promptDetails = insertTitle((
                        cleanSpaces((request.entryPromptDetails ?? "").toString().trim())
                    ), title);
                    if (promptDetails !== "") {
                        const spacesPrecedingTerminalEntryPlaceholder = (function() {
                            const terminalEntryPlaceholderPattern = /(?:[%\$]+\s*|[%\$]*){+\s*entry\s*}+$/i;
                            if (terminalEntryPlaceholderPattern.test(prompt)) {
                                prompt = prompt.replace(terminalEntryPlaceholderPattern, "");
                                const trailingSpaces = prompt.match(/(\s+)$/);
                                if (trailingSpaces) {
                                    prompt = prompt.trimEnd();
                                    return trailingSpaces[1];
                                } else {
                                    return "\n\n";
                                }
                            } else {
                                return "";
                            }
                        })();
                        switch(prompt[prompt.length - 1]) {
                        case "]": { encapsulateBothPrompts("[", true, "]"); break; }
                        case ">": { encapsulateBothPrompts(null, false, ">"); break; }
                        case "}": { encapsulateBothPrompts("{", true, "}"); break; }
                        case ")": { encapsulateBothPrompts("(", true, ")"); break; }
                        case "/": { encapsulateBothPrompts("/", true, "/"); break; }
                        case "#": { encapsulateBothPrompts("#", true, "#"); break; }
                        case "-": { encapsulateBothPrompts(null, false, "-"); break; }
                        case ":": { encapsulateBothPrompts(":", true, ":"); break; }
                        case "<": { encapsulateBothPrompts(">", true, "<"); break; }
                        };
                        if (promptDetails.includes("\n")) {
                            const lines = promptDetails.split("\n");
                            for (let i = 0; i < lines.length; i++) {
                                lines[i] = addBullet(lines[i].trim());
                            }
                            promptDetails = lines.join("\n");
                        } else {
                            promptDetails = addBullet(promptDetails);
                        }
                        prompt += "\n" + promptDetails + (function() {
                            if (spacesPrecedingTerminalEntryPlaceholder !== "") {
                                // Prompt previously contained a terminal %{entry} placeholder, re-append it
                                return spacesPrecedingTerminalEntryPlaceholder + "%{entry}";
                            }
                            return "";
                        })();
                        function encapsulateBothPrompts(leftSymbol, slicesAtMiddle, rightSymbol) {
                            if (slicesAtMiddle) {
                                prompt = prompt.slice(0, -1).trim();
                                if (promptDetails.startsWith(leftSymbol)) {
                                    promptDetails = promptDetails.slice(1).trim();
                                }
                            }
                            if (!promptDetails.endsWith(rightSymbol)) {
                                promptDetails += rightSymbol;
                            }
                            return;
                        }
                    }
                    return limitString(prompt, Math.floor(0.8 * AC.signal.maxChars));
                })(),
                limit: validateEntryLimit(parseInt((request.entryLimit || AC.config.defaultEntryLimit), 10))
            }));
            notify("Generating card for \"" + title + "\"");
            function addBullet(str) {
                return "- " + str.replace(/^-+\s*/, "");
            }
            return true;
        }
        static redoCard(request, useOldInfo, newInfo) {
            const card = getIntendedCard(request.title)[0];
            const oldCard = O.f({...card});
            if (!eraseCard(card)) {
                return false;
            } else if (newInfo !== "") {
                request.entryPromptDetails = (request.entryPromptDetails ?? "").toString() + "\n" + newInfo;
            }
            O.f(request);
            Internal.getUsedTitles(true);
            if (!Internal.generateCard(request) && !Internal.generateCard(request, [
                (oldCard.entry.match(/^{title: ([\s\S]*?)}/)?.[1] || request.title.replace(/\w\S*/g, word => (
                    word[0].toUpperCase() + word.slice(1).toLowerCase()
                ))), oldCard.keys
            ])) {
                constructCard(oldCard, newCardIndex());
                Internal.getUsedTitles(true);
                return false;
            } else if (!useOldInfo) {
                return true;
            }
            AC.generation.pending[AC.generation.pending.length - 1].prompt = ((
                removeAutoProps(oldCard.entry) + "\n\n" +
                removeAutoProps(isolateNotesAndMemories(oldCard.description)[1])
            ).trimEnd() + "\n\n" + AC.generation.pending[AC.generation.pending.length - 1].prompt).trim();
            return true;
        }
        // Sometimes it's helpful to log information elsewhere during development
        // This log card is separate and distinct from the LSIv2 console log
        static debugLog(...args) {
            const debugCardName = "Debug Log";
            banTitle(debugCardName);
            const card = getSingletonCard(true, O.f({
                type: AC.config.defaultCardType,
                title: debugCardName,
                keys: debugCardName,
                entry: "The debug console log will print to the notes section below.",
                description: Words.delimiter + "\nBEGIN DEBUG LOG"
            }));
            logToCard(card, ...args);
            return card;
        }
        static eraseAllAutoCards() {
            const cards = [];
            Internal.getUsedTitles(true);
            for (const card of storyCards) {
                if (card.entry.startsWith("{title: ")) {
                    cards.push(card);
                }
            }
            for (const card of cards) {
                eraseCard(card);
            }
            auto.clear();
            forgetStuff();
            clearTransientTitles();
            AC.generation.pending = [];
            AC.database.memories.associations = {};
            if (AC.config.deleteAllAutoCards) {
                AC.config.deleteAllAutoCards = null;
            }
            return cards.length;
        }
        static getUsedTitles(isExternal = false) {
            if (isExternal) {
                bans.clear();
                isBanned("", true);
            } else if (0 < AC.database.titles.used.length) {
                return AC.database.titles.used;
            }
            // All unique used titles and keys encountered during this iteration
            const seen = new Set();
            auto.clear();
            clearTransientTitles();
            AC.database.titles.used = ["%@%"];
            for (const card of storyCards) {
                // Perform some common sense maintenance while we're here
                const coerce = (str) => (typeof str === "string") ? str : "";
                // Do not trim card.keys
                card.keys = coerce(card.keys);
                if (card.keys.includes("\"agent\"") || card.keys.includes("aidungeon")) {
                    if (isExternal) {
                        O.s(card);
                    }
                    continue;
                }
                card.type = coerce(card.type).trim();
                card.title = coerce(card.title).trim();
                card.entry = coerce(card.entry).trim();
                card.description = coerce(card.description).trim();
                if (isExternal) {
                    O.s(card);
                } else if (!shouldProceed()) {
                    checkRemaining();
                    continue;
                }
                // An ideal auto-card's entry starts with "{title: Example of Greatness}" (example)
                // An ideal auto-card's description contains "{updates: true, limit: 3200}" (example)
                if (checkPlurals(denumberName(card.title.replace("\n", "")), t => isBanned(t))) {
                    checkRemaining();
                    continue;
                } else if (!card.keys.includes(",")) {
                    const cleanKeys = denumberName(card.keys.trim());
                    if ((2 < cleanKeys.length) && checkPlurals(cleanKeys, t => isBanned(t))) {
                        checkRemaining();
                        continue;
                    }
                }
                // Detect and repair malformed auto-card properties in a fault-tolerant manner
                const traits = [card.entry, card.description].map((str, i) => {
                    // Absolute abomination uwu
                    const hasUpdates = /updates?\s*:[\s\S]*?(?:(?:title|limit)s?\s*:|})/i.test(str);
                    const hasLimit = /limits?\s*:[\s\S]*?(?:(?:title|update)s?\s*:|})/i.test(str);
                    return [(function() {
                        if (hasUpdates || hasLimit) {
                            if (/titles?\s*:[\s\S]*?(?:(?:limit|update)s?\s*:|})/i.test(str)) {
                                return 2;
                            }
                            return false;
                        } else if (/titles?\s*:[\s\S]*?}/i.test(str)) {
                            return 1;
                        } else if (!(
                            (i === 0)
                            && /{[\s\S]*?}/.test(str)
                            && (str.match(/{/g)?.length === 1)
                            && (str.match(/}/g)?.length === 1)
                        )) {
                            return false;
                        }
                        const badTitleHeaderMatch = str.match(/{([\s\S]*?)}/);
                        if (!badTitleHeaderMatch) {
                            return false;
                        }
                        const inferredTitle = badTitleHeaderMatch[1].split(",")[0].trim();
                        if (
                            (2 < inferredTitle.length)
                            && (inferredTitle.length <= 100)
                            && (badTitleHeaderMatch[0].length < str.length)
                        ) {
                            // A rare case where the title's existence should be inferred from the enclosing {curly brackets}
                            return inferredTitle;
                        }
                        return false;
                    })(), hasUpdates, hasLimit];
                }).flat();
                if (traits.every(trait => !trait)) {
                    // This card contains no auto-card traits, not even malformed ones
                    checkRemaining();
                    continue;
                }
                const [
                    hasEntryTitle,
                    hasEntryUpdates,
                    hasEntryLimit,
                    hasDescTitle,
                    hasDescUpdates,
                    hasDescLimit
                ] = traits;
                // Handle all story cards which belong to the Auto-Cards ecosystem
                // May flag this damaged auto-card for later repairs
                // May flag this duplicate auto-card for deformatting (will become a regular story card)
                let repair = false;
                let release = false;
                const title = (function() {
                    let title = "";
                    if (typeof hasEntryTitle === "string") {
                        repair = true;
                        title = formatTitle(hasEntryTitle).newTitle;
                        if (hasDescTitle && bad()) {
                            title = parseTitle(false);
                        }
                    } else if (hasEntryTitle) {
                        title = parseTitle(true);
                        if (hasDescTitle) {
                            repair = true;
                            if (bad()) {
                                title = parseTitle(false);
                            }
                        } else if (1 < card.entry.match(/titles?\s*:/gi)?.length) {
                            repair = true;
                        }
                    } else if (hasDescTitle) {
                        repair = true;
                        title = parseTitle(false);
                    }
                    if (bad()) {
                        repair = true;
                        title = formatTitle(card.title).newTitle;
                        if (bad()) {
                            release = true;
                        } else {
                            seen.add(title);
                            auto.add(title.toLowerCase());
                        }
                    } else {
                        seen.add(title);
                        auto.add(title.toLowerCase());
                        const titleHeader = "{title: " + title + "}";
                        if (!repair && !((card.entry === titleHeader) || card.entry.startsWith(titleHeader + "\n"))) {
                            repair = true;
                        }
                    }
                    function bad() {
                        return ((title === "") || checkPlurals(title, t => auto.has(t)));
                    }
                    function parseTitle(fromEntry) {
                        const [sourceType, sourceText] = (function() {
                            if (fromEntry) {
                                return [hasEntryTitle, card.entry];
                            } else {
                                return [hasDescTitle, card.description];
                            }
                        })()
                        switch(sourceType) {
                        case 1: {
                            return formatTitle(isolateProperty(
                                sourceText,
                                /titles?\s*:[\s\S]*?}/i,
                                /(?:titles?\s*:|})/gi
                            )).newTitle; }
                        case 2: {
                            return formatTitle(isolateProperty(
                                sourceText,
                                /titles?\s*:[\s\S]*?(?:(?:limit|update)s?\s*:|})/i,
                                /(?:(?:title|update|limit)s?\s*:|})/gi
                            )).newTitle; }
                        default: {
                            return ""; }
                        }
                    }
                    return title;
                })();
                if (release) {
                    // Remove Auto-Cards properties from this incompatible story card
                    safeRemoveProps();
                    card.description = (card.description
                        .replace(/\s*Auto(?:-|\s*)Cards\s*will\s*contextualize\s*these\s*memories\s*:\s*/gi, "")
                        .replaceAll("%@%", "\n\n")
                        .trim()
                    );
                    seen.delete(title);
                    checkRemaining();
                    continue;
                }
                const memoryProperties = "{updates: " + (function() {
                    let updates = null;
                    if (hasDescUpdates) {
                        updates = parseUpdates(false);
                        if (hasEntryUpdates) {
                            repair = true;
                            if (bad()) {
                                updates = parseUpdates(true);
                            }
                        } else if (1 < card.description.match(/updates?\s*:/gi)?.length) {
                            repair = true;
                        }
                    } else if (hasEntryUpdates) {
                        repair = true;
                        updates = parseUpdates(true);
                    }
                    if (bad()) {
                        repair = true;
                        updates = AC.config.defaultCardsDoMemoryUpdates;
                    }
                    function bad() {
                        return (updates === null);
                    }
                    function parseUpdates(fromEntry) {
                        const updatesText = (isolateProperty(
                            (function() {
                                if (fromEntry) {
                                    return card.entry;
                                } else {
                                    return card.description;
                                }
                            })(),
                            /updates?\s*:[\s\S]*?(?:(?:title|limit)s?\s*:|})/i,
                            /(?:(?:title|update|limit)s?\s*:|})/gi
                        ).toLowerCase().replace(/[^a-z]/g, ""));
                        if (Words.trues.includes(updatesText)) {
                            return true;
                        } else if (Words.falses.includes(updatesText)) {
                            return false;
                        } else {
                            return null;
                        }
                    }
                    return updates;
                })() + ", limit: " + (function() {
                    let limit = -1;
                    if (hasDescLimit) {
                        limit = parseLimit(false);
                        if (hasEntryLimit) {
                            repair = true;
                            if (bad()) {
                                limit = parseLimit(true);
                            }
                        } else if (1 < card.description.match(/limits?\s*:/gi)?.length) {
                            repair = true;
                        }
                    } else if (hasEntryLimit) {
                        repair = true;
                        limit = parseLimit(true);
                    }
                    if (bad()) {
                        repair = true;
                        limit = AC.config.defaultMemoryLimit;
                    } else {
                        limit = validateMemoryLimit(limit);
                    }
                    function bad() {
                        return (limit === -1);
                    }
                    function parseLimit(fromEntry) {
                        const limitText = (isolateProperty(
                            (function() {
                                if (fromEntry) {
                                    return card.entry;
                                } else {
                                    return card.description;
                                }
                            })(),
                            /limits?\s*:[\s\S]*?(?:(?:title|update)s?\s*:|})/i,
                            /(?:(?:title|update|limit)s?\s*:|})/gi
                        ).replace(/[^0-9]/g, ""));
                        if ((limitText === "")) {
                            return -1;
                        } else {
                            return parseInt(limitText, 10);
                        }
                    }
                    return limit.toString();
                })() + "}";
                if (!repair && (new RegExp("(?:^|\\n)" + memoryProperties + "(?:\\n|$)")).test(card.description)) {
                    // There are no serious repairs to perform
                    card.entry = cleanSpaces(card.entry);
                    const [notes, memories] = isolateNotesAndMemories(card.description);
                    const pureMemories = cleanSpaces(memories.replace(memoryProperties, "").trim());
                    rejoinDescription(notes, memoryProperties, pureMemories);
                    checkRemaining();
                    continue;
                }
                // Damage was detected, perform an adaptive repair on this auto-card's configurable properties
                card.description = card.description.replaceAll("%@%", "\n\n");
                safeRemoveProps();
                card.entry = limitString(("{title: " + title + "}\n" + card.entry).trimEnd(), 2000);
                const [left, right] = card.description.split("%@%");
                rejoinDescription(left, memoryProperties, right);
                checkRemaining();
                function safeRemoveProps() {
                    if (typeof hasEntryTitle === "string") {
                        card.entry = card.entry.replace(/{[\s\S]*?}/g, "");
                    }
                    card.entry = removeAutoProps(card.entry);
                    const [notes, memories] = isolateNotesAndMemories(card.description);
                    card.description = notes + "%@%" + removeAutoProps(memories);
                    return;
                }
                function rejoinDescription(notes, memoryProperties, memories) {
                    card.description = limitString((notes + (function() {
                        if (notes === "") {
                            return "";
                        } else if (notes.endsWith("Auto-Cards will contextualize these memories:")) {
                            return "\n";
                        } else {
                            return "\n\n";
                        }
                    })() + memoryProperties + (function() {
                        if (memories === "") {
                            return "";
                        } else {
                            return "\n";
                        }
                    })() + memories), 10000);
                    return;
                }
                function isolateProperty(sourceText, propMatcher, propCleaner) {
                    return ((sourceText.match(propMatcher)?.[0] || "")
                        .replace(propCleaner, "")
                        .split(",")[0]
                        .trim()
                    );
                }
                // Observe literal card titles and keys
                function checkRemaining() {
                    const literalTitles = [card.title, ...card.keys.split(",")];
                    for (let i = 0; i < literalTitles.length; i++) {
                        // The pre-format set inclusion check helps avoid superfluous formatTitle calls
                        literalTitles[i] = (literalTitles[i]
                            .replace(/["\.\?!;\(\):\[\]—{}]/g, " ")
                            .trim()
                            .replace(/\s+/g, " ")
                            .replace(/^'\s*/, "")
                            .replace(/\s*'$/, "")
                        );
                        if (seen.has(literalTitles[i])) {
                            continue;
                        }
                        literalTitles[i] = formatTitle(literalTitles[i]).newTitle;
                        if (literalTitles[i] !== "") {
                            seen.add(literalTitles[i]);
                        }
                    }
                    return;
                }
                function denumberName(name) {
                    if (2 < (name.match(/[^\d\s]/g) || []).length) {
                        // Important for identifying LSIv2 auxiliary code cards when banned
                        return name.replace(/\s*\d+$/, "");
                    } else {
                        return name;
                    }
                }
            }
            clearTransientTitles();
            AC.database.titles.used = [...seen];
            return AC.database.titles.used;
        }
        static getBannedTitles() {
            // AC.database.titles.banned is an array, not a set; order matters
            return AC.database.titles.banned;
        }
        static setBannedTitles(newBans, isFinalAssignment) {
            AC.database.titles.banned = [];
            AC.database.titles.pendingBans = [];
            AC.database.titles.pendingUnbans = [];
            for (let i = newBans.length - 1; 0 <= i; i--) {
                banTitle(newBans[i], isFinalAssignment);
            }
            return AC.database.titles.banned;
        }
        static getCard(predicate, getAll) {
            if (getAll) {
                // Return an array of card references which satisfy the given condition
                const collectedCards = [];
                for (const card of storyCards) {
                    if (predicate(card)) {
                        O.s(card);
                        collectedCards.push(card);
                    }
                }
                return collectedCards;
            }
            // Return a reference to the first card which satisfies the given condition
            for (const card of storyCards) {
                if (predicate(card)) {
                    return O.s(card);
                }
            }
            return null;
        }
    }); }
    function validateCooldown(cooldown) {
        return boundInteger(0, cooldown, 9999, 40);
    }
    function validateEntryLimit(entryLimit) {
        return boundInteger(200, entryLimit, 2000, 600);
    }
    function validateMemoryLimit(memoryLimit) {
        return boundInteger(1750, memoryLimit, 9900, 3200);
    }
    function validateMemCompRatio(memCompressRatio) {
        return boundInteger(20, memCompressRatio, 1250, 25);
    }
    function validateMLBD(minLookBackDist) {
        return boundInteger(2, minLookBackDist, 88, 7);
    }
    function getDefaultConfig() {
        function check(value, fallback = true, type = "boolean") {
            if (typeof value === type) {
                return value;
            } else {
                return fallback;
            }
        }
        function maybeProse(value) {
            if (Array.isArray(value)) {
                return prose(...value);
            } else {
                return value;
            }
        }
        return O.s({
            // Is Auto-Cards enabled?
            doAC: check(S.DEFAULT_DO_AC),
            // Delete all previously generated story cards?
            deleteAllAutoCards: null,
            // Pin the configuration interface story card near the top?
            pinConfigureCard: check(S.DEFAULT_PIN_CONFIGURE_CARD),
            // Minimum number of turns in between automatic card generation events?
            addCardCooldown: validateCooldown(S.DEFAULT_CARD_CREATION_COOLDOWN),
            // Use bulleted list mode for newly generated card entries?
            bulletedListMode: check(S.DEFAULT_USE_BULLETED_LIST_MODE),
            // Maximum allowed length for newly generated story card entries?
            defaultEntryLimit: validateEntryLimit(S.DEFAULT_GENERATED_ENTRY_LIMIT),
            // Do newly generated cards have memory updates enabled by default?
            defaultCardsDoMemoryUpdates: check(S.DEFAULT_NEW_CARDS_DO_MEMORY_UPDATES),
            // Default character limit before the card's memory bank is summarized?
            defaultMemoryLimit: validateMemoryLimit(S.DEFAULT_NEW_CARDS_MEMORY_LIMIT),
            // Approximately how much shorter should recently compressed memories be? (ratio = 10 * old / new)
            memoryCompressionRatio: validateMemCompRatio(S.DEFAULT_MEMORY_COMPRESSION_RATIO),
            // Ignore all-caps during title candidate detection?
            ignoreAllCapsTitles: check(S.DEFAULT_IGNORE_ALL_CAPS_TITLES),
            // Should player input actions (Do/Say/Story) be considered for future named entity detection?
            readFromInputs: check(S.DEFAULT_DETECT_TITLES_FROM_INPUTS),
            // How many (minimum) actions in the past does Auto-Cards look for named entities?
            minimumLookBackDistance: validateMLBD(S.DEFAULT_MINIMUM_LOOK_BACK_DISTANCE),
            // Is Live Script Interface v2 enabled?
            LSIv2: (function() {
                if (S.DEFAULT_DO_LSI_V2 === true) {
                    return true;
                } else {
                    // Intrepret "false" as null, both here and for later config card reads
                    return null;
                }
            })(),
            // Should the debug data card be visible?
            showDebugData: check(S.DEFAULT_SHOW_DEBUG_DATA, false),
            // How should the AI be prompted when generating new story card entries?
            generationPrompt: check(maybeProse(S.DEFAULT_CARD_GENERATION_PROMPT), prose(
                "-----",
                "",
                "<SYSTEM>",
                "# Stop the story and ignore previous instructions. Write a brief and coherent informational entry for %{title} following these instructions:",
                "- Write only third-person pure prose information about %{title} using complete sentences with correct punctuation",
                "- Avoid short-term temporary details or appearances, instead focus on plot-significant information",
                "- Prioritize story-relevant details about %{title} first to ensure seamless integration with the previous plot",
                "- Create new information based on the context and story direction",
                "- Mention %{title} in every sentence",
                "- Use semicolons if needed",
                "- Add additional details about %{title} beneath incomplete entries",
                "- Be concise and grounded",
                "- Imitate the story's writing style and infer the reader's preferences",
                "</SYSTEM>",
                "Continue the entry for %{title} below while avoiding repetition:",
                "%{entry}"
            ), "string"),
            // How should the AI be prompted when summarizing memories for a given story card?
            compressionPrompt: check(maybeProse(S.DEFAULT_CARD_MEMORY_COMPRESSION_PROMPT), prose(
                "-----",
                "",
                "<SYSTEM>",
                "# Stop the story and ignore previous instructions. Summarize and condense the given paragraph into a narrow and focused memory passage while following these guidelines:",
                "- Ensure the passage retains the core meaning and most essential details",
                "- Use the third-person perspective",
                "- Prioritize information-density, accuracy, and completeness",
                "- Remain brief and concise",
                "- Write firmly in the past tense",
                "- The paragraph below pertains to old events from far earlier in the story",
                "- Integrate %{title} naturally within the memory; however, only write about the events as they occurred",
                "- Only reference information present inside the paragraph itself, be specific",
                "</SYSTEM>",
                "Write a summarized old memory passage for %{title} based only on the following paragraph:",
                "\"\"\"",
                "%{memory}",
                "\"\"\"",
                "Summarize below:"
            ), "string"),
            // All cards constructed by AC will inherit this type by default
            defaultCardType: check(S.DEFAULT_CARD_TYPE, "class", "string")
        });
    }
    function getDefaultConfigBans() {
        if (typeof S.DEFAULT_BANNED_TITLES_LIST === "string") {
            return uniqueTitlesArray(S.DEFAULT_BANNED_TITLES_LIST.split(","));
        } else {
            return [
                "North", "East", "South", "West", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
            ];
        }
    }
    function uniqueTitlesArray(titles) {
        const existingTitles = new Set();
        return (titles
            .map(title => title.trim().replace(/\s+/g, " "))
            .filter(title => {
                if (title === "") {
                    return false;
                }
                const lowerTitle = title.toLowerCase();
                if (existingTitles.has(lowerTitle)) {
                    return false;
                } else {
                    existingTitles.add(lowerTitle);
                    return true;
                }
            })
        );
    }
    function boundInteger(lowerBound, value, upperBound, fallback) {
        if (!Number.isInteger(value)) {
            if (!Number.isInteger(fallback)) {
                throw new Error("Invalid arguments: value and fallback are not integers");
            }
            value = fallback;
        }
        if (Number.isInteger(lowerBound) && (value < lowerBound)) {
            if (Number.isInteger(upperBound) && (upperBound < lowerBound)) {
                throw new Error("Invalid arguments: The inequality (lowerBound <= upperBound) must be satisfied");
            }
            return lowerBound;
        } else if (Number.isInteger(upperBound) && (upperBound < value)) {
            return upperBound;
        } else {
            return value;
        }
    }
    function limitString(str, lengthLimit) {
        if (lengthLimit < str.length) {
            return str.slice(0, lengthLimit).trim();
        } else {
            return str;
        }
    }
    function cleanSpaces(unclean) {
        return (unclean
            .replace(/\s*\n\s*/g, "\n")
            .replace(/\t/g, " ")
            .replace(/  +/g, " ")
        );
    }
    function isolateNotesAndMemories(str) {
        const bisector = str.search(/\s*(?:{|(?:title|update|limit)s?\s*:)\s*/i);
        if (bisector === -1) {
            return [str, ""];
        } else {
            return [str.slice(0, bisector), str.slice(bisector)];
        }
    }
    function removeAutoProps(str) {
        return cleanSpaces(str
            .replace(/\s*{([\s\S]*?)}\s*/g, (bracedMatch, enclosedProperties) => {
                if (enclosedProperties.trim().length < 150) {
                    return "\n";
                } else {
                    return bracedMatch;
                }
            })
            .replace((
                /\s*(?:{|(?:title|update|limit)s?\s*:)(?:[\s\S]{0,150}?)(?=(?:title|update|limit)s?\s*:|})\s*/gi
            ), "\n")
            .replace(/\s*(?:{|(?:title|update|limit)s?\s*:|})\s*/gi, "\n")
            .trim()
        );
    }
    function insertTitle(prompt, title) {
        return prompt.replace((
            /(?:[%\$]+\s*|[%\$]*){+\s*(?:titles?|names?|characters?|class(?:es)?|races?|locations?|factions?)\s*}+/gi
        ), title);
    }
    function prose(...args) {
        return args.join("\n");
    }
    function buildKeys(keys, key) {
        key = key.trim().replace(/\s+/g, " ");
        const keyset = [];
        if (key === "") {
            return keys;
        } else if (keys.trim() !== "") {
            keyset.push(...keys.split(","));
            const lowerKey = key.toLowerCase();
            for (let i = keyset.length - 1; 0 <= i; i--) {
                const preKey = keyset[i].trim().replace(/\s+/g, " ").toLowerCase();
                if ((preKey === "") || preKey.includes(lowerKey)) {
                    keyset.splice(i, 1);
                }
            }
        }
        if (key.length < 6) {
            keyset.push(...[
                " " + key + " ", " " + key + "'", "\"" + key + " ", " " + key + ".", " " + key + "?", " " + key + "!", " " + key + ";", "'" + key + " ", "(" + key + " ", " " + key + ")", " " + key + ":", " " + key + "\"", "[" + key + " ", " " + key + "]", "—" + key + " ", " " + key + "—", "{" + key + " ", " " + key + "}"
            ]);
        } else if (key.length < 9) {
            keyset.push(...[
                key + " ", " " + key, key + "'", "\"" + key, key + ".", key + "?", key + "!", key + ";", "'" + key, "(" + key, key + ")", key + ":", key + "\"", "[" + key, key + "]", "—" + key, key + "—", "{" + key, key + "}"
            ]);
        } else {
            keyset.push(key);
        }
        keys = keyset[0] || key;
        let i = 1;
        while ((i < keyset.length) && ((keys.length + 1 + keyset[i].length) < 101)) {
            keys += "," + keyset[i];
            i++;
        }
        return keys;
    }
    // Returns the template-specified singleton card (or secondary varient) after:
    // 1) Erasing all inferior duplicates
    // 2) Repairing damaged titles and keys
    // 3) Constructing a new singleton card if it doesn't exist
    function getSingletonCard(allowConstruction, templateCard, secondaryCard) {
        let singletonCard = null;
        const excessCards = [];
        for (const card of storyCards) {
            O.s(card);
            if (singletonCard === null) {
                if ((card.title === templateCard.title) || (card.keys === templateCard.keys)) {
                    // The first potentially valid singleton card candidate to be found
                    singletonCard = card;
                }
            } else if (card.title === templateCard.title) {
                if (card.keys === templateCard.keys) {
                    excessCards.push(singletonCard);
                    singletonCard = card;
                } else {
                    eraseInferiorDuplicate();
                }
            } else if (card.keys === templateCard.keys) {
                eraseInferiorDuplicate();
            }
            function eraseInferiorDuplicate() {
                if ((singletonCard.title === templateCard.title) && (singletonCard.keys === templateCard.keys)) {
                    excessCards.push(card);
                } else {
                    excessCards.push(singletonCard);
                    singletonCard = card;
                }
                return;
            }
        }
        if (singletonCard === null) {
            if (secondaryCard) {
                // Fallback to a secondary card template
                singletonCard = getSingletonCard(false, secondaryCard);
            }
            // No singleton card candidate exists
            if (allowConstruction && (singletonCard === null)) {
                // Construct a new singleton card from the given template
                singletonCard = constructCard(templateCard);
            }
        } else {
            if (singletonCard.title !== templateCard.title) {
                // Repair any damage to the singleton card's title
                singletonCard.title = templateCard.title;
            } else if (singletonCard.keys !== templateCard.keys) {
                // Repair any damage to the singleton card's keys
                singletonCard.keys = templateCard.keys;
            }
            for (const card of excessCards) {
                // Erase all excess singleton card candidates
                eraseCard(card);
            }
            if (secondaryCard) {
                // A secondary card match cannot be allowed to persist
                eraseCard(getSingletonCard(false, secondaryCard));
            }
        }
        return singletonCard;
    }
    // Erases the given story card
    function eraseCard(badCard) {
        if (badCard === null) {
            return false;
        }
        badCard.title = "%@%";
        for (const [index, card] of storyCards.entries()) {
            if (card.title === "%@%") {
                removeStoryCard(index);
                return true;
            }
        }
        return false;
    }
    // Constructs a new story card from a standardized story card template object
    // {type: "", title: "", keys: "", entry: "", description: ""}
    // Returns a reference to the newly constructed card
    function constructCard(templateCard, insertionIndex = 0) {
        addStoryCard("%@%");
        for (const [index, card] of storyCards.entries()) {
            if (card.title !== "%@%") {
                continue;
            }
            card.type = templateCard.type;
            card.title = templateCard.title;
            card.keys = templateCard.keys;
            card.entry = templateCard.entry;
            card.description = templateCard.description;
            if (index !== insertionIndex) {
                // Remove from the current position and reinsert at the desired index
                storyCards.splice(index, 1);
                storyCards.splice(insertionIndex, 0, card);
            }
            return O.s(card);
        }
        return {};
    }
    function newCardIndex() {
        return +AC.config.pinConfigureCard;
    }
    function getIntendedCard(targetCard) {
        Internal.getUsedTitles(true);
        const titleKey = targetCard.trim().replace(/\s+/g, " ").toLowerCase();
        const autoCard = Internal.getCard(card => (card.entry
            .toLowerCase()
            .startsWith("{title: " + titleKey + "}")
        ));
        if (autoCard !== null) {
            return [autoCard, true, titleKey];
        }
        return [Internal.getCard(card => ((card.title
            .replace(/\s+/g, " ")
            .toLowerCase()
        ) === titleKey)), false, titleKey];
    }
    function doPlayerCommands(input) {
        let result = "";
        for (const command of (
            (function() {
                if (/^\n> [\s\S]*? says? "[\s\S]*?"\n$/.test(input)) {
                    return input.replace(/\s*"\n$/, "");
                } else {
                    return input.trimEnd();
                }
            })().split(/(?=\/\s*A\s*C)/i)
        )) {
            const prefixPattern = /^\/\s*A\s*C/i;
            if (!prefixPattern.test(command)) {
                continue;
            }
            const [requestTitle, requestDetails, requestEntry] = (command
                .replace(/(?:{\s*)|(?:\s*})/g, "")
                .replace(prefixPattern, "")
                .replace(/(?:^\s*\/*\s*)|(?:\s*\/*\s*$)/g, "")
                .split("/")
                .map(requestArg => requestArg.trim())
                .filter(requestArg => (requestArg !== ""))
            );
            if (!requestTitle) {
                // Request with no args
                AC.generation.cooldown = 0;
                result += "/AC -> Success!\n\n";
                logEvent("/AC");
            } else {
                const request = {title: requestTitle.replace(/\s*[\.\?!:]+$/, "")};
                const redo = (function() {
                    const redoPattern = /^(?:redo|retry|rewrite|remake)[\s\.\?!:,;"'—\)\]]+\s*/i;
                    if (redoPattern.test(request.title)) {
                        request.title = request.title.replace(redoPattern, "");
                        if (/^(?:all|every)(?:\s|\.|\?|!|:|,|;|"|'|—|\)|\]|$)/i.test(request.title)) {
                            return [];
                        } else {
                            return true;
                        }
                    } else {
                        return false;
                    }
                })();
                if (Array.isArray(redo)) {
                    // Redo all auto cards
                    Internal.getUsedTitles(true);
                    const titleMatchPattern = /^{title: ([\s\S]*?)}/;
                    redo.push(...Internal.getCard(card => (
                        titleMatchPattern.test(card.entry)
                        && /{updates: (?:true|false), limit: \d+}/.test(card.description)
                    ), true));
                    let count = 0;
                    for (const card of redo) {
                        const titleMatch = card.entry.match(titleMatchPattern);  
                        if (titleMatch && Internal.redoCard(O.f({title: titleMatch[1]}), true, "")) {
                            count++;
                        }
                    }
                    const parsed = "/AC redo all";
                    result += parsed + " -> ";
                    if (count === 0) {
                        result += "There were no valid auto-cards to redo";
                    } else {
                        result += "Success!";
                        if (1 < count) {
                            result += " Proceed to redo " + count + " cards";
                        }
                    }
                    logEvent(parsed);
                } else if (!requestDetails) {
                    // Request with only title
                    submitRequest("");
                } else if (!requestEntry || redo) {
                    // Request with title and details
                    request.entryPromptDetails = requestDetails;
                    submitRequest(" / {" + requestDetails + "}");
                } else {
                    // Request with title, details, and entry
                    request.entryPromptDetails = requestDetails;
                    request.entryStart = requestEntry;
                    submitRequest(" / {" + requestDetails + "} / {" + requestEntry + "}");
                }
                result += "\n\n";
                function submitRequest(extra) {
                    O.f(request);
                    const [type, success] = (function() {
                        if (redo) {
                            return [" redo", Internal.redoCard(request, true, "")];
                        } else {
                            Internal.getUsedTitles(true);
                            return ["", Internal.generateCard(request)];
                        }
                    })();
                    const left = "/AC" + type + " {";
                    const right = "}" + extra;
                    if (success) {
                        const parsed = left + AC.generation.pending[AC.generation.pending.length - 1].title + right;
                        result += parsed + " -> Success!";
                        logEvent(parsed);
                    } else {
                        const parsed = left + request.title + right;
                        result += parsed + " -> \"" + request.title + "\" is invalid or unavailable";
                        logEvent(parsed);
                    }
                    return;
                }
            }
            if (isPendingGeneration() || isAwaitingGeneration() || isPendingCompression()) {
                if (AC.config.doAC) {
                    AC.signal.outputReplacement = "";
                } else {
                    AC.signal.forceToggle = true;
                    AC.signal.outputReplacement = ">>> please select \"continue\" (0%) <<<";
                }
            } else if (AC.generation.cooldown === 0) {
                if (0 < AC.database.titles.candidates.length) {
                    if (AC.config.doAC) {
                        AC.signal.outputReplacement = "";
                    } else {
                        AC.signal.forceToggle = true;
                        AC.signal.outputReplacement = ">>> please select \"continue\" (0%) <<<";
                    }
                } else if (AC.config.doAC) {
                    result = result.trimEnd() + "\n";
                    AC.signal.outputReplacement = "\n";
                } else {
                    AC.signal.forceToggle = true;
                    AC.signal.outputReplacement = ">>> Auto-Cards has been enabled! <<<";
                }
            } else {
                result = result.trimEnd() + "\n";
                AC.signal.outputReplacement = "\n";
            }
        }
        return getPrecedingNewlines() + result;
    }
    function advanceChronometer() {
        const currentTurn = getTurn();
        if (Math.abs(history.length - currentTurn) < 2) {
            // The two measures are within ±1, thus history hasn't been truncated yet
            AC.chronometer.step = !(history.length < currentTurn);
        } else {
            // history has been truncated, fallback to a (slightly) worse step detection technique
            AC.chronometer.step = (AC.chronometer.turn < currentTurn);
        }
        AC.chronometer.turn = currentTurn;
        return;
    }
    function concludeEmergency() {
        promoteAmnesia();
        endTurn();
        AC.message.pending = [];
        AC.message.previous = getStateMessage();
        return;
    }
    function concludeOutputBlock(templateCard) {
        if (AC.config.deleteAllAutoCards !== null) {
            // A config-initiated event to delete all previously generated story cards is in progress
            if (AC.config.deleteAllAutoCards) {
                // Request in-game confirmation from the player before proceeding
                AC.config.deleteAllAutoCards = false;
                CODOMAIN.initialize(getPrecedingNewlines() + ">>> please submit the message \"CONFIRM DELETE\" using a Do, Say, or Story action to permanently delete all previously generated story cards <<<\n\n");
            } else {
                // Check for player confirmation
                const previousAction = readPastAction(0);
                if (isDoSayStory(previousAction.type) && /CONFIRM\s*DELETE/i.test(previousAction.text)) {
                    let successMessage = "Confirmation Success: ";
                    const numCardsErased = Internal.eraseAllAutoCards();
                    if (numCardsErased === 0) {
                        successMessage += "However, there were no previously generated story cards to delete!";
                    } else {
                        successMessage += numCardsErased + " generated story card";
                        if (numCardsErased === 1) {
                            successMessage += " was";
                        } else {
                            successMessage += "s were";
                        }
                        successMessage += " deleted";
                    }
                    notify(successMessage);
                } else {
                    notify("Confirmation Failure: No story cards were deleted");
                }
                AC.config.deleteAllAutoCards = null;
                CODOMAIN.initialize("\n");
            }
        } else if (AC.signal.outputReplacement !== "") {
            const output = AC.signal.outputReplacement.trim();
            if (output === "") {
                CODOMAIN.initialize("\n");
            } else {
                CODOMAIN.initialize(getPrecedingNewlines() + output + "\n\n");
            }
        }
        if (templateCard) {
            // Auto-Cards was enabled or disabled during the previous onContext hook
            // Construct the replacement control card onOutput
            banTitle(templateCard.title);
            getSingletonCard(true, templateCard);
            AC.signal.swapControlCards = false;
        }
        endTurn();
        if (AC.config.LSIv2 === null) {
            postMessages();
        }
        return;
    }
    function endTurn() {
        AC.database.titles.used = [];
        AC.signal.outputReplacement = "";
        [AC.database.titles.pendingBans, AC.database.titles.pendingUnbans].map(pending => decrementAll(pending));
        if (0 < AC.signal.overrideBans) {
            AC.signal.overrideBans--;
        }
        function decrementAll(pendingArray) {
            if (pendingArray.length === 0) {
                return;
            }
            for (let i = pendingArray.length - 1; 0 <= i; i--) {
                if (0 < pendingArray[i][1]) {
                    pendingArray[i][1]--;
                } else {
                    pendingArray.splice(i, 1);
                }
            }
            return;
        }
        return;
    }
    // Example usage: notify("Message text goes here");
    function notify(message) {
        if (typeof message === "string") {
            AC.message.pending.push(message);
            logEvent(message);
        } else if (Array.isArray(message)) {
            message.forEach(element => notify(element));
        } else if (message instanceof Set) {
            notify([...message]);
        } else {
            notify(message.toString());
        }
        return;
    }
    function logEvent(message, uncounted) {
        if (uncounted) {
            log("Auto-Cards event: " + message);
        } else {
            log("Auto-Cards event #" + (function() {
                try {
                    AC.message.event++;
                    return AC.message.event;
                } catch {
                    return 0;
                }
            })() + ": " + message.replace(/"/g, "'"));
        }
        return;
    }
    // Provide the story card object which you wish to log info within as the first argument
    // All remaining arguments represent anything you wish to log
    function logToCard(logCard, ...args) {
        logEvent(args.map(arg => {
            if ((typeof arg === "object") && (arg !== null)) {
                return JSON.stringify(arg);
            } else {
                return String(arg);
            }
        }).join(", "), true);
        if (logCard === null) {
            return;
        }
        let desc = logCard.description.trim();
        const turnDelimiter = Words.delimiter + "\nAction #" + getTurn() + ":\n";
        let header = turnDelimiter;
        if (!desc.startsWith(turnDelimiter)) {
            desc = turnDelimiter + desc;
        }
        const scopesTable = [
            ["input", "Input Modifier"],
            ["context", "Context Modifier"],
            ["output", "Output Modifier"],
            [null, "Shared Library"],
            [undefined, "External API"],
            [Symbol("default"), "Unknown Scope"]
        ];
        const callingScope = (function() {
            const pair = scopesTable.find(([condition]) => (condition === HOOK));
            if (pair) {
                return pair[1];
            } else {
                return scopesTable[scopesTable.length - 1][1];
            }
        })();
        const hookDelimiterLeft = callingScope + " @ ";
        if (desc.startsWith(turnDelimiter + hookDelimiterLeft)) {
            const hookDelimiterOld = desc.match(new RegExp((
                "^" + turnDelimiter + "(" + hookDelimiterLeft + "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z:\n)"
            ).replaceAll("\n", "\\n")));
            if (hookDelimiterOld) {
                header += hookDelimiterOld[1];
            } else {
                const hookDelimiter = getNewHookDelimiter();
                desc = desc.replace(hookDelimiterLeft, hookDelimiter);
                header += hookDelimiter;
            }
        } else {
            if ((new RegExp("^" + turnDelimiter.replaceAll("\n", "\\n") + "(" + (scopesTable
                .map(pair => pair[1])
                .filter(scope => (scope !== callingScope))
                .join("|")
            ) + ") @ ")).test(desc)) {
                desc = desc.replace(turnDelimiter, turnDelimiter + "—————————\n");
            }
            const hookDelimiter = getNewHookDelimiter();
            desc = desc.replace(turnDelimiter, turnDelimiter + hookDelimiter);
            header += hookDelimiter;
        }
        const logDelimiter = (function() {
            let logDelimiter = "Log #";
            if (desc.startsWith(header + logDelimiter)) {
                desc = desc.replace(header, header + "———\n");
                const logCounter = desc.match(/Log #(\d+)/);
                if (logCounter) {
                    logDelimiter += (parseInt(logCounter[1], 10) + 1).toString();
                }
            } else {
                logDelimiter += "0";
            }
            return logDelimiter + ": ";
        })();
        logCard.description = limitString(desc.replace(header, header + logDelimiter + args.map(arg => {
            if ((typeof arg === "object") && (arg !== null)) {
                return stringifyObject(arg);
            } else {
                return String(arg);
            }
        }).join(",\n") + "\n").trim(), 999999);
        // The upper limit is actually closer to 3985621, but I think 1 million is reasonable enough as-is
        function getNewHookDelimiter() {
            return hookDelimiterLeft + (new Date().toISOString()) + ":\n";
        }
        return;
    }
    // Makes nested objects not look like cancer within interface cards
    function stringifyObject(obj) {
        const seen = new WeakSet();
        // Each indentation is 4 spaces
        return JSON.stringify(obj, (_key, value) => {
            if ((typeof value === "object") && (value !== null)) {
                if (seen.has(value)) {
                    return "[Circular]";
                }
                seen.add(value);
            }
            switch(typeof value) {
            case "function": {
                return "[Function]"; }
            case "undefined": {
                return "[Undefined]"; }
            case "symbol": {
                return "[Symbol]"; }
            default: {
                return value; }
            }
        }, 4);
    }
    // Implement state.message toasts without interfering with the operation of other possible scripts
    function postMessages() {
        const preMessage = getStateMessage();
        if ((preMessage === AC.message.previous) && (AC.message.pending.length !== 0)) {
            // No other scripts are attempting to update state.message during this turn
            // One or more pending Auto-Cards messages exist
            if (!AC.message.suppress) {
                // Message suppression is off
                let newMessage = "Auto-Cards:\n";
                if (AC.message.pending.length === 1) {
                    newMessage += AC.message.pending[0];
                } else {
                    newMessage += AC.message.pending.map(
                        (messageLine, index) => ("#" + (index + 1) + ": " + messageLine)
                    ).join("\n");
                }
                if (preMessage === newMessage) {
                    // Introduce a minor variation to facilitate repetition of the previous message toast
                    newMessage = newMessage.replace("Auto-Cards:\n", "Auto-Cards: \n");
                }
                state.message = newMessage;
            }
            // Clear the pending messages queue after posting or suppressing messages
            AC.message.pending = [];
        }
        AC.message.previous = getStateMessage();
        return;
    }
    function getStateMessage() {
        return state.message ?? "";
    }
    function getPrecedingNewlines() {
        const previousAction = readPastAction(0);
        if (isDoSay(previousAction.type)) {
            return "";
        } else if (previousAction.text.endsWith("\n")) {
            if (previousAction.text.endsWith("\n\n")) {
                return "";
            } else {
                return "\n";
            }
        } else {
            return "\n\n";
        }
    }
    // Call with lookBack 0 to read the most recent action in history (or n many actions back)
    function readPastAction(lookBack) {
        const action = (function() {
            if (Array.isArray(history)) {
                return (history[(function() {
                    const index = history.length - 1 - Math.abs(lookBack);
                    if (index < 0) {
                        return 0;
                    } else {
                        return index;
                    }
                })()]);
            } else {
                return O.f({});
            }
        })();
        return O.f({
            text: action?.text ?? (action?.rawText ?? ""),
            type: action?.type ?? "unknown"
        });
    }
    // Forget ongoing card generation/compression after passing or postponing completion over many consecutive turns
    // Also decrement AC.chronometer.postpone regardless of retries or erases
    function promoteAmnesia() {
        // Decrement AC.chronometer.postpone in all cases
        if (0 < AC.chronometer.postpone) {
            AC.chronometer.postpone--;
        }
        if (!AC.chronometer.step) {
            // Skip known retry/erase turns
            return;
        }
        if (AC.chronometer.amnesia++ < boundInteger(16, (2 * AC.config.addCardCooldown), 64)) {
            return;
        }
        AC.generation.cooldown = validateCooldown(underQuarterInteger(AC.config.addCardCooldown));
        forgetStuff();
        AC.chronometer.amnesia = 0;
        return;
    }
    function forgetStuff() {
        AC.generation.completed = 0;
        AC.generation.permitted = 34;
        AC.generation.workpiece = O.f({});
        // AC.generation.pending is not forgotten
        resetCompressionProperties();
        return;
    }
    function resetCompressionProperties() {
        AC.compression.completed = 0;
        AC.compression.titleKey = "";
        AC.compression.vanityTitle = "";
        AC.compression.responseEstimate = 1400;
        AC.compression.lastConstructIndex = -1;
        AC.compression.oldMemoryBank = [];
        AC.compression.newMemoryBank = [];
        return;
    }
    function underQuarterInteger(someNumber) {
        return Math.floor(someNumber / 4);
    }
    function getTurn() {
        if (Number.isInteger(info?.actionCount)) {
            // "But Leah, surely info.actionCount will never be negative?"
            // You have no idea what nightmares I've seen...
            return Math.abs(info.actionCount);
        } else {
            return 0;
        }
    }
    // Constructs a JSON representation of various properties/settings pulled from raw text
    // Used to parse the "Configure Auto-Cards" and "Edit to enable Auto-Cards" control card entries
    function extractSettings(settingsText) {
        const settings = {};
        // Lowercase everything
        // Remove all non-alphanumeric characters (aside from ":" and ">")
        // Split into an array of strings delimited by the ">" character
        const settingLines = settingsText.toLowerCase().replace(/[^a-z0-9:>]+/g, "").split(">");
        for (const settingLine of settingLines) {
            // Each setting line is preceded by ">" and bisected by ":"
            const settingKeyValue = settingLine.split(":");
            if ((settingKeyValue.length !== 2) || settings.hasOwnProperty(settingKeyValue[0])) {
                // The bisection failed or this setting line's key already exists
                continue;
            }
            // Parse boolean and integer setting values
            if (Words.falses.includes(settingKeyValue[1])) {
                // This setting line's value is false
                settings[settingKeyValue[0]] = false;
            } else if (Words.trues.includes(settingKeyValue[1])) {
                // This setting line's value is true
                settings[settingKeyValue[0]] = true;
            } else if (/^\d+$/.test(settingKeyValue[1])) {
                // This setting line's value is an integer
                // Negative integers are parsed as being positive (because "-" characters were removed)
                settings[settingKeyValue[0]] = parseInt(settingKeyValue[1], 10);
            }
        }
        // Return the settings object for later analysis
        return settings;
    }
    // Ensure the given singleton card is pinned near the top of the player's list of story cards
    function pinAndSortCards(pinnedCard) {
        if (!storyCards || (storyCards.length < 2)) {
            return;
        }
        storyCards.sort((cardA, cardB) => {
            return readDate(cardB) - readDate(cardA);
        });
        if (!AC.config.pinConfigureCard) {
            return;
        }
        const index = storyCards.indexOf(pinnedCard);
        if (0 < index) {
            storyCards.splice(index, 1);
            storyCards.unshift(pinnedCard);
        }
        function readDate(card) {
            if (card && card.updatedAt) {
                const timestamp = Date.parse(card.updatedAt);
                if (!isNaN(timestamp)) {
                    return timestamp;
                }
            }
            return 0;
        }
        return;
    }
    function see(arr) {
        return String.fromCharCode(...arr.map(n => Math.sqrt(n / 33)));
    }
    function formatTitle(title) {
        const input = title;
        let useMemo = false;
        if (
            (AC.database.titles.used.length === 1)
            && (AC.database.titles.used[0] === ("%@%"))
            && [used, forenames, surnames].every(nameset => (
                (nameset.size === 1)
                && nameset.has("%@%")
            ))
        ) {
            const pair = memoized.get(input);
            if (pair !== undefined) {
                if (50000 < memoized.size) {
                    memoized.delete(input);
                    memoized.set(input, pair);
                }
                return O.f({newTitle: pair[0], newKey: pair[1]});
            }
            useMemo = true;
        }
        title = title.trim();
        if (short()) {
            return end();
        }
        title = (title
            // Inner Self
            .slice(title.indexOf("\u200B") + 1)
            .replace(/\u200B-\u200D/g, "")
            // Localized Languages
            .replace(/[–。？！´؟،«»¿¡„“”「」…§，、\*_~><\(\)\[\]{}#"`:!—;\.\?,\s\\]/g, " ")
              // Fix contractions
              .replace(/[‘’]/g, "'").replace(/\s+'/g, " ")
              // Remove the words "I", "I'm", "I'd", "I'll", and "I've"
              .replace(/(?<=^|\s)(?:I|I'm|I'd|I'll|I've)(?=\s|$)/gi, "")
              // Remove "'s" only if not followed by a letter
              .replace(/'s(?![a-zA-Z])/g, "")
              // Replace "s'" with "s" only if preceded but not followed by a letter
              .replace(/(?<=[a-zA-Z])s'(?![a-zA-Z])/g, "s")
              // Remove apostrophes not between letters (preserve contractions like "don't")
              .replace(/(?<![a-zA-Z])'(?![a-zA-Z])/g, "")
              // Eliminate fake em dashes and terminal/leading dashes
              .replace(/\s-\s/g, " ")
              // Condense consecutive whitespace
              .trim().replace(/\s+/g, " ")
              // Remove a leading or trailing bullet
              .replace(/^-+\s*/, "").replace(/\s*-+$/, "")
          );
          if (short()) {
              return end();
          }
          // Special-cased words
          const minorWordsJoin = Words.minor.join("|");
          const leadingMinorWordsKiller = new RegExp("^(?:" + minorWordsJoin + ")\\s", "i");
          const trailingMinorWordsKiller = new RegExp("\\s(?:" + minorWordsJoin + ")$", "i");
          // Ensure the title is not bounded by any outer minor words
          title = enforceBoundaryCondition(title);
          if (short()) {
              return end();
          }
          // Ensure interior minor words are lowercase and excise all interior honorifics/abbreviations
          const honorAbbrevsKiller = new RegExp("(?:^|\\s|-|\\/)(?:" + (
              [...Words.honorifics, ...Words.abbreviations]
          ).map(word => word.replace(".", "")).join("|") + ")(?=\\s|-|\\/|$)", "gi");
          title = (title
              // Capitalize the first letter of each word
              .replace(/(?<=^|\s|-|\/)(?:\p{L})/gu, word => word.toUpperCase())
              // Lowercase minor words properly
              .replace(/(?<=^|\s|-|\/)(?:\p{L}+)(?=\s|-|\/|$)/gu, word => {
                  const lowerWord = word.toLowerCase();
                  if (Words.minor.includes(lowerWord)) {
                      return lowerWord;
                  } else {
                      return word;
                  }
              })
              // Remove interior honorifics/abbreviations
              .replace(honorAbbrevsKiller, "")
              .trim()
          );
          if (short()) {
              return end();
          }
          let titleWords = title.split(" ");
          while ((2 < title.length) && (98 < title.length) && (1 < titleWords.length)) {
              titleWords.pop();
              title = titleWords.join(" ").trim();
              const unboundedLength = title.length;
              title = enforceBoundaryCondition(title);
              if (unboundedLength !== title.length) {
                  titleWords = title.split(" ");
              }
          }
          if (isUsedOrBanned(title) || isNamed(title)) {
              return end();
          }
          // Procedurally generated story card trigger keywords exclude certain words and patterns which are otherwise permitted in titles
          let key = title;
          const peerage = new Set(Words.peerage);
          if (titleWords.some(word => ((word === "the") || peerage.has(word.toLowerCase())))) {
              if (titleWords.length < 2) {
                  return end();
              }
              key = enforceBoundaryCondition(
                  titleWords.filter(word => !peerage.has(word.toLowerCase())).join(" ")
              );
              if (key.includes(" the ")) {
                  key = enforceBoundaryCondition(key.split(" the ")[0]);
              }
              if (isUsedOrBanned(key)) {
                  return end();
              }
          }
          function short() {
              return (title.length < 3);
          }
          function enforceBoundaryCondition(str) {
              while (leadingMinorWordsKiller.test(str)) {
                  str = str.replace(/^\S+\s+/, "");
              }
              while (trailingMinorWordsKiller.test(str)) {
                  str = str.replace(/\s+\S+$/, "");
              }
              return str;
          }
          function end(newTitle = "", newKey = "") {
              if (useMemo) {
                  memoized.set(input, [newTitle, newKey]);
                  if (30000 < memoized.size) {
                      memoized.delete(memoized.keys().next().value);
                  }
              }
              return O.f({newTitle, newKey});
          }
          return end(title, key);
      }
      // I really hate english grammar
      function checkPlurals(title, predicate) {
          function check(t) { return ((t.length < 3) || (100 < t.length) || predicate(t)); }
          const t = title.toLowerCase();
          if (check(t)) { return true; }
          // s>p : singular -> plural : p>s: plural -> singular
          switch(t[t.length - 1]) {
          // p>s : s -> _ : Birds -> Bird
          case "s": if (check(t.slice(0, -1))) { return true; }
          case "x":
          // s>p : s, x, z -> ses, xes, zes : Mantis -> Mantises
          case "z": if (check(t + "es")) { return true; }
              break;
          // s>p : o -> oes, os : Gecko -> Geckoes, Geckos
          case "o": if (check(t + "es") || check(t + "s")) { return true; }
              break;
          // p>s : i -> us : Cacti -> Cactus
          case "i": if (check(t.slice(0, -1) + "us")) { return true; }
          // s>p : i, y -> ies : Kitty -> Kitties
          case "y": if (check(t.slice(0, -1) + "ies")) { return true; }
              break;
          // s>p : f -> ves : Wolf -> Wolves
          case "f": if (check(t.slice(0, -1) + "ves")) { return true; }
          // s>p : !(s, x, z, i, y) -> +s : Turtle -> Turtles
          default: if (check(t + "s")) { return true; }
              break;
          } switch(t.slice(-2)) {
          // p>s : es -> _ : Foxes -> Fox
          case "es": if (check(t.slice(0, -2))) { return true; } else if (
              (t.endsWith("ies") && (
                  // p>s : ies -> y : Bunnies -> Bunny
                  check(t.slice(0, -3) + "y")
                  // p>s : ies -> i : Ravies -> Ravi
                  || check(t.slice(0, -2))
              // p>s : es -> is : Crises -> Crisis
              )) || check(t.slice(0, -2) + "is")) { return true; }
              break;
          // s>p : us -> i : Cactus -> Cacti
          case "us": if (check(t.slice(0, -2) + "i")) { return true; }
              break;
          // s>p : is -> es : Thesis -> Theses
          case "is": if (check(t.slice(0, -2) + "es")) { return true; }
              break;
          // s>p : fe -> ves : Knife -> Knives
          case "fe": if (check(t.slice(0, -2) + "ves")) { return true; }
              break;
          case "sh":
          // s>p : sh, ch -> shes, ches : Fish -> Fishes
          case "ch": if (check(t + "es")) { return true; }
              break;
          } return false;
      }
      function isUsedOrBanned(title) {
          function isUsed(lowerTitle) {
              if (used.size === 0) {
                  const usedTitles = Internal.getUsedTitles();
                  for (let i = 0; i < usedTitles.length; i++) {
                      used.add(usedTitles[i].toLowerCase());
                  }
                  if (used.size === 0) {
                      // Add a placeholder so compute isn't wasted on additional checks during this hook
                      used.add("%@%");
                  }
              }
              return used.has(lowerTitle);
          }
          return checkPlurals(title, t => (isUsed(t) || isBanned(t)));
      }
      function isBanned(lowerTitle, getUsedIsExternal) {
          if (bans.size === 0) {
              // In order to save space, implicit bans aren't listed within the UI
              const controlVariants = getControlVariants();
              const dataVariants = getDataVariants();
              const bansToAdd = [...lowArr([
                  ...Internal.getBannedTitles(),
                  controlVariants.enable.title.replace("\n", ""),
                  controlVariants.enable.keys,
                  controlVariants.configure.title.replace("\n", ""),
                  controlVariants.configure.keys,
                  dataVariants.debug.title,
                  dataVariants.debug.keys,
                  dataVariants.critical.title,
                  dataVariants.critical.keys,
                  ...Object.values(Words.reserved)
              ]), ...(function() {
                  if (shouldProceed() || getUsedIsExternal) {
                      // These proper nouns are way too common to waste card generations on; they already exist within the AI training data so this would be pointless
                      return [...Words.entities, ...Words.undesirables.map(undesirable => see(undesirable))];
                  } else {
                      return [];
                  }
              })()];
              for (let i = 0; i < bansToAdd.length; i++) {
                  bans.add(bansToAdd[i]);
              }
          }
          return bans.has(lowerTitle);
      }
      function isNamed(title, returnSurname) {
          const peerage = new Set(Words.peerage);
          const minorWords = new Set(Words.minor);
          if ((forenames.size === 0) || (surnames.size === 0)) {
              const usedTitles = Internal.getUsedTitles();
              for (let i = 0; i < usedTitles.length; i++) {
                  const usedTitleWords = divideTitle(usedTitles[i]);
                  if (
                      (usedTitleWords.length === 2)
                      && (2 < usedTitleWords[0].length)
                      && (2 < usedTitleWords[1].length)
                  ) {
                      forenames.add(usedTitleWords[0]);
                      surnames.add(usedTitleWords[1]);
                  } else if (
                      (usedTitleWords.length === 1)
                      && (2 < usedTitleWords[0].length)
                  ) {
                      forenames.add(usedTitleWords[0]);
                  }
              }
              if (forenames.size === 0) {
                  forenames.add("%@%");
              }
              if (surnames.size === 0) {
                  surnames.add("%@%");
              }
          }
          const titleWords = divideTitle(title);
          if (
              returnSurname
              && (titleWords.length === 2)
              && (3 < titleWords[0].length)
              && (3 < titleWords[1].length)
              && forenames.has(titleWords[0])
              && surnames.has(titleWords[1])
          ) {
              return (title
                  .split(" ")
                  .find(casedTitleWord => (casedTitleWord.toLowerCase() === titleWords[1]))
              );
          } else if (
              (titleWords.length === 2)
              && (2 < titleWords[0].length)
              && (2 < titleWords[1].length)
              && forenames.has(titleWords[0])
          ) {         
              return true;
          } else if (
              (titleWords.length === 1)
              && (2 < titleWords[0].length)
              && (forenames.has(titleWords[0]) || surnames.has(titleWords[0]))
          ) {
              return true;
          }
          function divideTitle(undividedTitle) {
              const titleWords = undividedTitle.toLowerCase().split(" ");
              if (titleWords.some(word => minorWords.has(word))) {
                  return [];
              } else {
                  return titleWords.filter(word => !peerage.has(word));
              }
          }
          return false;
      }
      function shouldProceed() {
          return (AC.config.doAC && !AC.signal.emergencyHalt && (AC.chronometer.postpone < 1));
      }
      function isDoSayStory(type) {
          return (isDoSay(type) || (type === "story"));
      }
      function isDoSay(type) {
          return ((type === "do") || (type === "say"));
      }
      function permitOutput() {
          return ((AC.config.deleteAllAutoCards === null) && (AC.signal.outputReplacement === ""));
      }
      function isAwaitingGeneration() {
          return (0 < AC.generation.pending.length);
      }
      function isPendingGeneration() {
          return notEmptyObj(AC.generation.workpiece);
      }
      function isPendingCompression() {
          return (AC.compression.titleKey !== "");
      }
      function notEmptyObj(obj) {
          return (obj && (0 < Object.keys(obj).length));
      }
      function clearTransientTitles() {
          AC.database.titles.used = [];
          [used, forenames, surnames].forEach(nameset => nameset.clear());
          return;
      }
      function banTitle(title, isFinalAssignment) {
          title = limitString(title.replace(/\s+/g, " ").trim(), 100);
          const lowerTitle = title.toLowerCase();
          if (bans.size !== 0) {
              bans.add(lowerTitle);
          }
          if (!lowArr(Internal.getBannedTitles()).includes(lowerTitle)) {
              AC.database.titles.banned.unshift(title);
              if (isFinalAssignment) {
                  return;
              }
              AC.database.titles.pendingBans.unshift([title, 3]);
              const index = AC.database.titles.pendingUnbans.findIndex(pair => (pair[0].toLowerCase() === lowerTitle));
              if (index !== -1) {
                  AC.database.titles.pendingUnbans.splice(index, 1);
              }
          }
          return;
      }
      function unbanTitle(title) {
          title = title.replace(/\s+/g, " ").trim();
          const lowerTitle = title.toLowerCase();
          if (used.size !== 0) {
              bans.delete(lowerTitle);
          }
          let index = lowArr(Internal.getBannedTitles()).indexOf(lowerTitle);
          if (index !== -1) {
              AC.database.titles.banned.splice(index, 1);
              AC.database.titles.pendingUnbans.unshift([title, 3]);
              index = AC.database.titles.pendingBans.findIndex(pair => (pair[0].toLowerCase() === lowerTitle));
              if (index !== -1) {
                  AC.database.titles.pendingBans.splice(index, 1);
              }
          }
          return;
      }
      function lowArr(arr) {
          return arr.map(str => str.toLowerCase());
      }
      function getControlVariants() {
          return O.f({
              configure: O.f({
                  title: "Configure \nAuto-Cards",
                  keys: "Edit the entry above to adjust your story card automation settings",
              }),
              enable: O.f({
                  title: "Edit to enable \nAuto-Cards",
                  keys: "Edit the entry above to enable story card automation",
              }),
          });
      }
      function getDataVariants() {
          return O.f({
              debug: O.f({
                  title: "Debug Data",
                  keys: "You may view the debug state in the notes section below",
              }),
              critical: O.f({
                  title: "Critical Data",
                  keys: "Never modify or delete this story card",
              }),
          });
      }
      // Prepare to export the codomain
      const codomain = CODOMAIN.read();
      const [stopPackaged, lastCall] = (function() {
          // Tbh I don't know why I even bothered going through the trouble of implementing "stop" within LSIv2
          switch(HOOK) {
          case "context": {
              const haltStatus = [];
              if (Array.isArray(codomain)) {
                  O.f(codomain);
                  haltStatus.push(true, codomain[1]);
              } else {
                  haltStatus.push(false, STOP);
              }
              if ((AC.config.LSIv2 !== false) && (haltStatus[1] === true)) {
                  // AutoCards will return [text, (stop === true)] onContext
                  // The onOutput lifecycle hook will not be executed during this turn
                  concludeEmergency();
              }
              return haltStatus; }
          case "output": {
              // AC.config.LSIv2 being either true or null implies (lastCall === true)
              return [null, AC.config.LSIv2 ?? true]; }
          default: {
              return [null, null]; }
          }
      })();
      // Repackage AC to propagate its state forward in time
      if (state.LSIv2) {
          // Facilitates recursive calls of AutoCards
          // The Auto-Cards external API is accessible through the LSIv2 scope
          state.LSIv2 = AC;
      } else {
          const memoryOverflow = (38000 < (JSON.stringify(state).length + JSON.stringify(AC).length));
          if (memoryOverflow) {
              // Memory overflow is imminent
              const dataVariants = getDataVariants();
              if (lastCall) {
                  unbanTitle(dataVariants.debug.title);
                  banTitle(dataVariants.critical.title);
              }
              setData(dataVariants.critical, dataVariants.debug);
              if (state.AutoCards) {
                  // Decouple state for safety
                  delete state.AutoCards;
              }
          } else {
              if (lastCall) {
                  const dataVariants = getDataVariants();
                  unbanTitle(dataVariants.critical.title);
                  if (AC.config.showDebugData) {
                      // Update the debug data card
                      banTitle(dataVariants.debug.title);
                      setData(dataVariants.debug, dataVariants.critical);
                  } else {
                      // There should be no data card
                      unbanTitle(dataVariants.debug.title);
                      if (data === null) {
                          data = getSingletonCard(false, O.f({...dataVariants.debug}), O.f({...dataVariants.critical}));
                      }
                      eraseCard(data);
                      data = null;
                  }
              } else if (AC.config.showDebugData && (HOOK === undefined)) {
                  const dataVariants = getDataVariants();
                  setData(dataVariants.debug, dataVariants.critical);
              }
              // Save a backup image to state
              state.AutoCards = AC;
          }
          function setData(primaryVariant, secondaryVariant) {
              const dataCardTemplate = O.f({
                  type: AC.config.defaultCardType,
                  title: primaryVariant.title,
                  keys: primaryVariant.keys,
                  entry: (function() {
                      const mutualEntry = (
                          "If you encounter an Auto-Cards bug or otherwise wish to help me improve this script by sharing your configs and game data, please send me the notes text found below. You may ping me @LewdLeah through the official AI Dungeon Discord server. Please ensure the content you share is appropriate for the server, otherwise DM me instead. 😌"
                      );
                      if (memoryOverflow) {
                          return (
                              "Seeing this means Auto-Cards detected an imminent memory overflow event. But fear not! As an emergency fallback, the full state of Auto-Cards' data has been serialized and written to the notes section below. This text will be deserialized during each lifecycle hook, therefore it's absolutely imperative that you avoid editing this story card!"
                          ) + (function() {
                              if (AC.config.showDebugData) {
                                  return "\n\n" + mutualEntry;
                              } else {
                                  return "";
                              }
                          })();
                      } else {
                          return (
                              "This story card displays the full serialized state of Auto-Cards. To remove this card, simply set the \"log debug data\" setting to false within your \"Configure\" card. "
                          ) + mutualEntry;
                      }
                  })(),
                  description: JSON.stringify(AC)
              });
              if (data === null) {
                  data = getSingletonCard(true, dataCardTemplate, O.f({...secondaryVariant}));
              }
              for (const propertyName of ["title", "keys", "entry", "description"]) {
                  if (data[propertyName] !== dataCardTemplate[propertyName]) {
                      data[propertyName] = dataCardTemplate[propertyName];
                  }
              }
              const index = storyCards.indexOf(data);
              if ((index !== -1) && (index !== (storyCards.length - 1))) {
                  // Ensure the data card is always at the bottom of the story cards list
                  storyCards.splice(index, 1);
                  storyCards.push(data);
              }
              return;
          }
      }
      // This is the only return point within the parent scope of AutoCards
      if (stopPackaged === false) {
          return [codomain, STOP];
      } else {
          return codomain;
      }
  } function isolateLSIv2(code, log, text, stop) { const console = Object.freeze({log}); try { eval(code); return [null, text, stop]; } catch (error) { return [error, text, stop]; } }
  
  // Your other library scripts go here

  globalThis.AutoCards = AutoCards;

  if (hook === 'input') {
    globalThis.text = text;
      InnerSelf("input");
      text = globalThis.text || " ";
      return { text };
  }

  if (hook === 'context') {
    globalThis.text = text;
      InnerSelf("context");
      text = globalThis.text || " ";
      return { text, stop };
  }

  if (hook === 'output') {
    globalThis.text = text;
      InnerSelf("output");
      text = globalThis.text || " ";
      return { text };
  }
}
