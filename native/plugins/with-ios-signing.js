// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Pins the Apple development team onto the generated iOS project.
//
// `expo prebuild` regenerates `ios/` from scratch on every device build, and
// the project it writes carries no DEVELOPMENT_TEAM — so a signing team set by
// hand in Xcode (or by an earlier build) is silently discarded, and the next
// build fails with "No profiles for '<bundle id>' were found". Setting it here
// makes the team part of the config the project is generated FROM, so it
// survives every prebuild, including `npx expo prebuild --clean`.
//
// The team comes from APPLE_TEAM_ID in the environment (for a laptop, the
// gitignored native/.env) and is never committed: it names a specific
// developer account, and every contributor to this public repo signs with
// their own. With no team set this mod does nothing, which is what a simulator
// build and every EAS build want.
const { withXcodeProject } = require("expo/config-plugins");

module.exports = function withIosSigning(config, { teamId } = {}) {
  if (!teamId) return config;

  return withXcodeProject(config, (cfg) => {
    const bundleId = cfg.ios && cfg.ios.bundleIdentifier;
    const sections = cfg.modResults.pbxXCBuildConfigurationSection();

    // Only the app target's configurations: the Pods project is a separate
    // .xcodeproj this mod never sees, but the app project also holds
    // project-level configurations that carry no bundle identifier.
    for (const key of Object.keys(sections)) {
      const settings = sections[key] && sections[key].buildSettings;
      if (!settings) continue;
      const id = String(settings.PRODUCT_BUNDLE_IDENTIFIER || "").replace(/"/g, "");
      if (id !== bundleId) continue;
      settings.CODE_SIGN_STYLE = "Automatic";
      settings.DEVELOPMENT_TEAM = teamId;
    }

    return cfg;
  });
};
