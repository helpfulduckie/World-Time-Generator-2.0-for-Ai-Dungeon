// ===================================================
// === World Time Generator + LoLa - 3.0.0 - context ===
// Paste this ONLY into the context tab in AI Dungeon scripting
// ===================================================

const modifier = (text) => {
  let stop;
  let result;

  text = revampedHistory('preContext', text).text;

  text = worldTimeGenerator('context', text).text;

  result = loLa('context', text);
  text = result.text;
  stop = stop || result.stop;

  return { text, stop };
};
modifier(text);
