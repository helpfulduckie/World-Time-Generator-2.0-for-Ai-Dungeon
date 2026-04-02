# Quick Start Guide - WTG + AutoCards Combined System

## ✅ What Was Fixed

The previous version had an issue where the AutoCards function wasn't properly appended to library.js. This has been corrected:

- **library.js**: Now 6,675 lines with both WTG functions and AutoCards
- **Input/Context/Output**: Restructured to call functions inline (not nested)
- **Execution Order**: WTG processes first, then passes result to AutoCards

## 📋 Files in Combined System

1. **library.js** (6,675 lines)
   - WTG time management functions (lines 1-670)
   - AutoCards function (lines 676-6675)

2. **input.js** (157 lines)
   - WTG command processing ([settime], [advance], [reset], [sleep])
   - AutoCards input processing

3. **context.js** (76 lines)
   - WTG time tracking and date/time injection
   - AutoCards context modifications

4. **output.js** (102 lines)
   - WTG timestamp injection
   - AutoCards card generation

## 🚀 Installation

### For AI Dungeon

1. Go to your adventure's Scripts section
2. Click on "Shared Library" tab
3. Paste the contents of `library.js` into the Shared Library
4. Click on "Input" tab and paste `input.js`
5. Click on "Context" tab and paste `context.js`
6. Click on "Output" tab and paste `output.js`
7. Save your scripts

## 🎯 First Use

1. Start your adventure (or continue existing one)
2. Use story mode to enter: `[settime 06/15/2023 8:00 AM AD]`
   - For BC dates, use something like `[settime 03/15/44 9:00 AM BC]`
   - If you leave the era off, WTG defaults to AD: `[settime 06/15/2023 8:00 AM]`
3. Configure AutoCards via the "Configure Auto-Cards" storycard that appears

## 📖 Basic Usage

### WTG Commands (in square brackets)

- `[settime 06/15/2023 8:00 AM AD]` - Set starting date, time, and era
- `[settime 03/15/44 9:00 AM BC]` - Example BC starting date
- `[settime 06/15/2023 8:00 AM]` - Same as above, defaults to AD when era is omitted
- `[advance 2 hours]` - Advance time (units: hours, days, months, years)
- `[sleep]` - Sleep to next morning (6-9 hours)
- `[reset]` - Reset to most recent time mentioned in story

### AutoCards

- Automatically creates storycards for characters, locations, etc.
- Configure via "Configure Auto-Cards" storycard
- Toggle on/off, adjust cooldowns, customize generation
- All generated cards will have WTG timestamps!

## 🔧 How It Works

```
Input: User types "[settime 01/15/2024 9:00 AM]"
  ↓
WTG processes command → Sets time state
  ↓
AutoCards processes result → Detects entities
  ↓
Output: Command confirmation + Any AutoCards messages

Context: Story context needed
  ↓
WTG injects time → "Current date: 01/15/2024; Current time: 9:00 AM"
  ↓
AutoCards processes → Adds card-related context
  ↓
AI receives full context with time and cards

Output: AI generates story
  ↓
WTG adds timestamps → All cards get "Discovered on" timestamps
  ↓
AutoCards generates cards → New entities become storycards
  ↓
Final story output with time tracking and cards
```

## 🎨 Features

### From WTG
✅ Automatic time advancement (1 min per 700 characters)
✅ Manual time commands
✅ Timestamp injection on all storycards
✅ Adventure erasing detection
✅ Current Date and Time storycard

### From AutoCards
✅ Automatic character card generation
✅ Automatic location card generation
✅ Memory compression for old information
✅ Configurable generation settings
✅ Manual card management

### Combined Benefits
🌟 Time-aware card generation
🌟 Cards include discovery timestamps
🌟 Enhanced context for AI
🌟 Complete adventure tracking

## ⚠️ Troubleshooting

**"AutoCards is not defined" error**
- Make sure library.js is fully copied to Shared Library
- Verify the file has 6,600+ lines

**Time not advancing**
- Use `[settime]` command first to initialize
- Check "Current Date and Time" storycard

**No cards generating**
- Check AutoCards cooldown setting
- Make sure AutoCards is enabled in configuration

**Cards missing timestamps**
- Ensure WTG time is set (not default 01/01/1900)
- Check that output.js is properly installed

## 📚 More Information

See `Documentation.md` for complete technical details, configuration options, and advanced usage.

## 🆘 Support

If you encounter issues:
1. Verify all 4 files are properly installed
2. Check the line counts match (library.js should be 6,600+ lines)
3. Make sure no syntax errors in copy/paste
4. Try in a new adventure to rule out conflicts

---

**Version**: 1.0.0 Combined (2025-10-03)
**Components**: WTG 2.0 Lightweight + AutoCards
**Status**: ✅ Fully Functional
