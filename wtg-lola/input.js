// =================================================
// === World Time Generator + LoLa - 3.0.0 - input ===
// Paste this ONLY into the input tab in AI Dungeon scripting
// =================================================

const modifier = (text) => {
  text = revampedHistory('preInput', text).text;

  text = worldTimeGenerator('input', text).text;

  text = loLa('input', text).text;

  text = revampedHistory('postInput', text).text;

  return { text };
};
modifier(text);
