import { App, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import type TimelinePlugin from './main';
import { t } from './i18n';

export interface TimelineSettings {
  dailyNoteSource: 'auto' | 'manual';
  scheduleSection: string;
  dailyNotePath: string;
  dailyNoteFormat: string;
  defaultDuration: number; // minutes
}

export const DEFAULT_SETTINGS: TimelineSettings = {
  dailyNoteSource: 'auto',
  scheduleSection: 'Schedule',
  dailyNotePath: '30.Calendar/31.Daily/',
  dailyNoteFormat: 'YYYY-MM-DD',
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
      .setName(t('dailyNoteSource'))
      .setDesc(t('dailyNoteSourceDesc'))
      .addDropdown((drop) => drop
        .addOption('auto', t('automatic'))
        .addOption('manual', t('manual'))
        .setValue(this.plugin.settings.dailyNoteSource)
        .onChange(async (value) => {
          this.plugin.settings.dailyNoteSource = value === 'manual' ? 'manual' : 'auto';
          await this.plugin.saveSettings();
          this.display();
        }));

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
          .setPlaceholder(DEFAULT_SETTINGS.dailyNotePath)
          .setValue(this.plugin.settings.dailyNotePath)
          .setDisabled(this.plugin.settings.dailyNoteSource === 'auto')
          .onChange(async (value) => {
            let path = value.trim();
            if (path && !path.endsWith('/')) path += '/';
            this.plugin.settings.dailyNotePath = path ? normalizePath(path) + '/' : '';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('dateFormat'))
      .setDesc(t('dateFormatDesc'))
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.dailyNoteFormat)
        .setValue(this.plugin.settings.dailyNoteFormat)
        .setDisabled(this.plugin.settings.dailyNoteSource === 'auto')
        .onChange(async (value) => {
          this.plugin.settings.dailyNoteFormat = value.trim() || 'YYYY-MM-DD';
          await this.plugin.saveSettings();
        }));
  }
}
