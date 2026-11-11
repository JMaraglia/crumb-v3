import { describe, it, expect } from 'vitest';
import { EMPTY_ANSWERS, missingAnswer, answersToSave, passwordProblem, answerLines } from '../src/signupQuestions';

const full = { customers: '0', sales: '$5 Million+', coldCall: 'yes', coldHow: 'both', stops: 'yes', stopsPerDay: '12', crm: 'None' };

describe('Create Account questions', () => {
  it('blank form is not done', () => {
    expect(missingAnswer(EMPTY_ANSWERS)).not.toBe('');
  });
  it('every answer filled is done (0 customers is fine)', () => {
    expect(missingAnswer(full)).toBe('');
  });
  it('cold call Yes needs how; No does not', () => {
    expect(missingAnswer({ ...full, coldHow: '' })).toMatch(/how you cold call/);
    expect(missingAnswer({ ...full, coldCall: 'no', coldHow: '' })).toBe('');
  });
  it('daily stops Yes needs a number above 0', () => {
    expect(missingAnswer({ ...full, stopsPerDay: '' })).toMatch(/stops per day/);
    expect(missingAnswer({ ...full, stopsPerDay: '0' })).toMatch(/stops per day/);
    expect(missingAnswer({ ...full, stops: 'no', stopsPerDay: '' })).toBe('');
  });
  it('CRM is required', () => {
    expect(missingAnswer({ ...full, crm: '  ' })).toMatch(/CRM/);
  });
  it('saves clean values', () => {
    expect(answersToSave({ ...full, coldCall: 'no' })).toEqual({ v: 1, customers: 0, annual_sales: '$5 Million+', cold_call: false, cold_call_how: null, daily_stops: true, stops_per_day: 12, crm: 'None' });
  });
  it('password: 8+ with a letter, a number and a special character', () => {
    expect(passwordProblem('ab1!')).not.toBe('');
    expect(passwordProblem('abcdefgh')).not.toBe('');
    expect(passwordProblem('12345678')).not.toBe('');
    expect(passwordProblem('crumb2026')).not.toBe('');
    expect(passwordProblem('crumb2026!')).toBe('');
  });
  it('admin lines', () => {
    expect(answerLines(answersToSave(full))).toContain('Cold Calls: Yes (Both)');
    expect(answerLines(null)).toEqual([]);
  });
});
