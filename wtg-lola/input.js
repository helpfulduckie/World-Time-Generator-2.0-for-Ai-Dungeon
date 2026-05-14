// ==========================================================
// ======= World Time Generator + LoLa - 3.0.4 - input ======
// ==========================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.3
// - RevampedHistory@1.2.2
// - WorldTimeGenerator@3.0.4
// - LoLa@1/20/26
// ==========================================================
// Paste this ONLY into the input tab in AI Dungeon scripting
// ==========================================================

const modifier = (text) => {
  DuckieDebug.preInput(text);

  RevampedHistory.preInput(text);

  worldTimeGenerator('preInput', text);

  // Your modifier scripts that do not depend on Unified Settings can go here

  text = UnifiedSettings.input(text).text;
  text = DuckieDebug.input(text).text;
  text = worldTimeGenerator('input', text).text;
  text = loLa('input', text).text;

  // More modifier scripts can go here

  RevampedHistory.postInput(text);

  return { text };
};
modifier(text);
