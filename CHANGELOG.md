# Changelog

## [1.2.2] - 2026-07-13

### Fixed
- Updated `minAppVersion` to `1.8.7` to match the Obsidian APIs used by the plugin
- Added the official `eslint-plugin-obsidianmd` rules and resolved all submission errors and warnings
- Replaced global document access with `activeDocument` for popout window compatibility
- Replaced direct visibility styles with CSS classes
- Made every asynchronous UI callback explicitly handled
- Shortened the command ID so Obsidian can namespace it automatically
- Updated TypeScript, esbuild, and Obsidian API type dependencies

---

## [1.2.1] - 2026-07-13

### Added
- Full Korean and English UI localization based on the current Obsidian language
- English fallback for every other Obsidian language
- Locale-aware navigation, settings, notices, statistics, dates, and accessibility labels

---

## [1.2.0] - 2026-07-13

### Added
- Mobile-friendly **Add event** button with the next 15-minute slot preselected
- One-click daily note creation when the selected date has no note
- Strict time validation with clear feedback for invalid or reversed ranges
- Parser and write-back regression tests, including duplicate events and CRLF notes

### Changed
- All note edits now use Obsidian's atomic `Vault.process()` API
- Undo restores a change only when the note has not been modified elsewhere
- Time fields use native time inputs with 15-minute steps
- The default schedule heading is consistently `### Schedule`

### Fixed
- Editing or deleting one of two identical events no longer affects both entries
- External note edits are no longer overwritten by a stale undo snapshot
- Popup outside-click listeners are cleaned up immediately
- Empty daily note folder settings correctly target the vault root
- Existing CRLF line endings are preserved during write-back

---

## [1.1.0] - 2026-05-19

### Added
- **Drag tooltip** — floating `HH:MM – HH:MM` label follows the cursor during any drag or resize
- **Undo** (`Cmd/Ctrl+Z`) — reverts the last change (drag, resize, edit, delete, add), up to 20 steps
- **Tag colors** — events with `#tag` in their title get a unique accent color on the left border; monthly chips reflect the same colors
- **Daily stats bar** — shows total scheduled time and per-tag time breakdown below the daily timeline
- **Zoom** — `−` / `+` buttons in the header scale the timeline density (0.75× / 1× / 1.5× / 2×)
- **Top resize** — drag the top edge of an event to adjust its start time (daily view)
- **Note link** (`↗`) — edit popup shows an open button when the event title contains a `[[wiki link]]`

### Changed
- `PX_PER_MIN` is now a dynamic getter driven by zoom level; CSS uses `--dtl-row-h` custom property

---

## [1.0.1] - 2026-05-19

### Fixed
- Plugin ID mismatch (`note-calendar` → `schedule-calendar`) corrected in all files
- Replaced deprecated `builtin-modules` npm package with native `module.builtinModules`
- Removed `detachLeavesOfType` from `onunload` (violates Obsidian plugin guidelines)
- Settings heading now uses `Setting.setHeading()` instead of raw `createEl`

---

## [1.0.0] - 2026-05-19

### Initial release
- Daily, weekly, and monthly views
- 24-hour timeline with drag-to-move and bottom-edge resize (15-minute snaps)
- Double-click empty area to add an event (ghost preview + configurable default duration)
- Click event to edit title and time in a popup; delete from the same popup
- Auto-sync — all changes written back to the daily note file immediately
- Now-line showing current time
- Configurable schedule section name, daily note folder, and default event duration
