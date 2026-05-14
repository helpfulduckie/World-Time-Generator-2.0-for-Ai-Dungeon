// ===========================================================
// ==== World Time Generator + Inner Self - 3.0.4 - output ===
// ===========================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.3
// - RevampedHistory@1.2.2
// - WorldTimeGenerator@3.0.4
// - InnerSelf@1.0.2
// ===========================================================
// Paste this ONLY into the output tab in AI Dungeon scripting
// ===========================================================

const modifier = (text) => {
  DuckieDebug.preOutput(text);

  worldTimeGenerator('preOutput', text);

  // Your modifier scripts that do not depend on Unified Settings can go here

  text = UnifiedSettings.output(text).text;
  text = DuckieDebug.output(text).text;
  text = worldTimeGenerator('output', text).text;
  text = innerSelf('output', text).text;

  // More modifier scripts can go here

  RevampedHistory.postOutput(text);

  return { text };
};
modifier(text);
