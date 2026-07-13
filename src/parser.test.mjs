import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteEventFromContent,
  insertEventIntoContent,
  parseSchedules,
  parseClockTime,
  toggleEventCompletion,
  updateEventInContent,
} from "./parser.ts";

const note = `# Daily

### Schedule
- 09:00 - 10:00 Standup #Work
- 13:30 – 14:15 [[Project]] review

### Notes
- keep me`;

test("지정한 Schedule 섹션만 파싱하고 태그를 정규화한다", () => {
  const events = parseSchedules(note);
  assert.equal(events.length, 2);
  assert.equal(events[0].tag, "work");
  assert.equal(events[1].startMinutes, 13 * 60 + 30);
  assert.equal(events[1].title, "[[Project]] review");
});

test("시간 입력은 유효한 24시간 HH:mm만 허용한다", () => {
  assert.deepEqual(parseClockTime("9:05"), [9, 5]);
  assert.deepEqual(parseClockTime("23:59"), [23, 59]);
  for (const invalid of ["", "abc", "9:5", "24:00", "12:60", "-1:00"])
    assert.equal(parseClockTime(invalid), null);
});

test("잘못됐거나 역순인 일정은 파싱하지 않는다", () => {
  const content = `### Schedule\n- 25:00 - 26:00 Invalid\n- 14:00 - 13:00 Reverse\n- 09:00 - 10:00 Valid`;
  assert.deepEqual(parseSchedules(content).map((event) => event.title), ["Valid"]);
});

test("CRLF 줄바꿈을 수정·삽입 후에도 보존한다", () => {
  const content = "### Schedule\r\n- 09:00 - 10:00 Focus\r\n### Notes\r\nKeep";
  const [event] = parseSchedules(content);
  const updated = updateEventInContent(content, event.raw, { ...event, title: "Changed" });
  assert.ok(updated.includes("Changed\r\n### Notes"));
  assert.equal(updated.replaceAll("\r\n", "").includes("\n"), false);
});

test("사용자 지정 섹션명을 지원한다", () => {
  assert.equal(parseSchedules("### Plan\n- 08:00 - 09:00 Focus", "Plan").length, 1);
});

test("새 이벤트를 시작 시간 순서로 삽입하고 다른 섹션을 보존한다", () => {
  const event = {
    id: "new", title: "Lunch", startHour: 11, startMin: 0,
    endHour: 12, endMin: 0, startMinutes: 660, endMinutes: 720, raw: "",
  };
  const updated = insertEventIntoContent(note, event);
  assert.ok(updated.indexOf("Standup") < updated.indexOf("Lunch"));
  assert.ok(updated.indexOf("Lunch") < updated.indexOf("[[Project]]"));
  assert.ok(updated.includes("### Notes\n- keep me"));
});

test("섹션이 없으면 생성한다", () => {
  const event = {
    id: "new", title: "Focus", startHour: 8, startMin: 5,
    endHour: 9, endMin: 0, startMinutes: 485, endMinutes: 540, raw: "",
  };
  assert.match(insertEventIntoContent("# Daily", event), /### Schedule\n- 08:05 - 09:00 Focus/);
});

test("수정 시 대상 한 줄만 바꾸고 주변 원문을 보존한다", () => {
  const [event] = parseSchedules(note);
  const updated = updateEventInContent(note, event.raw, { ...event, title: "Changed" });
  assert.ok(updated.includes("- 09:00 - 10:00 Changed"));
  assert.ok(updated.includes("### Notes\n- keep me"));
});

test("삭제 시 대상 일정만 제거한다", () => {
  const [event] = parseSchedules(note);
  const updated = deleteEventFromContent(note, event.raw);
  assert.ok(!updated.includes("Standup"));
  assert.ok(updated.includes("[[Project]] review"));
});

test("내용이 같은 일정 두 개 중 선택한 한 줄만 삭제한다", () => {
  const duplicate = `### Schedule\n- 09:00 - 10:00 Same\n- 09:00 - 10:00 Same`;
  const events = parseSchedules(duplicate);
  const updated = deleteEventFromContent(duplicate, events[1].raw, events[1].sourceLine);
  assert.equal(parseSchedules(updated).length, 1);
});

test("내용이 같은 일정 두 개 중 선택한 한 줄만 수정한다", () => {
  const duplicate = `### Schedule\n- 09:00 - 10:00 Same\n- 09:00 - 10:00 Same`;
  const events = parseSchedules(duplicate);
  const updated = updateEventInContent(duplicate, events[1].raw, {
    ...events[1], title: "Changed",
  });
  assert.equal(parseSchedules(updated).filter((event) => event.title === "Same").length, 1);
  assert.equal(parseSchedules(updated).filter((event) => event.title === "Changed").length, 1);
});

test("체크박스가 있는 시간 일정을 완료 상태와 함께 파싱한다", () => {
  const content = `### Schedule\n- [ ] 09:00 - 10:00 Open\n- [x] 10:00 - 11:00 Done`;
  const events = parseSchedules(content);
  assert.deepEqual(events.map(({ kind, completed, hasCheckbox }) => ({ kind, completed, hasCheckbox })), [
    { kind: "timed", completed: false, hasCheckbox: true },
    { kind: "timed", completed: true, hasCheckbox: true },
  ]);
});

test("시간이 없는 체크박스 항목을 종일 일정으로 파싱한다", () => {
  const [event] = parseSchedules(`### Schedule\n- [ ] Conference #Work`);
  assert.equal(event.kind, "all-day");
  assert.equal(event.title, "Conference #Work");
  assert.equal(event.tag, "work");
});

test("완료 토글은 대상 한 줄만 바꾸고 다시 되돌릴 수 있다", () => {
  const content = `### Schedule\n- 09:00 - 10:00 Focus\n- 11:00 - 12:00 Keep`;
  const [event] = parseSchedules(content);
  const completed = toggleEventCompletion(content, event);
  assert.ok(completed.includes("- [x] 09:00 - 10:00 Focus"));
  assert.ok(completed.includes("- 11:00 - 12:00 Keep"));
  const [completedEvent] = parseSchedules(completed);
  assert.equal(toggleEventCompletion(completed, completedEvent),
    `### Schedule\n- [ ] 09:00 - 10:00 Focus\n- 11:00 - 12:00 Keep`);
});

test("기존 비체크박스 일정은 편집해도 기존 문법을 보존한다", () => {
  const [event] = parseSchedules(`### Schedule\n- 09:00 - 10:00 Legacy`);
  const updated = updateEventInContent(`### Schedule\n- 09:00 - 10:00 Legacy`, event.raw, {
    ...event,
    title: "Updated",
  });
  assert.equal(updated, `### Schedule\n- 09:00 - 10:00 Updated`);
});

test("종일 일정은 시간 일정 앞에 삽입한다", () => {
  const content = `### Schedule\n- 09:00 - 10:00 Focus`;
  const allDay = {
    id: "all-day", title: "Holiday", kind: "all-day", completed: false, hasCheckbox: true,
    startHour: 0, startMin: 0, endHour: 0, endMin: 0, startMinutes: 0, endMinutes: 0, raw: "",
  };
  assert.equal(insertEventIntoContent(content, allDay), `### Schedule\n- [ ] Holiday\n- 09:00 - 10:00 Focus`);
});
