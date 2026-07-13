import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutOverlappingEvents } from './overlap.ts';

const event = (id, startMinutes, endMinutes) => ({
  id, title: id, kind: 'timed', completed: false, hasCheckbox: false,
  startMinutes, endMinutes, startHour: 0, startMin: 0, endHour: 0, endMin: 0, raw: '',
});

test('겹치는 일정은 서로 다른 column에 배치한다', () => {
  const placed = layoutOverlappingEvents([event('a', 540, 660), event('b', 570, 600)]);
  assert.deepEqual(placed.map((item) => [item.column, item.columnCount]), [[0, 2], [1, 2]]);
});

test('끝과 시작이 맞닿은 일정은 겹치지 않는다', () => {
  const placed = layoutOverlappingEvents([event('a', 540, 600), event('b', 600, 660)]);
  assert.ok(placed.every((item) => item.columnCount === 1));
});

test('중첩 그룹의 최대 동시 column 수를 공유한다', () => {
  const placed = layoutOverlappingEvents([
    event('a', 540, 720), event('b', 570, 630), event('c', 600, 660),
  ]);
  assert.ok(placed.every((item) => item.columnCount === 3));
});
