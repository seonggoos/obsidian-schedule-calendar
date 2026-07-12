import test from 'node:test';
import assert from 'node:assert/strict';
import { configureLocale, locale, t } from './i18n.ts';

test('한국어 locale과 변수 치환을 지원한다', () => {
  assert.equal(configureLocale('ko'), 'ko');
  assert.equal(t('eventCount', { count: 3 }), '3개');
});

test('영어 locale과 변수 치환을 지원한다', () => {
  assert.equal(configureLocale('en-US'), 'en');
  assert.equal(t('eventCount', { count: 3 }), '3 events');
});

test('지원하지 않는 언어는 영어로 fallback한다', () => {
  configureLocale('ja');
  assert.equal(locale(), 'en');
  assert.equal(t('today'), 'Today');
});
