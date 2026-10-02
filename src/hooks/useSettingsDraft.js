import { useCallback, useRef, useState } from 'react';
import { useAppReloadGuard } from '@/lib/AppRefreshContext';

// Inputs often hold numbers as strings, while saved settings hold numbers.
function sameDraft(left, right) {
  const serialize = value => JSON.stringify(value, (_key, item) =>
    typeof item === 'number' ? String(item) : item);
  return serialize(left) === serialize(right);
}

export default function useSettingsDraft(scopeKey, initialValue) {
  const [value, setValue] = useState(initialValue);
  const valueRef = useRef(value);
  valueRef.current = value;
  const baselineRef = useRef({ scopeKey, value: initialValue });
  useAppReloadGuard(() => ({ dirty: baselineRef.current.scopeKey === scopeKey && !sameDraft(valueRef.current, baselineRef.current.value) }));

  const applyRemote = useCallback(incoming => {
    const baseline = baselineRef.current;
    // A refetch must not overwrite edits made before or during its request.
    // A tenant switch starts a separate draft.
    if (baseline.scopeKey !== scopeKey || sameDraft(valueRef.current, baseline.value) ||
        sameDraft(valueRef.current, incoming)) {
      baselineRef.current = { scopeKey, value: incoming };
      setValue(incoming);
      return true;
    }
    return false;
  }, [scopeKey]);

  const markSaved = useCallback(saved => {
    // Use the submitted snapshot so edits made while saving remain dirty.
    baselineRef.current = { scopeKey, value: saved };
  }, [scopeKey]);

  return [value, setValue, applyRemote, markSaved];
}
