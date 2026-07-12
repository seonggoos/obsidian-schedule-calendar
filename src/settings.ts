import { App, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import type TimelinePlugin from './main';
import { t } from './i18n';

export interface TimelineSettings {
  scheduleSection: string;
  dailyNotePath: string;
  defaultDuration: number; // minutes
}

export const DEFAULT_SETTINGS: TimelineSettings = {
  scheduleSection: 'Schedule',
  dailyNotePath: '30.Calendar/31.Daily/',
  defaultDuration: 30,
};

export class TimelineSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TimelinePlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t('settings')).setHeading();

    new Setting(containerEl)
      .setName(t('scheduleSection'))
      .setDesc(t('scheduleSectionDesc'))
      .addText((text) =>
        text
          .setPlaceholder('Schedule')
          .setValue(this.plugin.settings.scheduleSection)
          .onChange(async (value) => {
            this.plugin.settings.scheduleSection = value.trim() || 'Schedule';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('defaultDuration'))
      .setDesc(t('defaultDurationDesc'))
      .addDropdown((drop) =>
        drop
          .addOption('15', t('minutes', { count: 15 }))
          .addOption('30', t('minutes', { count: 30 }))
          .addOption('60', t('minutes', { count: 60 }))
          .addOption('90', t('minutes', { count: 90 }))
          .addOption('120', t('hours', { count: 2 }))
          .setValue(String(this.plugin.settings.defaultDuration))
          .onChange(async (value) => {
            this.plugin.settings.defaultDuration = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('dailyNoteFolder'))
      .setDesc(t('dailyNoteFolderDesc'))
      .addText((text) =>
        text
          .setPlaceholder('30.Calendar/31.Daily/')
          .setValue(this.plugin.settings.dailyNotePath)
          .onChange(async (value) => {
            let path = value.trim();
            if (path && !path.endsWith('/')) path += '/';
            this.plugin.settings.dailyNotePath = path ? normalizePath(path) + '/' : '';
            await this.plugin.saveSettings();
          })
      );
  }
}
