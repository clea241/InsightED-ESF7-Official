// SweetAlert2 is loaded on demand (only when the unsaved-changes modal opens) to keep it out of the main bundle.

/**
 * Registry of active screen dirty guards.
 * screenId -> { isDirty: () => boolean | boolean, onDiscard: () => void }
 */
const guards = new Map();

let isBeforeUnloadAttached = false;

const beforeUnloadHandler = (e) => {
  if (isAnyScreenDirty()) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
};

const syncBeforeUnloadListener = () => {
  if (typeof window === 'undefined') return;
  const hasDirty = isAnyScreenDirty();
  if (hasDirty && !isBeforeUnloadAttached) {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    isBeforeUnloadAttached = true;
  } else if (!hasDirty && isBeforeUnloadAttached) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    isBeforeUnloadAttached = false;
  }
};

/**
 * Register a dirty guard for a screen.
 * @param {string} screenId
 * @param {{ isDirty: () => boolean, onDiscard?: () => void }} config
 * @returns {() => void} unregister function
 */
export const registerDirtyGuard = (screenId, config) => {
  if (!screenId || !config) return () => {};
  guards.set(screenId, config);
  syncBeforeUnloadListener();
  return () => {
    guards.delete(screenId);
    syncBeforeUnloadListener();
  };
};

/**
 * Unregister a dirty guard.
 * @param {string} screenId
 */
export const unregisterDirtyGuard = (screenId) => {
  if (!screenId) return;
  guards.delete(screenId);
  syncBeforeUnloadListener();
};

/**
 * Check if any registered screen currently has unsaved changes.
 * @returns {boolean}
 */
export const isAnyScreenDirty = () => {
  for (const [, config] of guards.entries()) {
    try {
      if (typeof config.isDirty === 'function') {
        if (config.isDirty()) return true;
      } else if (config.isDirty) {
        return true;
      }
    } catch (err) {
      console.warn('[dirtyGuard] Error checking isDirty:', err);
    }
  }
  return false;
};

/**
 * Check if a specific screen is dirty.
 * @param {string} screenId
 * @returns {boolean}
 */
export const isScreenDirty = (screenId) => {
  const config = guards.get(screenId);
  if (!config) return false;
  try {
    return typeof config.isDirty === 'function' ? config.isDirty() : Boolean(config.isDirty);
  } catch (err) {
    return false;
  }
};

/**
 * Discard unsaved changes across all registered screens and notify their onDiscard handlers.
 */
export const discardAllDirtyScreens = () => {
  for (const [, config] of guards.entries()) {
    try {
      if (typeof config.onDiscard === 'function') {
        config.onDiscard();
      }
    } catch (err) {
      console.warn('[dirtyGuard] Error running onDiscard:', err);
    }
  }
  syncBeforeUnloadListener();
};

/**
 * Trigger listener synchronization (called when a screen's dirty state changes).
 */
export const notifyDirtyStateChanged = () => {
  syncBeforeUnloadListener();
};

/**
 * Render the SweetAlert2 unsaved changes confirmation modal.
 * @param {{ actionType?: 'navigate' | 'logout' | 'tab' }} options
 * @returns {Promise<boolean>} true if user confirmed "Discard & Leave", false if user chose "Stay & Save"
 */
export const showUnsavedChangesModal = async ({ actionType = 'navigate' } = {}) => {
  const isLogout = actionType === 'logout';
  const isTab = actionType === 'tab';

  const title = 'Unsaved Changes';
  const text = isLogout
    ? 'You have unsaved changes on this screen. If you log out now, your unsaved changes will be lost. Would you like to stay and save them, or discard and log out anyway?'
    : isTab
    ? 'You have unsaved changes in this section. If you switch tabs, your unsaved changes will be lost. Would you like to stay and save them, or discard and switch anyway?'
    : 'You have unsaved changes on this screen that have not been saved to the database. Would you like to stay and save them, or discard and leave anyway?';

  const confirmButtonText = isLogout
    ? 'Discard & Log Out'
    : 'Discard & Leave';

  const [{ default: Swal }] = await Promise.all([
    import('sweetalert2'),
    import('sweetalert2/dist/sweetalert2.min.css')
  ]);

  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    iconColor: '#D97706',
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Stay & Save',
    confirmButtonColor: '#DC2626',
    cancelButtonColor: '#2563EB',
    reverseButtons: true,
    focusCancel: true,
    allowOutsideClick: false,
    allowEscapeKey: false,
    customClass: {
      popup: 'insighted-swal-modal',
      title: 'insighted-swal-title',
      htmlContainer: 'insighted-swal-text',
      confirmButton: 'insighted-swal-discard-btn',
      cancelButton: 'insighted-swal-stay-btn'
    }
  });

  return result.isConfirmed; // true: discard & leave, false: stay & save
};

/**
 * Global navigation / action guard.
 * Call before route changes, tab switches, or logout.
 * If dirty, prompts the SweetAlert modal.
 * If discarded, resets dirty state and returns true.
 * If cancelled, returns false.
 * @param {{ actionType?: 'navigate' | 'logout' | 'tab' }} options
 * @returns {Promise<boolean>}
 */
export const checkBeforeLeave = async ({ actionType = 'navigate' } = {}) => {
  if (!isAnyScreenDirty()) {
    return true;
  }

  const userConfirmedDiscard = await showUnsavedChangesModal({ actionType });
  if (userConfirmedDiscard) {
    discardAllDirtyScreens();
    return true;
  }
  return false;
};
