// file: src/noteStatus.js
// Which notes get a checkbox, and whether one is done.
//   Follow-up: open until ticked (no "done" saved yet = open).
//   Sample:    open only when it was made with a checkbox (done: false). Sample notes from before
//              checkboxes existed have no "done" and count as already done (they were records).
export function noteCat(category) {
  if (!category) return 'General';
  return category.toLowerCase() === 'follow-up' ? 'Follow-up' : category;
}

export function isCheckable(category) {
  const c = noteCat(category);
  return c === 'Follow-up' || c === 'Sample';
}

export function isNoteDone(note) {
  const c = noteCat(note.category);
  if (c === 'Sample') return note.done !== false;
  return Boolean(note.done);
}
