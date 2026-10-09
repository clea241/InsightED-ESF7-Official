// Run with: npm run test:unit
// The unsaved-changes dialog: Save runs the screen's own save inside the dialog (preDeny), stays open with the
// error when it fails, and only lets the triggering action continue once the save is confirmed.
import { test, expect, vi, beforeEach } from 'vitest';

const swal = vi.hoisted(() => ({ fire: vi.fn(), showValidationMessage: vi.fn() }));
vi.mock('sweetalert2', () => ({ default: swal }));
vi.mock('sweetalert2/dist/sweetalert2.min.css', () => ({}));

import { registerDirtyGuard, checkBeforeLeave } from '../../src/services/dirtyGuard.js';

let unregister;
beforeEach(() => {
  swal.fire.mockReset();
  swal.showValidationMessage.mockReset();
  if (unregister) unregister();
});

// Simulates the user pressing a button: 'deny' = Save, 'confirm' = Discard, 'cancel' = Stay.
const press = (button) => swal.fire.mockImplementation(async (options) => {
  if (button === 'deny') {
    const value = await options.preDeny();
    return value === false ? { isConfirmed: false, isDenied: false, isDismissed: true } : { isConfirmed: false, isDenied: true, value };
  }
  return { isConfirmed: button === 'confirm', isDenied: false, isDismissed: button === 'cancel' };
});

test('Save: runs the screen save, closes, and lets the action continue without discarding', async () => {
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const onDiscard = vi.fn();
  unregister = registerDirtyGuard('workload', { isDirty: () => true, onSave, onDiscard });
  press('deny');

  expect(await checkBeforeLeave({ actionType: 'navigate' })).toBe(true);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onDiscard).not.toHaveBeenCalled();
  expect(swal.fire.mock.calls[0][0].showDenyButton).toBe(true);
});

test('Save fails (e.g. 422): dialog stays open with the server message, nothing is discarded', async () => {
  const message = 'This teacher has no classes assigned. Set assignments in Personnel Profiling <first>.';
  const onSave = vi.fn().mockResolvedValue({ ok: false, title: 'Some Workloads Were Not Saved', message });
  const onDiscard = vi.fn();
  unregister = registerDirtyGuard('workload', { isDirty: () => true, onSave, onDiscard });
  press('deny');

  expect(await checkBeforeLeave({ actionType: 'navigate' })).toBe(false);
  expect(onDiscard).not.toHaveBeenCalled();
  const shown = swal.showValidationMessage.mock.calls[0][0];
  expect(shown).toContain('This teacher has no classes assigned.');
  expect(shown).toContain('&lt;first&gt;'); // server text is escaped before it is rendered as HTML
});

test('Save throws (e.g. network/502): shown inside the dialog, action does not continue', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error('The server is busy or timed out (HTTP 502).'));
  unregister = registerDirtyGuard('workload', { isDirty: () => true, onSave });
  press('deny');

  expect(await checkBeforeLeave({ actionType: 'tab' })).toBe(false);
  expect(swal.showValidationMessage.mock.calls[0][0]).toContain('HTTP 502');
});

test('Stay: closes and leaves everything untouched', async () => {
  const onSave = vi.fn();
  const onDiscard = vi.fn();
  unregister = registerDirtyGuard('workload', { isDirty: () => true, onSave, onDiscard });
  press('cancel');

  expect(await checkBeforeLeave({ actionType: 'navigate' })).toBe(false);
  expect(onSave).not.toHaveBeenCalled();
  expect(onDiscard).not.toHaveBeenCalled();
});

test('Discard & Leave: discards and continues, as before', async () => {
  const onDiscard = vi.fn();
  unregister = registerDirtyGuard('workload', { isDirty: () => true, onSave: vi.fn(), onDiscard });
  press('confirm');

  expect(await checkBeforeLeave({ actionType: 'logout' })).toBe(true);
  expect(onDiscard).toHaveBeenCalledTimes(1);
});

test('a dirty screen that cannot save gets no Save button', async () => {
  unregister = registerDirtyGuard('roster', { isDirty: () => true, onDiscard: vi.fn() });
  press('cancel');

  await checkBeforeLeave({ actionType: 'navigate' });
  expect(swal.fire.mock.calls[0][0].showDenyButton).toBe(false);
});

test('nothing is shown when nothing is dirty', async () => {
  unregister = registerDirtyGuard('workload', { isDirty: () => false, onSave: vi.fn() });
  expect(await checkBeforeLeave({ actionType: 'navigate' })).toBe(true);
  expect(swal.fire).not.toHaveBeenCalled();
});

import { showWorkloadRestoreModal } from '../../src/services/dirtyGuard.js';

test('restore prompt: shows what differs, keeps the existing button labels, and answers restore / database', async () => {
  swal.fire.mockResolvedValueOnce({ isConfirmed: true, isDenied: false });
  const restore = await showWorkloadRestoreModal({ teacherName: 'Ana <Cruz>', term: '1st', summary: { added: 2, changed: 1, removed: 0, overlapsReplaced: 1 } });
  expect(restore).toBe('restore');
  const options = swal.fire.mock.calls[0][0];
  expect(options.confirmButtonText).toBe('Keep My Changes');
  expect(options.denyButtonText).toBe('Use Database Version');
  expect(options.allowOutsideClick).toBe(false); // nothing is applied until the user answers
  expect(options.html).toContain('2 blocks would be added');
  expect(options.html).toContain('1 block would be changed');
  expect(options.html).toContain('1 saved block overlapping them would be replaced');
  expect(options.html).not.toContain('would be removed'); // zero counts are not listed
  expect(options.html).toContain('Ana &lt;Cruz&gt;'); // names are escaped

  swal.fire.mockResolvedValueOnce({ isConfirmed: false, isDenied: true });
  expect(await showWorkloadRestoreModal({ teacherName: 'Ana', term: '2nd', summary: { added: 1 } })).toBe('database');
});

import { checkBeforeLeaveDetailed, allowNextUnload } from '../../src/services/dirtyGuard.js';

test('two triggers for the same navigation (a click and a browser-back event) share ONE dialog', async () => {
  let release;
  swal.fire.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ isConfirmed: false, isDenied: false, isDismissed: true }); }));
  unregister = registerDirtyGuard('roster', { isDirty: () => true, onSave: vi.fn() });

  const first = checkBeforeLeaveDetailed({ actionType: 'navigate' });
  const second = checkBeforeLeaveDetailed({ actionType: 'navigate' });
  await vi.waitFor(() => expect(swal.fire).toHaveBeenCalledTimes(1)); // the dialog opens after SweetAlert loads
  release();
  expect(await first).toBe('stay');
  expect(await second).toBe('stay');
  expect(swal.fire).toHaveBeenCalledTimes(1);

  // once it is closed, a later navigation asks again
  swal.fire.mockResolvedValueOnce({ isConfirmed: false, isDenied: false, isDismissed: true });
  await checkBeforeLeaveDetailed({ actionType: 'navigate' });
  expect(swal.fire).toHaveBeenCalledTimes(2);
});

test('the detailed answer tells clean, saved, discard and stay apart', async () => {
  unregister = registerDirtyGuard('roster', { isDirty: () => false });
  expect(await checkBeforeLeaveDetailed()).toBe('clean');
  unregister();

  const onDiscard = vi.fn();
  unregister = registerDirtyGuard('roster', { isDirty: () => true, onSave: vi.fn().mockResolvedValue({ ok: true }), onDiscard });
  press('deny');
  expect(await checkBeforeLeaveDetailed()).toBe('saved');
  press('confirm');
  expect(await checkBeforeLeaveDetailed()).toBe('discard');
  expect(onDiscard).toHaveBeenCalledTimes(1);
  press('cancel');
  expect(await checkBeforeLeaveDetailed()).toBe('stay');
});

test('Save runs every dirty screen\'s own save, in order, and stops at the first failure with its message', async () => {
  const calls = [];
  const a = vi.fn(async () => { calls.push('a'); return { ok: true }; });
  const b = vi.fn(async () => { calls.push('b'); return { ok: false, title: 'Designations Not Saved', message: 'Assign all required designations (2 still missing).' }; });
  const c = vi.fn(async () => { calls.push('c'); return { ok: true }; });
  const unA = registerDirtyGuard('roster', { isDirty: () => true, onSave: a });
  const unB = registerDirtyGuard('designations', { isDirty: () => true, onSave: b });
  const unC = registerDirtyGuard('classes', { isDirty: () => true, onSave: c });
  unregister = () => { unA(); unB(); unC(); };
  press('deny');

  expect(await checkBeforeLeaveDetailed()).toBe('stay'); // the dialog stayed open (preDeny returned false), so the user stays
  expect(calls).toEqual(['a', 'b']);
  expect(swal.showValidationMessage.mock.calls[0][0]).toContain('Assign all required designations (2 still missing).');
});

test('a clean screen does not stop Save from being offered for the dirty one', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true });
  const unA = registerDirtyGuard('roster', { isDirty: () => false });
  const unB = registerDirtyGuard('workload', { isDirty: () => true, onSave: save });
  unregister = () => { unA(); unB(); };
  press('cancel');
  await checkBeforeLeaveDetailed();
  expect(swal.fire.mock.calls[0][0].showDenyButton).toBe(true);
});

test('closing the tab or refreshing asks the browser once while dirty, never when clean, and not when the app reloads on purpose', () => {
  const handlers = {};
  globalThis.window = { addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener: (type) => { delete handlers[type]; } };
  try {
    let dirty = true;
    unregister = registerDirtyGuard('roster', { isDirty: () => dirty });
    expect(handlers.beforeunload).toBeTypeOf('function');

    const event = { preventDefault: vi.fn(), returnValue: undefined };
    handlers.beforeunload(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);

    allowNextUnload(); // e.g. "Discard Changes" reloads the page itself
    const silent = { preventDefault: vi.fn(), returnValue: undefined };
    handlers.beforeunload(silent);
    expect(silent.preventDefault).not.toHaveBeenCalled();

    dirty = false;
    unregister();
    unregister = undefined;
    expect(handlers.beforeunload).toBeUndefined(); // no listener when nothing is unsaved
  } finally {
    delete globalThis.window;
  }
});

test('a screen\'s own sub-selection check (teacher / term / tab switch) cannot stack a second dialog on an open one', async () => {
  let release;
  swal.fire.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ isConfirmed: false, isDenied: false, isDismissed: true }); }));
  const { showUnsavedChangesModal } = await import('../../src/services/dirtyGuard.js');
  const first = showUnsavedChangesModal({ actionType: 'tab' });
  const second = showUnsavedChangesModal({ actionType: 'tab' });
  await vi.waitFor(() => expect(swal.fire).toHaveBeenCalledTimes(1));
  release();
  expect(await first).toBe('stay');
  expect(await second).toBe('stay');
  expect(swal.fire).toHaveBeenCalledTimes(1);
});
