import { App, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import type TimelinePlugin from './main';

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
    new Setting(containerEl).setName('Schedule Calendar').setHeading();

    new Setting(containerEl)
      .setName('Schedule section')
      .setDesc('데일리 노트에서 스케줄을 파싱할 섹션 이름 (예: Schedule)')
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
      .setName('기본 일정 시간')
      .setDesc('더블클릭으로 새 일정 추가 시 기본 시간 단위')
      .addDropdown((drop) =>
        drop
          .addOption('15', '15분')
          .addOption('30', '30분')
          .addOption('60', '60분')
          .addOption('90', '90분')
          .addOption('120', '2시간')
          .setValue(String(this.plugin.settings.defaultDuration))
          .onChange(async (value) => {
            this.plugin.settings.defaultDuration = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Daily note folder')
      .setDesc('데일리 노트가 저장된 폴더 경로')
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
