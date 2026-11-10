// file: src/todoItems.js
// Everything on the To-Do list: your own tasks + Follow-up / Sample notes with a checkbox.
// Shared by the To-Do screen and Wrap Up Today.
import { noteCat, isNoteDone } from './noteStatus';

const hasName = (a) => a && a.name && a.name.trim();

export function collectTodoItems(todos = [], contacts = [], prospects = []) {
  const items = [];
  todos.forEach((t) =>
    items.push({
      key: `t-${t.id}`,
      kind: 'task',
      id: t.id,
      text: t.text,
      due: t.due || null,
      done: Boolean(t.done),
      doneAt: t.doneAt || null,
      accountType: t.accountType || null,
      accountId: t.accountId ?? null,
      accountName: t.accountName || '',
    })
  );
  const collectFollowUps = (list, type) =>
    list.filter(hasName).forEach((acct) =>
      (acct.notes || []).forEach((n, index) => {
        const cat = noteCat(n.category);
        if (cat !== 'Follow-up' && cat !== 'Sample' && cat !== 'Proposal' && cat !== 'Quote') return;
        if (cat === 'Sample' && typeof n.done !== 'boolean') return; // old sample records, not to-dos
        items.push({
          key: `f-${type}-${acct.id}-${index}`,
          kind: 'followup',
          label: cat,
          index,
          noteId: n.id || null, // the note's permanent ID tag (used to find it when changing it)
          text: n.text,
          due: n.due || null,
          done: isNoteDone(n),
          doneAt: n.doneAt || null,
          created: n.timestamp,
          accountType: type,
          accountId: acct.id,
          accountName: acct.name,
        });
      })
    );
  collectFollowUps(contacts, 'customer');
  collectFollowUps(prospects, 'prospect');
  return items;
}
