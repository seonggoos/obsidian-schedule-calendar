import { ItemView, WorkspaceLeaf, TFile, moment, normalizePath, Notice } from 'obsidian';
import {
  parseSchedules,
  updateEventInContent,
  deleteEventFromContent,
  insertEventIntoContent,
  colorForTag,
  ScheduleEvent,
  pad,
  parseClockTime,
} from './parser';
import type TimelinePlugin from './main';
import { locale, t } from './i18n';

export const TIMELINE_VIEW_TYPE = 'schedule-calendar';
const BASE_PX_PER_MIN = 1.2;
const SNAP_MIN = 15;
const ZOOM_LEVELS = [0.75, 1, 1.5, 2];

type ViewMode = 'daily' | 'weekly' | 'monthly';

export class TimelineView extends ItemView {
  private mode: ViewMode = 'daily';
  private focusDate: moment.Moment = moment();
  private currentFile: TFile | null = null;
  private eventsEl: HTMLElement | null = null;
  private nowLineEls: HTMLElement[] = [];
  private nowInterval: number | null = null;
  private activePopup: HTMLElement | null = null;
  private zoomLevel = 1;
  private undoStack: Array<{ file: TFile; before: string; after: string }> = [];
  private dragTooltipEl: HTMLElement | null = null;
  private popupOutsideHandler: ((e: PointerEvent) => void) | null = null;

  private get pxPerMin() { return BASE_PX_PER_MIN * this.zoomLevel; }

  constructor(leaf: WorkspaceLeaf, private plugin: TimelinePlugin) {
    super(leaf);
  }

  getViewType() { return TIMELINE_VIEW_TYPE; }
  getDisplayText() { return t('pluginName'); }
  getIcon() { return 'calendar-days'; }

  async onOpen() {
    await this.render();
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (this.mode === 'daily' && file === this.currentFile) void this.refreshDailyEvents();
      })
    );
    this.registerDomEvent(activeDocument, 'keydown', (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
        if (this.app.workspace.getActiveViewOfType(TimelineView) === this) {
          e.preventDefault();
          void this.undo();
        }
      }
    });
  }

  async onClose() {
    if (this.nowInterval !== null) window.clearInterval(this.nowInterval);
    this.closePopup();
    this.hideDragTooltip(true);
  }

  private async render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('dtl-root');
    root.style.setProperty('--dtl-row-h', `${this.pxPerMin * 60}px`);
    this.eventsEl = null;
    this.nowLineEls = [];
    if (this.nowInterval !== null) { window.clearInterval(this.nowInterval); this.nowInterval = null; }
    this.closePopup();

    this.renderHeader(root);

    if (this.mode === 'daily') await this.renderDailyView(root);
    else if (this.mode === 'weekly') await this.renderWeeklyView(root);
    else await this.renderMonthlyView(root);
  }

  // ─── Header ────────────────────────────────────────────────────────────────

  private renderHeader(root: HTMLElement) {
    const header = root.createDiv({ cls: 'dtl-header' });

    const nav = header.createDiv({ cls: 'dtl-nav' });
    nav.createEl('button', { cls: 'dtl-nav-btn', text: '‹' })
      .addEventListener('click', () => { this.shiftDate(-1); void this.render(); });
    nav.createSpan({ cls: 'dtl-date', text: this.getDateLabel() });
    nav.createEl('button', { cls: 'dtl-nav-btn', text: '›' })
      .addEventListener('click', () => { this.shiftDate(1); void this.render(); });
    nav.createEl('button', { cls: 'dtl-today-btn', text: t('today') })
      .addEventListener('click', () => { this.focusDate = moment(); void this.render(); });

    if (this.mode !== 'monthly') {
      const zoomCtrl = header.createDiv({ cls: 'dtl-zoom-ctrl' });
      const minusBtn = zoomCtrl.createEl('button', { cls: 'dtl-zoom-btn', text: '−' });
      zoomCtrl.createSpan({ cls: 'dtl-zoom-label', text: `${this.zoomLevel}×` });
      const plusBtn = zoomCtrl.createEl('button', { cls: 'dtl-zoom-btn', text: '+' });

      minusBtn.addEventListener('click', () => {
        const idx = ZOOM_LEVELS.indexOf(this.zoomLevel);
        if (idx > 0) { this.zoomLevel = ZOOM_LEVELS[idx - 1]; void this.render(); }
      });
      plusBtn.addEventListener('click', () => {
        const idx = ZOOM_LEVELS.indexOf(this.zoomLevel);
        if (idx < ZOOM_LEVELS.length - 1) { this.zoomLevel = ZOOM_LEVELS[idx + 1]; void this.render(); }
      });
    }

    const toggle = header.createDiv({ cls: 'dtl-mode-toggle' });
    for (const [m, label] of [['daily', t('day')], ['weekly', t('week')], ['monthly', t('month')]] as [ViewMode, string][]) {
      toggle.createEl('button', {
        cls: 'dtl-mode-btn' + (this.mode === m ? ' active' : ''),
        text: label,
      }).addEventListener('click', () => { this.mode = m; void this.render(); });
    }
  }

  private shiftDate(dir: number) {
    if (this.mode === 'daily') this.focusDate.add(dir, 'day');
    else if (this.mode === 'weekly') this.focusDate.add(dir, 'week');
    else this.focusDate.add(dir, 'month');
  }

  private getDateLabel(): string {
    if (this.mode === 'daily') return this.focusDate.format('YYYY-MM-DD (ddd)');
    if (this.mode === 'weekly') {
      const s = this.focusDate.clone().startOf('isoWeek');
      return `${s.format('MM/DD')} – ${s.clone().add(6, 'days').format('MM/DD')}`;
    }
    return locale() === 'ko' ? this.focusDate.format('YYYY년 MM월') : this.focusDate.format('MMMM YYYY');
  }

  // ─── Daily View ────────────────────────────────────────────────────────────

  private async renderDailyView(root: HTMLElement) {
    this.currentFile = null;
    const dateStr = this.focusDate.format('YYYY-MM-DD');
    const filePath = normalizePath(`${this.plugin.settings.dailyNotePath}${dateStr}.md`);
    const file = this.app.vault.getAbstractFileByPath(filePath);
    const wrap = root.createDiv({ cls: 'dtl-wrap' });

    if (!file || !(file instanceof TFile)) {
      wrap.createDiv({ cls: 'dtl-empty', text: `${t('noDailyNote')}\n${filePath}` });
      const createBtn = wrap.createEl('button', { cls: 'dtl-today-btn', text: t('createDailyNote') });
      createBtn.addEventListener('click', () => { void (async () => {
        const folder = normalizePath(this.plugin.settings.dailyNotePath).replace(/\/$/, '');
        if (folder && !(await this.app.vault.adapter.exists(folder))) {
          await this.app.vault.createFolder(folder);
        }
        await this.app.vault.create(filePath, `### ${this.plugin.settings.scheduleSection}\n`);
        await this.render();
      })(); });
      return;
    }

    this.currentFile = file;
    const content = await this.app.vault.read(file);
    const events = parseSchedules(content, this.plugin.settings.scheduleSection);

    const grid = this.createGrid(wrap);
    this.eventsEl = grid.createDiv({ cls: 'dtl-events' });
    this.renderDailyEvents(this.eventsEl, events, file);

    const addBtn = root.createEl('button', { cls: 'dtl-today-btn', text: t('addEvent') });
    root.insertBefore(addBtn, wrap);
    addBtn.addEventListener('click', (e: MouseEvent) => {
      const now = moment();
      const start = Math.min(1440 - this.plugin.settings.defaultDuration,
        Math.ceil((now.hours() * 60 + now.minutes()) / SNAP_MIN) * SNAP_MIN);
      this.openAddPopup(e.clientX || window.innerWidth / 2, e.clientY || 80,
        start, start + this.plugin.settings.defaultDuration, file);
    });

    this.setupHoverPreview(grid);

    grid.addEventListener('dblclick', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.dtl-event')) return;
      const dur = this.plugin.settings.defaultDuration;
      const y = e.clientY - grid.getBoundingClientRect().top;
      const startMin = Math.max(0, Math.min(1440 - dur, Math.round(y / this.pxPerMin / dur) * dur));
      this.openAddPopup(e.clientX, e.clientY, startMin, startMin + dur, file);
    });

    const nowLine = grid.createDiv({ cls: 'dtl-now-line' });
    this.nowLineEls = [nowLine];
    this.tickNowLines();
    this.nowInterval = window.setInterval(() => this.tickNowLines(), 60000);

    window.requestAnimationFrame(() => {
      const now = moment();
      wrap.scrollTop = Math.max(0, (now.hours() * 60 + now.minutes() - 60) * this.pxPerMin);
    });

    if (events.length > 0) this.renderDailyStats(root, events);
  }

  private renderDailyEvents(container: HTMLElement, events: ScheduleEvent[], file: TFile) {
    container.empty();
    for (const event of events) {
      const el = this.createEventEl(container, event, false);
      this.attachClickPopup(el, event, file);
      this.attachDailyDrag(el, event, file);
    }
  }

  private async refreshDailyEvents() {
    if (!this.currentFile || !this.eventsEl) return;
    const content = await this.app.vault.read(this.currentFile);
    const events = parseSchedules(content, this.plugin.settings.scheduleSection);
    this.renderDailyEvents(this.eventsEl, events, this.currentFile);
  }

  // ─── Weekly View ───────────────────────────────────────────────────────────

  private async renderWeeklyView(root: HTMLElement) {
    const weekStart = this.focusDate.clone().startOf('isoWeek');
    const days = Array.from({ length: 7 }, (_, i) => weekStart.clone().add(i, 'days'));

    const wrap = root.createDiv({ cls: 'dtl-wrap dtl-wrap--weekly' });
    const weekGrid = wrap.createDiv({ cls: 'dtl-week-grid' });

    const headerRow = weekGrid.createDiv({ cls: 'dtl-week-headers' });
    headerRow.createDiv({ cls: 'dtl-week-gutter' });
    for (const day of days) {
      const isToday = day.isSame(moment(), 'day');
      const h = headerRow.createDiv({ cls: 'dtl-week-day-header' + (isToday ? ' today' : '') });
      h.createDiv({ cls: 'dtl-week-day-name', text: day.format('ddd') });
      h.createDiv({ cls: 'dtl-week-day-date', text: day.format('M/D') });
      h.addEventListener('click', () => { this.focusDate = day.clone(); this.mode = 'daily'; void this.render(); });
    }

    const colsWrap = weekGrid.createDiv({ cls: 'dtl-week-cols-wrap' });

    const hourCol = colsWrap.createDiv({ cls: 'dtl-week-hour-col' });
    for (let h = 0; h < 24; h++) {
      hourCol.createDiv({ cls: 'dtl-hour-row' }).createSpan({ cls: 'dtl-hour-label', text: h === 0 ? '' : `${pad(h)}:00` });
    }

    const dayData = await Promise.all(days.map(async (day) => {
      const fp = normalizePath(`${this.plugin.settings.dailyNotePath}${day.format('YYYY-MM-DD')}.md`);
      const f = this.app.vault.getAbstractFileByPath(fp);
      if (!(f instanceof TFile)) return { day, file: null as TFile | null, events: [] as ScheduleEvent[] };
      return { day, file: f, events: parseSchedules(await this.app.vault.read(f), this.plugin.settings.scheduleSection) };
    }));

    for (const { day, file, events } of dayData) {
      const isToday = day.isSame(moment(), 'day');
      const col = colsWrap.createDiv({ cls: 'dtl-week-col' + (isToday ? ' today' : '') });

      for (let h = 0; h < 24; h++) col.createDiv({ cls: 'dtl-hour-row' });
      const eventsEl = col.createDiv({ cls: 'dtl-events' });

      if (file) {
        for (const event of events) {
          const el = this.createEventEl(eventsEl, event, true);
          this.attachClickPopup(el, event, file);
          this.attachWeeklyDrag(el, event, file, col);
        }

        this.setupHoverPreview(col);

        col.addEventListener('dblclick', (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest('.dtl-event')) return;
          const dur = this.plugin.settings.defaultDuration;
          const y = e.clientY - col.getBoundingClientRect().top;
          const startMin = Math.max(0, Math.min(1440 - dur, Math.round(y / this.pxPerMin / dur) * dur));
          this.openAddPopup(e.clientX, e.clientY, startMin, startMin + dur, file);
        });
      }

      if (isToday) {
        const nowLine = col.createDiv({ cls: 'dtl-now-line' });
        this.nowLineEls.push(nowLine);
      }
    }

    this.tickNowLines();
    this.nowInterval = window.setInterval(() => this.tickNowLines(), 60000);

    window.requestAnimationFrame(() => {
      const now = moment();
      colsWrap.scrollTop = Math.max(0, (now.hours() * 60 + now.minutes() - 60) * this.pxPerMin);
    });
  }

  // ─── Monthly View ──────────────────────────────────────────────────────────

  private async renderMonthlyView(root: HTMLElement) {
    const monthStart = this.focusDate.clone().startOf('month');
    const gridStart = monthStart.clone().startOf('isoWeek');
    const gridEnd = this.focusDate.clone().endOf('month').endOf('isoWeek');

    const wrap = root.createDiv({ cls: 'dtl-month-wrap' });

    const dayNames = wrap.createDiv({ cls: 'dtl-month-day-names' });
    const weekdayLabels = locale() === 'ko' ? ['월', '화', '수', '목', '금', '토', '일'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const d of weekdayLabels)
      dayNames.createDiv({ cls: 'dtl-month-day-name', text: d });

    const grid = wrap.createDiv({ cls: 'dtl-month-grid' });

    const dates: moment.Moment[] = [];
    let cur = gridStart.clone();
    while (cur.isSameOrBefore(gridEnd, 'day')) { dates.push(cur.clone()); cur.add(1, 'day'); }

    const eventMap = new Map<string, ScheduleEvent[]>();
    await Promise.all(dates.map(async (day) => {
      const fp = normalizePath(`${this.plugin.settings.dailyNotePath}${day.format('YYYY-MM-DD')}.md`);
      const f = this.app.vault.getAbstractFileByPath(fp);
      eventMap.set(day.format('YYYY-MM-DD'), f instanceof TFile
        ? parseSchedules(await this.app.vault.read(f), this.plugin.settings.scheduleSection)
        : []);
    }));

    for (const day of dates) {
      const dateStr = day.format('YYYY-MM-DD');
      const isCurrentMonth = day.isSame(this.focusDate, 'month');
      const isToday = day.isSame(moment(), 'day');

      const cell = grid.createDiv({
        cls: 'dtl-month-cell' + (isCurrentMonth ? '' : ' dtl-month-cell--out') + (isToday ? ' dtl-month-cell--today' : ''),
      });
      cell.createDiv({ cls: 'dtl-month-cell-day', text: String(day.date()) });

      const events = eventMap.get(dateStr) ?? [];
      const chips = cell.createDiv({ cls: 'dtl-month-chips' });
      for (const ev of events.slice(0, 3)) {
        const chip = chips.createDiv({ cls: 'dtl-month-chip', text: ev.title });
        if (ev.tag) chip.style.borderLeftColor = colorForTag(ev.tag);
      }
      if (events.length > 3)
        chips.createDiv({ cls: 'dtl-month-more', text: `+${events.length - 3}` });

      const capturedDate = day.clone();
      cell.addEventListener('click', () => { this.focusDate = capturedDate; this.mode = 'daily'; void this.render(); });
    }
  }

  // ─── Popup ─────────────────────────────────────────────────────────────────

  private closePopup() {
    if (this.popupOutsideHandler) {
      activeDocument.removeEventListener('pointerdown', this.popupOutsideHandler);
      this.popupOutsideHandler = null;
    }
    this.activePopup?.remove();
    this.activePopup = null;
  }

  private openEditPopup(clientX: number, clientY: number, event: ScheduleEvent, file: TFile) {
    this.closePopup();
    const popup = this.createPopup(clientX, clientY);

    const titleInput = popup.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-title',
      attr: { type: 'text', value: event.title, placeholder: t('title') },
    });

    const timeRow = popup.createDiv({ cls: 'dtl-popup-time-row' });
    const startInput = timeRow.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-time',
      attr: { type: 'time', value: `${pad(event.startHour)}:${pad(event.startMin)}`, step: '900' },
    });
    timeRow.createSpan({ cls: 'dtl-popup-time-sep', text: '–' });
    const endInput = timeRow.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-time',
      attr: { type: 'time', value: `${pad(event.endHour)}:${pad(event.endMin)}`, step: '900' },
    });

    const btnRow = popup.createDiv({ cls: 'dtl-popup-btn-row' });
    const saveBtn = btnRow.createEl('button', { cls: 'dtl-popup-btn dtl-popup-btn--primary', text: t('save') });
    const deleteBtn = btnRow.createEl('button', { cls: 'dtl-popup-btn dtl-popup-btn--danger', text: t('delete') });
    btnRow.createEl('button', { cls: 'dtl-popup-btn', text: t('cancel') })
      .addEventListener('click', () => this.closePopup());

    // Show open-note button when title contains [[wiki link]]
    const wikiMatch = event.title.match(/\[\[([^\]|]+)/);
    if (wikiMatch) {
      const openBtn = btnRow.createEl('button', { cls: 'dtl-popup-btn dtl-popup-btn--link', text: '↗' });
      openBtn.setAttribute('aria-label', t('openNote', { name: wikiMatch[1] }));
      openBtn.addEventListener('click', () => {
        void this.app.workspace.openLinkText(wikiMatch[1], file.path, false);
        this.closePopup();
      });
    }

    const doSave = async () => {
      const title = titleInput.value.trim();
      if (!title) return;
      const start = parseClockTime(startInput.value), end = parseClockTime(endInput.value);
      if (!start || !end) return new Notice(t('invalidTime'));
      const [sh, sm] = start, [eh, em] = end;
      if (eh * 60 + em <= sh * 60 + sm) return new Notice(t('reversedTime'));
      const updated: ScheduleEvent = {
        ...event, title,
        startHour: sh, startMin: sm, endHour: eh, endMin: em,
        startMinutes: sh * 60 + sm, endMinutes: eh * 60 + em,
      };
      const changed = await this.applyFileEdit(file, (content) =>
        updateEventInContent(content, event.raw, updated));
      if (!changed) return new Notice(t('staleEvent'));
      this.closePopup();
      if (this.mode === 'daily') await this.refreshDailyEvents(); else await this.render();
    };

    const doDelete = async () => {
      const changed = await this.applyFileEdit(file, (content) =>
        deleteEventFromContent(content, event.raw, event.sourceLine));
      if (!changed) return new Notice(t('staleEvent'));
      this.closePopup();
      if (this.mode === 'daily') await this.refreshDailyEvents(); else await this.render();
    };

    saveBtn.addEventListener('click', () => { void doSave(); });
    deleteBtn.addEventListener('click', () => { void doDelete(); });
    popup.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); void doSave(); }
      if (e.key === 'Escape') { e.preventDefault(); this.closePopup(); }
    });

    window.requestAnimationFrame(() => { titleInput.focus(); titleInput.select(); });
  }

  private openAddPopup(clientX: number, clientY: number, startMin: number, endMin: number, file: TFile) {
    this.closePopup();
    const popup = this.createPopup(clientX, clientY);

    const titleInput = popup.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-title',
      attr: { type: 'text', placeholder: t('newEventTitle') },
    });

    const timeRow = popup.createDiv({ cls: 'dtl-popup-time-row' });
    const startInput = timeRow.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-time',
      attr: { type: 'time', value: `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`, step: '900' },
    });
    timeRow.createSpan({ cls: 'dtl-popup-time-sep', text: '–' });
    const endInput = timeRow.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-time',
      attr: { type: 'time', value: `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`, step: '900' },
    });

    const btnRow = popup.createDiv({ cls: 'dtl-popup-btn-row' });
    const addBtn = btnRow.createEl('button', { cls: 'dtl-popup-btn dtl-popup-btn--primary', text: t('add') });
    btnRow.createEl('button', { cls: 'dtl-popup-btn', text: t('cancel') })
      .addEventListener('click', () => this.closePopup());

    const doAdd = async () => {
      const title = titleInput.value.trim();
      if (!title) return;
      const start = parseClockTime(startInput.value), end = parseClockTime(endInput.value);
      if (!start || !end) return new Notice(t('invalidTime'));
      const [sh, sm] = start, [eh, em] = end;
      if (eh * 60 + em <= sh * 60 + sm) return new Notice(t('reversedTime'));
      const newEvent: ScheduleEvent = {
        id: `new_${Date.now()}`, title,
        startHour: sh, startMin: sm, endHour: eh, endMin: em,
        startMinutes: sh * 60 + sm, endMinutes: eh * 60 + em, raw: '',
      };
      await this.applyFileEdit(file, (content) =>
        insertEventIntoContent(content, newEvent, this.plugin.settings.scheduleSection));
      this.closePopup();
      if (this.mode === 'daily') await this.refreshDailyEvents(); else await this.render();
    };

    addBtn.addEventListener('click', () => { void doAdd(); });
    popup.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
      if (e.key === 'Escape') { e.preventDefault(); this.closePopup(); }
    });

    window.requestAnimationFrame(() => titleInput.focus());
  }

  private createPopup(clientX: number, clientY: number): HTMLElement {
    const popup = activeDocument.body.createDiv({ cls: 'dtl-popup' });
    this.activePopup = popup;

    popup.addEventListener('pointerdown', (e) => e.stopPropagation());

    window.requestAnimationFrame(() => {
      const w = popup.offsetWidth || 280, h = popup.offsetHeight || 180;
      let left = clientX + 8, top = clientY + 8;
      if (left + w > window.innerWidth - 8) left = clientX - w - 8;
      if (top + h > window.innerHeight - 8) top = clientY - h - 8;
      popup.style.left = `${Math.max(8, left)}px`;
      popup.style.top = `${Math.max(8, top)}px`;
    });

    const outsideHandler = (e: PointerEvent) => {
      if (!popup.contains(e.target as Node)) {
        this.closePopup();
      }
    };
    this.popupOutsideHandler = outsideHandler;
    window.setTimeout(() => activeDocument.addEventListener('pointerdown', outsideHandler), 0);

    return popup;
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  private renderDailyStats(root: HTMLElement, events: ScheduleEvent[]) {
    const statsEl = root.createDiv({ cls: 'dtl-stats' });
    const totalMin = events.reduce((sum, ev) => sum + ev.endMinutes - ev.startMinutes, 0);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;

    const infoEl = statsEl.createDiv({ cls: 'dtl-stats-info' });
    infoEl.createSpan({ cls: 'dtl-stats-count', text: t('eventCount', { count: events.length }) });
    const duration = `${h}h${m > 0 ? ` ${m}m` : ''}`;
    infoEl.createSpan({ cls: 'dtl-stats-total', text: t('totalTime', { time: duration }) });

    const tagMap = new Map<string, number>();
    for (const ev of events) {
      if (ev.tag) tagMap.set(ev.tag, (tagMap.get(ev.tag) || 0) + (ev.endMinutes - ev.startMinutes));
    }

    if (tagMap.size > 0) {
      const tagsEl = statsEl.createDiv({ cls: 'dtl-stats-tags' });
      for (const [tag, min] of tagMap) {
        const chip = tagsEl.createSpan({ cls: 'dtl-stats-chip' });
        chip.style.setProperty('--chip-color', colorForTag(tag));
        const th = Math.floor(min / 60), tm = min % 60;
        chip.textContent = `#${tag} ${th}h${tm > 0 ? ` ${tm}m` : ''}`;
      }
    }
  }

  // ─── Shared helpers ─────────────────────────────────────────────────────────

  private createGrid(parent: HTMLElement): HTMLElement {
    const grid = parent.createDiv({ cls: 'dtl-grid' });
    for (let h = 0; h < 24; h++) {
      grid.createDiv({ cls: 'dtl-hour-row' }).createSpan({ cls: 'dtl-hour-label', text: h === 0 ? '' : `${pad(h)}:00` });
    }
    return grid;
  }

  private createEventEl(container: HTMLElement, event: ScheduleEvent, compact: boolean): HTMLElement {
    const top = event.startMinutes * this.pxPerMin;
    const height = Math.max((event.endMinutes - event.startMinutes) * this.pxPerMin, 24);

    const el = container.createDiv({ cls: 'dtl-event' + (compact ? ' dtl-event--compact' : '') });
    el.style.top = `${top}px`;
    el.style.height = `${height}px`;

    if (event.tag) el.style.borderLeftColor = colorForTag(event.tag);

    if (!compact) el.createDiv({ cls: 'dtl-event-resize-top' });

    if (!compact) {
      el.createDiv({
        cls: 'dtl-event-time',
        text: `${pad(event.startHour)}:${pad(event.startMin)} – ${pad(event.endHour)}:${pad(event.endMin)}`,
      });
    } else if (height >= 36) {
      el.createDiv({
        cls: 'dtl-event-time',
        text: `${pad(event.startHour)}:${pad(event.startMin)}`,
      });
    }
    el.createDiv({ cls: 'dtl-event-title', text: event.title });
    if (!compact) el.createDiv({ cls: 'dtl-event-resize' });

    return el;
  }

  private attachClickPopup(el: HTMLElement, event: ScheduleEvent, file: TFile) {
    let didMove = false;
    el.addEventListener('pointerdown', () => { didMove = false; });
    el.addEventListener('pointermove', () => { didMove = true; });
    el.addEventListener('click', (e: MouseEvent) => {
      if (didMove) return;
      if ((e.target as HTMLElement).closest('.dtl-event-resize, .dtl-event-resize-top')) return;
      e.stopPropagation();
      this.openEditPopup(e.clientX, e.clientY, event, file);
    });
  }

  // ─── Undo ────────────────────────────────────────────────────────────────────

  private async undo() {
    const last = this.undoStack.pop();
    if (!last) return;
    let restored = false;
    await this.app.vault.process(last.file, (current) => {
      if (current !== last.after) return current;
      restored = true;
      return last.before;
    });
    if (!restored) {
      this.undoStack.push(last);
      new Notice(t('undoConflict'));
      return;
    }
    if (this.mode !== 'daily') await this.render();
  }

  private async applyFileEdit(file: TFile, transform: (content: string) => string): Promise<boolean> {
    let before = '', after = '';
    await this.app.vault.process(file, (current) => {
      before = current;
      after = transform(current);
      return after;
    });
    if (before === after) return false;
    this.undoStack.push({ file, before, after });
    if (this.undoStack.length > 20) this.undoStack.shift();
    return true;
  }

  // ─── Drag tooltip ────────────────────────────────────────────────────────────

  private showDragTooltip(clientX: number, clientY: number, text: string) {
    if (!this.dragTooltipEl) {
      this.dragTooltipEl = activeDocument.body.createDiv({ cls: 'dtl-drag-tooltip' });
    }
    this.dragTooltipEl.textContent = text;
    this.dragTooltipEl.removeClass('dtl-hidden');
    this.dragTooltipEl.style.left = `${clientX + 14}px`;
    this.dragTooltipEl.style.top = `${clientY - 28}px`;
  }

  private hideDragTooltip(remove = false) {
    if (!this.dragTooltipEl) return;
    if (remove) {
      this.dragTooltipEl.remove();
      this.dragTooltipEl = null;
    } else {
      this.dragTooltipEl.addClass('dtl-hidden');
    }
  }

  // ─── Daily drag ─────────────────────────────────────────────────────────────

  private attachDailyDrag(el: HTMLElement, event: ScheduleEvent, file: TFile) {
    const resizeHandle = el.querySelector('.dtl-event-resize') as HTMLElement;
    const resizeTopHandle = el.querySelector('.dtl-event-resize-top');
    const duration = event.endMinutes - event.startMinutes;
    let startY = 0, startMin = 0, moved = false;

    const fmt = (s: number, e: number) =>
      `${pad(Math.floor(s / 60))}:${pad(s % 60)} – ${pad(Math.floor(e / 60))}:${pad(e % 60)}`;

    // ── Move drag ──
    const onMoveMove = (e: PointerEvent) => {
      moved = true;
      const snapped = Math.round((e.clientY - startY) / this.pxPerMin / SNAP_MIN) * SNAP_MIN;
      const newStart = Math.max(0, Math.min(1440 - duration, startMin + snapped));
      el.style.top = `${newStart * this.pxPerMin}px`;
      const t = el.querySelector('.dtl-event-time');
      if (t) t.textContent = fmt(newStart, newStart + duration);
      this.showDragTooltip(e.clientX, e.clientY, fmt(newStart, newStart + duration));
    };

    const onMoveUp = (e: PointerEvent) => {
      el.classList.remove('dtl-dragging');
      el.releasePointerCapture(e.pointerId);
      activeDocument.removeEventListener('pointermove', onMoveMove);
      activeDocument.removeEventListener('pointerup', onMoveUp);
      this.hideDragTooltip();
      if (!moved) return;
      const snapped = Math.round((e.clientY - startY) / this.pxPerMin / SNAP_MIN) * SNAP_MIN;
      const newStart = Math.max(0, Math.min(1440 - duration, startMin + snapped));
      if (newStart !== startMin) void this.saveEvent(file, event, newStart, newStart + duration);
    };

    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.dtl-event-resize, .dtl-event-resize-top')) return;
      e.preventDefault();
      moved = false;
      el.classList.add('dtl-dragging');
      el.setPointerCapture(e.pointerId);
      startY = e.clientY;
      startMin = event.startMinutes;
      activeDocument.addEventListener('pointermove', onMoveMove);
      activeDocument.addEventListener('pointerup', onMoveUp);
    });

    // ── Bottom resize (end time) ──
    let resizeStartY = 0, resizeStartEnd = 0;

    const onResizeMove = (e: PointerEvent) => {
      const snapped = Math.round((e.clientY - resizeStartY) / this.pxPerMin / SNAP_MIN) * SNAP_MIN;
      const newEnd = Math.max(event.startMinutes + SNAP_MIN, Math.min(1440, resizeStartEnd + snapped));
      el.style.height = `${Math.max(24, (newEnd - event.startMinutes) * this.pxPerMin)}px`;
      const t = el.querySelector('.dtl-event-time');
      if (t) t.textContent = fmt(event.startMinutes, newEnd);
      this.showDragTooltip(e.clientX, e.clientY, fmt(event.startMinutes, newEnd));
    };

    const onResizeUp = (e: PointerEvent) => {
      resizeHandle.releasePointerCapture(e.pointerId);
      activeDocument.removeEventListener('pointermove', onResizeMove);
      activeDocument.removeEventListener('pointerup', onResizeUp);
      this.hideDragTooltip();
      const snapped = Math.round((e.clientY - resizeStartY) / this.pxPerMin / SNAP_MIN) * SNAP_MIN;
      const newEnd = Math.max(event.startMinutes + SNAP_MIN, Math.min(1440, resizeStartEnd + snapped));
      if (newEnd !== resizeStartEnd) void this.saveEvent(file, event, event.startMinutes, newEnd);
    };

    resizeHandle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      resizeHandle.setPointerCapture(e.pointerId);
      resizeStartY = e.clientY;
      resizeStartEnd = event.endMinutes;
      activeDocument.addEventListener('pointermove', onResizeMove);
      activeDocument.addEventListener('pointerup', onResizeUp);
    });

    // ── Top resize (start time) ──
    if (resizeTopHandle) {
      let topStartY = 0, topOrigStart = 0;

      const onTopResizeMove = (e: PointerEvent) => {
        const snapped = Math.round((e.clientY - topStartY) / this.pxPerMin / SNAP_MIN) * SNAP_MIN;
        const newStart = Math.max(0, Math.min(event.endMinutes - SNAP_MIN, topOrigStart + snapped));
        el.style.top = `${newStart * this.pxPerMin}px`;
        el.style.height = `${Math.max(24, (event.endMinutes - newStart) * this.pxPerMin)}px`;
        const t = el.querySelector('.dtl-event-time');
        if (t) t.textContent = fmt(newStart, event.endMinutes);
        this.showDragTooltip(e.clientX, e.clientY, fmt(newStart, event.endMinutes));
      };

      const onTopResizeUp = (e: PointerEvent) => {
        resizeTopHandle.releasePointerCapture(e.pointerId);
        activeDocument.removeEventListener('pointermove', onTopResizeMove);
        activeDocument.removeEventListener('pointerup', onTopResizeUp);
        this.hideDragTooltip();
        const snapped = Math.round((e.clientY - topStartY) / this.pxPerMin / SNAP_MIN) * SNAP_MIN;
        const newStart = Math.max(0, Math.min(event.endMinutes - SNAP_MIN, topOrigStart + snapped));
        if (newStart !== topOrigStart) void this.saveEvent(file, event, newStart, event.endMinutes);
      };

      resizeTopHandle.addEventListener('pointerdown', (e: PointerEvent) => {
        e.preventDefault(); e.stopPropagation();
        resizeTopHandle.setPointerCapture(e.pointerId);
        topStartY = e.clientY;
        topOrigStart = event.startMinutes;
        activeDocument.addEventListener('pointermove', onTopResizeMove);
        activeDocument.addEventListener('pointerup', onTopResizeUp);
      });
    }
  }

  // ─── Weekly drag (vertical time change only) ─────────────────────────────────

  private attachWeeklyDrag(el: HTMLElement, event: ScheduleEvent, file: TFile, col: HTMLElement) {
    const duration = event.endMinutes - event.startMinutes;
    let grabOffsetPx = 0, moved = false;

    el.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      moved = false;
      grabOffsetPx = e.clientY - el.getBoundingClientRect().top;
      el.classList.add('dtl-dragging');
      el.setPointerCapture(e.pointerId);

      const calcStart = (clientY: number) => {
        const rawTopPx = clientY - col.getBoundingClientRect().top - grabOffsetPx;
        return Math.max(0, Math.min(1440 - duration,
          Math.round(Math.max(0, rawTopPx) / this.pxPerMin / SNAP_MIN) * SNAP_MIN));
      };

      const onMove = (e: PointerEvent) => {
        moved = true;
        const newStart = calcStart(e.clientY);
        el.style.top = `${newStart * this.pxPerMin}px`;
        this.showDragTooltip(e.clientX, e.clientY,
          `${pad(Math.floor(newStart / 60))}:${pad(newStart % 60)} – ${pad(Math.floor((newStart + duration) / 60))}:${pad((newStart + duration) % 60)}`);
      };

      const onUp = (e: PointerEvent) => {
        el.classList.remove('dtl-dragging');
        el.releasePointerCapture(e.pointerId);
        activeDocument.removeEventListener('pointermove', onMove);
        activeDocument.removeEventListener('pointerup', onUp);
        this.hideDragTooltip();
        if (!moved) return;
        const newStart = calcStart(e.clientY);
        if (newStart !== event.startMinutes) {
          void this.saveEvent(file, event, newStart, newStart + duration).then(() => this.render());
        }
      };

      activeDocument.addEventListener('pointermove', onMove);
      activeDocument.addEventListener('pointerup', onUp);
    });
  }

  // ─── Hover preview ghost ──────────────────────────────────────────────────────

  private setupHoverPreview(grid: HTMLElement) {
    const ghost = grid.createDiv({ cls: 'dtl-ghost' });

    grid.addEventListener('mousemove', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.dtl-event')) {
        ghost.addClass('dtl-hidden');
        return;
      }
      const dur = this.plugin.settings.defaultDuration;
      const y = e.clientY - grid.getBoundingClientRect().top;
      const startMin = Math.max(0, Math.min(1440 - dur, Math.round(y / this.pxPerMin / dur) * dur));
      const endMin = startMin + dur;
      ghost.removeClass('dtl-hidden');
      ghost.style.top = `${startMin * this.pxPerMin}px`;
      ghost.style.height = `${dur * this.pxPerMin}px`;
      ghost.textContent = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)} – ${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
    });

    grid.addEventListener('mouseleave', () => { ghost.addClass('dtl-hidden'); });
  }

  // ─── Data ───────────────────────────────────────────────────────────────────

  private async saveEvent(file: TFile, event: ScheduleEvent, newStartMin: number, newEndMin: number) {
    const updated: ScheduleEvent = {
      ...event,
      startMinutes: newStartMin, endMinutes: newEndMin,
      startHour: Math.floor(newStartMin / 60), startMin: newStartMin % 60,
      endHour: Math.floor(newEndMin / 60), endMin: newEndMin % 60,
    };
    const changed = await this.applyFileEdit(file, (content) =>
      updateEventInContent(content, event.raw, updated));
    if (!changed) new Notice(t('staleEvent'));
  }

  private tickNowLines() {
    const now = moment();
    const top = (now.hours() * 60 + now.minutes()) * this.pxPerMin;
    for (const el of this.nowLineEls) el.style.top = `${top}px`;
  }
}
