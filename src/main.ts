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

    this.addRibbonIcon('calendar-days', t('pluginName'), () => this.activateView());

    this.addCommand({
      id: 'open-schedule-calendar',
      name: t('openCommand'),
      callback: () => this.activateView(),
    });

    this.addSettingTab(new TimelineSettingTab(this.app, this));
  }

  async onunload() {
    // Obsidian handles leaf cleanup on unload
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
    workspace.revealLeaf(leaf);
  }
}
