// ============================================================
// ========== World Time Generator - 3.0.4 - context ==========
// ============================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.3
// - RevampedHistory@1.2.2
// - WorldTimeGenerator@3.0.4
// ============================================================
// Paste this ONLY into the context tab in AI Dungeon scripting
// ============================================================

const modifier = (text) => {
  DuckieDebug.preContext(text);

  RevampedHistory.preContext(text);

  worldTimeGenerator('preContext', text);

  // Your modifier scripts that do not depend on Unified Settings can go here

  text = UnifiedSettings.context(text).text;
  text = DuckieDebug.context(text).text;
  text = worldTimeGenerator('context', text).text;

  // More modifier scripts can go here

  return { text };
};
modifier(text);
