# Releasing

1. Update the same semantic version (`x.y.z`) in `manifest.json`, `package.json`, `package-lock.json`, and `versions.json`.
2. Add release notes to `CHANGELOG.md`.
3. Run `npm run release:check`.
4. Commit and push the default branch.
5. Create a GitHub Release whose tag exactly matches `manifest.json` (no `v` prefix).
6. Attach `main.js`, `manifest.json`, and `styles.css` to the release.

For the initial Community directory submission, sign in at `community.obsidian.md`, link GitHub, choose **Plugins → New plugin**, and submit this repository URL. Later updates are distributed from GitHub Releases automatically.
