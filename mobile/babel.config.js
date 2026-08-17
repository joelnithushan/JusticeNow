// JusticeNow (mobile) — Babel config.
// babel-preset-expo already includes the transforms expo-router needs
// (there is no separate "expo-router/babel" plugin from Expo SDK 50 onward).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
