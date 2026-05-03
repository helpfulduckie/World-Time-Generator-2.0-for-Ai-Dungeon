// ============================================
// === World Time Generator - 3.0.0 - context ===
// Paste this ONLY into the context tab in AI Dungeon scripting
// ============================================

const modifier = (text) => {
  text = revampedHistory('preContext', text).text;

  text = worldTimeGenerator('context', text).text;

  return { text };
};
modifier(text);
