// ========================================================
// === World Time Generator + Inner Self - 3.0.0 - output ===
// Paste this ONLY into the output tab in AI Dungeon scripting
// ========================================================

const modifier = (text) => {
  text = worldTimeGenerator('output', text).text;

  text = innerSelf('output', text).text;

  text = revampedHistory('postOutput', text).text;

  return { text };
};
modifier(text);
