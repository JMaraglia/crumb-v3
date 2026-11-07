import { describe, it, expect } from 'vitest';
import { isDueOn, onItinerary, nextVisitDate, addDaysToKey, hiddenByInactive, dayTimeOf, CUSTOMER_DAYS_FIELD } from '../src/schedule';

// Nov 10, 2026 is a Tuesday.
const TUE = '2026-11-10';
const WED = '2026-11-11';

describe('visit schedules', () => {
  it('a Tuesday prospect is due on Tuesday, not Wednesday', () => {
    const p = { deliveryDays: ['Tue'] };
    expect(isDueOn(p, TUE)).toBe(true);
    expect(isDueOn(p, WED)).toBe(false);
  });

  it('customers use their visit days', () => {
    const c = { visitDays: ['Wed'] };
    expect(isDueOn(c, WED, CUSTOMER_DAYS_FIELD)).toBe(true);
    expect(isDueOn(c, TUE, CUSTOMER_DAYS_FIELD)).toBe(false);
  });

  it('every 2 weeks skips the week in between', () => {
    const p = { deliveryDays: ['Tue'], visitFrequency: '2w', visitStart: TUE };
    expect(isDueOn(p, TUE)).toBe(true);
    expect(isDueOn(p, addDaysToKey(TUE, 7))).toBe(false);
    expect(isDueOn(p, addDaysToKey(TUE, 14))).toBe(true);
  });

  it('Saturdays work (PFG works Saturdays)', () => {
    expect(isDueOn({ deliveryDays: ['Sat'] }, '2026-11-14')).toBe(true);
  });

  it('a moved visit leaves its day and shows on the new one', () => {
    const p = { deliveryDays: ['Tue'], visitMoves: { [TUE]: { to: WED, time: 600 } } };
    expect(isDueOn(p, TUE)).toBe(false);
    expect(isDueOn(p, WED)).toBe(true);
  });

  it('a snoozed prospect is not due until the snooze ends', () => {
    const p = { deliveryDays: ['Tue'], snoozeUntil: addDaysToKey(TUE, 1) };
    expect(isDueOn(p, TUE)).toBe(false);
    expect(nextVisitDate(p, TUE)).toBe(addDaysToKey(TUE, 7));
  });

  it('an inactive account is only due on its revisit day', () => {
    const p = { deliveryDays: ['Tue'], inactive: { since: '2026-11-01', revisit: WED } };
    expect(isDueOn(p, TUE)).toBe(false);
    expect(isDueOn(p, WED)).toBe(true);
  });

  it('"Show in itinerary" off keeps it off the Itinerary', () => {
    expect(onItinerary({ deliveryDays: ['Tue'], showInItinerary: false }, TUE)).toBe(false);
  });
});

describe('inactive accounts hide their events and stops', () => {
  it('hides items from the inactive date on, except the revisit day', () => {
    const prospects = [{ id: 7, inactive: { since: '2026-11-05', revisit: '2026-12-01' } }];
    const item = (date) => ({ accountType: 'prospect', accountId: 7, date });
    expect(hiddenByInactive(item('2026-11-04'), [], prospects)).toBe(false);
    expect(hiddenByInactive(item('2026-11-10'), [], prospects)).toBe(true);
    expect(hiddenByInactive(item('2026-12-01'), [], prospects)).toBe(false);
  });
});

describe('a visit time on one day', () => {
  it('locked time beats a moved time, which beats the usual time', () => {
    expect(dayTimeOf('p-1', TUE, 540)).toBe(540);
    localStorage.setItem('crumb_itinerary_times', JSON.stringify({ [TUE]: { 'p-1': 600 } }));
    expect(dayTimeOf('p-1', TUE, 540)).toBe(600);
    localStorage.setItem('crumb_itinerary_locks', JSON.stringify({ [TUE]: { 'p-1': 660 } }));
    expect(dayTimeOf('p-1', TUE, 540)).toBe(660);
  });
});
