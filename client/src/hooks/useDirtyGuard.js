import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  registerDirtyGuard, 
  notifyDirtyStateChanged, 
  showUnsavedChangesModal 
} from '../services/dirtyGuard';

/**
 * Reusable hook for setup screens to track dirty state and guard unsaved changes.
 * 
 * @param {Object} options
 * @param {string} options.screenId - Unique identifier for the screen (e.g. 'school_profile', 'roster')
 * @param {boolean} [options.isDirty] - Optional external boolean controlling dirty state
 * @param {Function} [options.onDiscard] - Callback to revert screen data when changes are discarded
 * @param {Function} [options.onSave] - Async save used by the dialog's Save button; resolves { ok, title?, message? } (same handler as the screen's Save button)
 * @param {any} [options.initialSnapshot] - Baseline snapshot for data comparison
 */
export function useDirtyGuard({
  screenId,
  isDirty: externalIsDirty,
  onDiscard: externalOnDiscard,
  onSave: externalOnSave,
  initialSnapshot = null
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [internalIsDirty, setInternalIsDirty] = useState(false);

  const effectiveIsDirty = externalIsDirty !== undefined ? externalIsDirty : internalIsDirty;

  const isDirtyRef = useRef(effectiveIsDirty);
  isDirtyRef.current = effectiveIsDirty;

  const onDiscardRef = useRef(externalOnDiscard);
  onDiscardRef.current = externalOnDiscard;

  const onSaveRef = useRef(externalOnSave);
  onSaveRef.current = externalOnSave;
  const supportsSave = typeof externalOnSave === 'function';

  useEffect(() => {
    const unregister = registerDirtyGuard(screenId, {
      isDirty: () => isDirtyRef.current,
      onDiscard: () => {
        if (typeof onDiscardRef.current === 'function') {
          try {
            onDiscardRef.current();
          } catch (err) {
            console.warn(`[useDirtyGuard] Error in onDiscard for ${screenId}:`, err);
          }
        }
        setInternalIsDirty(false);
      },
      ...(supportsSave ? { onSave: () => onSaveRef.current() } : {})
    });

    return unregister;
  }, [screenId, supportsSave]);

  useEffect(() => {
    notifyDirtyStateChanged();
  }, [effectiveIsDirty]);

  const markClean = useCallback((newSnapshot = null) => {
    if (newSnapshot !== null) {
      setSnapshot(newSnapshot);
    }
    setInternalIsDirty(false);
    isDirtyRef.current = false;
    notifyDirtyStateChanged();
  }, []);

  const markDirty = useCallback(() => {
    setInternalIsDirty(true);
    isDirtyRef.current = true;
    notifyDirtyStateChanged();
  }, []);

  /**
   * Guards in-screen navigation (e.g., tab switching or personnel switching).
   * Prompts user with SweetAlert modal if dirty.
   * If confirmed discard, runs onDiscard and invokes actionFn.
   */
  const confirmAction = useCallback(async (actionFn, { actionType = 'tab' } = {}) => {
    if (!isDirtyRef.current) {
      if (typeof actionFn === 'function') actionFn();
      return true;
    }

    const outcome = await showUnsavedChangesModal({
      actionType,
      onSave: onSaveRef.current ? () => onSaveRef.current() : undefined
    });
    if (outcome === 'saved') {
      // The save was confirmed by the server inside the dialog; nothing to discard.
      notifyDirtyStateChanged();
      if (typeof actionFn === 'function') actionFn();
      return true;
    }
    if (outcome === 'discard') {
      if (typeof onDiscardRef.current === 'function') {
        try {
          onDiscardRef.current();
        } catch (e) {}
      }
      setInternalIsDirty(false);
      isDirtyRef.current = false;
      notifyDirtyStateChanged();

      if (typeof actionFn === 'function') actionFn();
      return true;
    }

    return false;
  }, []);

  return {
    isDirty: effectiveIsDirty,
    setIsDirty: setInternalIsDirty,
    markClean,
    markDirty,
    snapshot,
    setSnapshot,
    confirmAction
  };
}

// The one shared guard for every editable page (the same hook under its descriptive name).
export const useUnsavedChangesGuard = useDirtyGuard;

export default useDirtyGuard;
