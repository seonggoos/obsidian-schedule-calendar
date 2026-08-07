# AGENTS.md — obsidian-schedule-calendar

> **볼트 노트**: `~/Documents/Space/second/Projects/2026-05~ 프로덕트 옵시디언 스케줄 캘린더.md`
> 일정·결정·진행 기록은 볼트에. 여기는 산출물만 둔다.

Obsidian 플러그인 — 데일리 노트의 `### Schedule` 항목을 드래그 가능한 타임라인 캘린더로 렌더.
(폴더·플러그인·레포명은 `obsidian-schedule-calendar`.)
사람용 기능·설치·설정은 `README.md` 참조.

## 핵심
- 데이터 소스 = 데일리 노트의 `### Schedule` 섹션(섹션명은 설정으로 변경 가능). 별도 DB 없음 — 변경은 노트 파일에 즉시 write-back.
- 뷰: 일/주/월. 드래그 이동·리사이즈(15분 스냅), 더블클릭 추가, Cmd/Ctrl+Z(20단계 undo).
- 이벤트 제목의 `#tag` = 색상, `[[wiki link]]` = 노트 점프.
- 빌드 산출물: `main.js` · `manifest.json` · `styles.css`.

## 배포
GitHub 릴리스 + BRAT 베타 채널. Obsidian Community Plugins 등재.
