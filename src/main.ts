import { Plugin, getLanguage } from 'obsidian';
import { TimelineView, TIMELINE_VIEW_TYPE } from './TimelineView';
import { TimelineSettings, DEFAULT_SETTINGS, TimelineSettingTab } from './settings';
import { configureLocale, t } from './i18n';

export default class TimelinePlugin extends Plugin {
  settings: TimelineSettings = DEFAULT_SETTINGS;

  async onload() {
    configureLocale(getLanguage());
    await this.loadSettings();

    this.registerView(TIMELINE_VIEW_TYPE, (leaf) => new TimelineView(leaf, this));

    this.addRibbonIcon('calendar-days', t('pluginName'), () => { void this.activateView(); });

    this.addCommand({
      id: 'open-calendar',
      name: t('openCommand'),
      callback: () => { void this.activateView(); },
    });

    this.addSettingTab(new TimelineSettingTab(this.app, this));
  }

  onunload() {
    // Obsidian handles leaf cleanup on unload
  }

  async loadSettings() {
    const stored = await this.loadData() as unknown;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false)!;
      await leaf.setViewState({ type: TIMELINE_VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
