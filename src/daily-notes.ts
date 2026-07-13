import { App, TFile, moment, normalizePath } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getDailyNoteSettings,
} from 'obsidian-daily-notes-interface';
import type { TimelineSettings } from './settings';

export interface ResolvedDailyNoteConfig {
  source: 'core' | 'manual';
  folder: string;
  format: string;
  template?: string;
}

export function manualDailyNotePath(date: moment.Moment, folder: string, format: string): string {
  const normalizedFolder = folder ? `${normalizePath(folder).replace(/\/$/, '')}/` : '';
  return normalizePath(`${normalizedFolder}${date.format(format)}.md`);
}

export class DailyNoteService {
  constructor(private app: App, private settings: TimelineSettings) {}

  resolveConfig(): ResolvedDailyNoteConfig {
    if (this.settings.dailyNoteSource === 'auto' && appHasDailyNotesPluginLoaded()) {
      const core = getDailyNoteSettings();
      return {
        source: 'core',
        folder: core.folder ?? '',
        format: core.format ?? 'YYYY-MM-DD',
        template: core.template || undefined,
      };
    }
    return {
      source: 'manual',
      folder: this.settings.dailyNotePath,
      format: this.settings.dailyNoteFormat,
    };
  }

  resolvePath(date: moment.Moment): string {
    const config = this.resolveConfig();
    return manualDailyNotePath(date, config.folder, config.format);
  }

  find(date: moment.Moment): TFile | null {
    const found = this.app.vault.getAbstractFileByPath(this.resolvePath(date));
    return found instanceof TFile ? found : null;
  }

  async create(date: moment.Moment, sectionName: string): Promise<TFile> {
    const existing = this.find(date);
    if (existing) return existing;

    let file: TFile | undefined;
    if (this.resolveConfig().source === 'core') file = await createDailyNote(date);
    if (!file) {
      const path = this.resolvePath(date);
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (parent && !this.app.vault.getAbstractFileByPath(parent)) await this.createFolders(parent);
      file = await this.app.vault.create(path, '');
    }
    await this.ensureScheduleSection(file, sectionName);
    return file;
  }

  async ensureScheduleSection(file: TFile, sectionName: string): Promise<void> {
    await this.app.vault.process(file, (content) => {
      const heading = `### ${sectionName}`;
      if (content.split(/\r?\n/).some((line) => line.trim() === heading)) return content;
      const eol = content.includes('\r\n') ? '\r\n' : '\n';
      const separator = content.length === 0 || content.endsWith(eol) ? '' : eol;
      return `${content}${separator}${heading}${eol}`;
    });
  }

  private async createFolders(path: string): Promise<void> {
    const parts = normalizePath(path).split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
}
