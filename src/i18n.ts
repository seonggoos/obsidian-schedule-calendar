export type Locale = 'ko' | 'en';

const messages = {
  en: {
    pluginName: 'Schedule Calendar', openCommand: 'Open Schedule Calendar', today: 'Today',
    day: 'Day', week: 'Week', month: 'Month', noDailyNote: 'Daily note not found',
    createDailyNote: 'Create daily note', addEvent: '+ Add event', title: 'Title',
    newEventTitle: 'New event title', save: 'Save', delete: 'Delete', cancel: 'Cancel', add: 'Add',
    openNote: 'Open {name}', invalidTime: 'Enter a valid time in HH:mm format.',
    reversedTime: 'End time must be later than start time.',
    staleEvent: 'The event changed elsewhere. Refresh and try again.',
    undoConflict: 'The note changed elsewhere, so undo was cancelled.',
    eventCount: '{count} events', totalTime: 'Total {time}', settings: 'Schedule Calendar',
    scheduleSection: 'Schedule section', scheduleSectionDesc: 'Heading to parse in daily notes (for example, Schedule)',
    defaultDuration: 'Default event duration', defaultDurationDesc: 'Duration used when adding a new event',
    dailyNoteFolder: 'Daily note folder', dailyNoteFolderDesc: 'Folder where daily notes are stored',
    minutes: '{count} min', hours: '{count} hr',
  },
  ko: {
    pluginName: '일정 캘린더', openCommand: '일정 캘린더 열기', today: '오늘',
    day: '일', week: '주', month: '월', noDailyNote: '데일리 노트 없음',
    createDailyNote: '데일리 노트 만들기', addEvent: '+ 일정 추가', title: '제목',
    newEventTitle: '새 일정 제목', save: '저장', delete: '삭제', cancel: '취소', add: '추가',
    openNote: '{name} 열기', invalidTime: '시간을 HH:mm 형식으로 입력해주세요.',
    reversedTime: '종료 시간은 시작 시간보다 늦어야 해요.',
    staleEvent: '일정이 외부에서 변경됐어요. 새로고침 후 다시 시도해주세요.',
    undoConflict: '노트가 다른 곳에서 변경되어 실행 취소하지 않았어요.',
    eventCount: '{count}개', totalTime: '총 {time}', settings: '일정 캘린더',
    scheduleSection: '일정 섹션', scheduleSectionDesc: '데일리 노트에서 파싱할 섹션 이름 (예: Schedule)',
    defaultDuration: '기본 일정 시간', defaultDurationDesc: '새 일정을 추가할 때 사용할 기본 시간',
    dailyNoteFolder: '데일리 노트 폴더', dailyNoteFolderDesc: '데일리 노트가 저장된 폴더 경로',
    minutes: '{count}분', hours: '{count}시간',
  },
} as const;

export type MessageKey = keyof typeof messages.en;
let currentLocale: Locale = 'en';

export function configureLocale(language: string): Locale {
  currentLocale = language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  return currentLocale;
}

export function locale(): Locale { return currentLocale; }

export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  let message: string = messages[currentLocale][key];
  for (const [name, value] of Object.entries(values))
    message = message.split(`{${name}}`).join(String(value));
  return message;
}
