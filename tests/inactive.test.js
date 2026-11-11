import { describe, it, expect } from 'vitest';
import { isDueOn, hiddenByInactive, reactivatedFields, canceledAhead, addDaysToKey, keyOf } from '../src/schedule';

// Amendment 3.2 (Nov 11, 2026): inactive accounts and their visits / appointments.
const today = keyOf(new Date());
const d = (n) => addDaysToKey(today, n);
const everyDay = { id: 7, name: 'Test Co', deliveryDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], visitFrequency: 'weekly' };

describe('Inactive accounts', () => {
  const inactive = { ...everyDay, inactive: { reason: 'closed', since: d(-5) } };
  it('keeps visits from before it went inactive (history)', () => {
    expect(isDueOn(inactive, d(-10))).toBe(isDueOn(everyDay, d(-10)));
  });
  it('drops visits from the day it went inactive on', () => {
    expect(isDueOn(inactive, d(-5))).toBe(false);
    expect(isDueOn(inactive, d(3))).toBe(false);
  });
  it('shows the revisit day', () => {
    const r = { ...inactive, inactive: { ...inactive.inactive, revisit: d(2) } };
    expect(isDueOn(r, d(2))).toBe(true);
  });

  const ev = (id, n) => ({ id, title: 'Meeting ' + id, date: d(n), start: 600, end: 660, accountType: 'prospect', accountId: 7 });
  const linked = [ev(1, -8), ev(2, -2), ev(3, 4)];
  it('hides linked appointments from the inactive day on, keeps earlier ones', () => {
    expect(hiddenByInactive(linked[0], [], [inactive])).toBe(false);
    expect(hiddenByInactive(linked[1], [], [inactive])).toBe(true);
    expect(hiddenByInactive(linked[2], [], [inactive])).toBe(true);
  });

  it('on Activate: no backdated visits, schedule resumes today, canceled appointments stay off', () => {
    const back = { ...inactive, ...reactivatedFields(inactive, linked, []) };
    expect(back.inactive).toBe(null);
    expect(isDueOn(back, d(-3))).toBe(false); // the inactive period stays empty
    expect(isDueOn(back, d(-10))).toBe(true); // history before it is still there
    expect(isDueOn(back, today)).toBe(true); // resumes
    expect(isDueOn(back, d(5))).toBe(true);
    expect(hiddenByInactive(linked[0], [], [back])).toBe(false);
    expect(hiddenByInactive(linked[1], [], [back])).toBe(true);
    expect(hiddenByInactive(linked[2], [], [back])).toBe(true);
  });

  it('on Activate: the ones still ahead come back only if picked', () => {
    const ahead = canceledAhead(inactive, linked);
    expect(ahead.map((x) => x.id)).toEqual([3]);
    const back = { ...inactive, ...reactivatedFields(inactive, linked, ['e:3']) };
    expect(hiddenByInactive(linked[2], [], [back])).toBe(false);
    expect(hiddenByInactive(linked[1], [], [back])).toBe(true);
  });

  it('a new appointment made after activating shows', () => {
    const back = { ...inactive, ...reactivatedFields(inactive, linked, []) };
    expect(hiddenByInactive(ev(9, 6), [], [back])).toBe(false);
  });
});
