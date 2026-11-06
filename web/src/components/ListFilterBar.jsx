import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppButton,
  AppFormActions,
  AppPopover,
  AppSelect,
  resolvePopupContainer,
} from '../router-ui';

/**
 * Shared conditional-filter bar for the paginated list surfaces (logs / tasks).
 *
 * Owns the shell that both pages duplicated verbatim: the "add filter" popover
 * (picker option list + draft editor), the active-filter chip row, and the query
 * button. The editor understands four descriptor types — `text`, `select`,
 * `async-select` (a searchable select backed by lazy/remote options), and
 * `time_range` (two datetime-local inputs).
 *
 * It is a controlled shell: the draft's *shape* (value / start / end) is held
 * internally, but every page-specific decision — how a draft is seeded, how it is
 * validated and committed, how a chip summary reads, and how async options load —
 * is delegated back to the caller via callbacks. This keeps Logs' rich behavior
 * (admin async dropdowns, time_range, URL round-trip) and Task's simpler behavior
 * (single-value selects/inputs, page reset) byte-for-byte unchanged.
 *
 * AppFilterHeader renders `{picker}{query}` adjacently, so this whole bar is
 * passed as the single `query` slot; the resulting DOM matches the previous
 * split picker/query markup exactly.
 */
const EMPTY_DRAFT = { value: '', start_timestamp: '', end_timestamp: '' };

function ListFilterBar({
  // Picker
  availableOptions = [], // [{ value, text }] filters not yet active
  visibleFilters = [], // [{ key, label }] active filters (chips)
  getFilterConfig, // (key) => { type, options, placeholder }
  getInitialDraft, // (key) => { value?, start_timestamp?, end_timestamp? }
  onDraftOpen, // (key) => void, optional side-effect (lazy option load)
  // Async select hooks (optional)
  getSelectLoading, // (key) => boolean
  onSelectOpen, // (key, currentValue) => void
  onSelectSearch, // (key, keyword) => void
  // Commit / remove
  onApplyDraft, // (key, draft) => boolean (true closes the draft)
  onRemoveFilter, // (key) => void
  // Chip summary
  renderSummary, // (key) => node
  // Query row
  onQuery,
  queryLoading = false,
  // Clear-all (optional): renders a reset button after the query button when provided
  onClearFilters,
  clearButtonText,
  clearButtonClassName = 'router-section-button',
  clearDisabled = false,
  // Labels & class overrides
  addButtonText,
  addButtonClassName = 'router-section-button',
  queryButtonText,
  queryButtonClassName = 'router-section-button router-log-query-button',
  emptyChipText = '', // when set and no active filters, render a static placeholder chip
  pickerOptionBasic = false,
}) {
  const { t } = useTranslation();
  const [popupOpen, setPopupOpen] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const closeDraft = useCallback(() => {
    setPopupOpen(false);
    setDraftKey('');
    setDraft(EMPTY_DRAFT);
  }, []);

  const openDraft = useCallback(
    (filterKey) => {
      const seed = getInitialDraft ? getInitialDraft(filterKey) : {};
      setDraft({ ...EMPTY_DRAFT, ...(seed || {}) });
      if (onDraftOpen) {
        onDraftOpen(filterKey);
      }
      setDraftKey(filterKey);
      setPopupOpen(true);
    },
    [getInitialDraft, onDraftOpen],
  );

  const applyDraft = useCallback(() => {
    if (draftKey === '') {
      return;
    }
    const applied = onApplyDraft ? onApplyDraft(draftKey, draft) : false;
    if (applied) {
      closeDraft();
    }
  }, [closeDraft, draft, draftKey, onApplyDraft]);

  const draftConfig = draftKey ? getFilterConfig?.(draftKey) : null;
  const draftType = draftConfig?.type || 'text';

  const renderEditor = () => {
    if (draftType === 'time_range') {
      return (
        <div className='router-log-filter-editor-range'>
          <label className='router-log-filter-editor-range-field'>
            <span>{t('log.filters.start_time')}</span>
            <input
              type='datetime-local'
              value={draft.start_timestamp}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  start_timestamp: e.target.value,
                }))
              }
            />
          </label>
          <label className='router-log-filter-editor-range-field'>
            <span>{t('log.filters.end_time')}</span>
            <input
              type='datetime-local'
              value={draft.end_timestamp}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  end_timestamp: e.target.value,
                }))
              }
            />
          </label>
        </div>
      );
    }
    if (draftType === 'select' || draftType === 'async-select') {
      return (
        <AppSelect
          className='router-section-dropdown router-log-filter-select'
          fluid
          search
          clearable
          loading={getSelectLoading ? getSelectLoading(draftKey) : undefined}
          getPopupContainer={resolvePopupContainer}
          options={draftConfig?.options || []}
          value={draft.value}
          onClick={
            onSelectOpen ? () => onSelectOpen(draftKey, draft.value) : undefined
          }
          onSearch={
            onSelectSearch ? (value) => onSelectSearch(draftKey, value) : undefined
          }
          onChange={(e, { value }) =>
            setDraft((prev) => ({
              ...prev,
              value:
                value === null || value === undefined || value === ''
                  ? ''
                  : value,
            }))
          }
        />
      );
    }
    return (
      <input
        className='router-log-filter-editor-input'
        type='text'
        value={draft.value}
        placeholder={draftConfig?.placeholder || ''}
        onChange={(e) =>
          setDraft((prev) => ({ ...prev, value: e.target.value }))
        }
      />
    );
  };

  return (
    <>
      <AppPopover
        open={popupOpen}
        trigger='click'
        placement='bottomLeft'
        onOpenChange={(open) => {
          if (open) {
            setPopupOpen(true);
            return;
          }
          closeDraft();
        }}
        content={
          <div className='router-log-filter-picker'>
            <div className='router-log-filter-picker-options'>
              {availableOptions.map((item) => (
                <AppButton
                  key={item.value}
                  type='button'
                  className='router-inline-button'
                  color={draftKey === item.value ? 'blue' : undefined}
                  basic={
                    pickerOptionBasic ? draftKey !== item.value : undefined
                  }
                  onClick={() => openDraft(item.value)}
                >
                  {item.text}
                </AppButton>
              ))}
            </div>
            {draftKey !== '' && (
              <div className='router-log-filter-editor'>
                <div className='router-log-filter-editor-title'>
                  {draftConfig?.label}
                </div>
                {renderEditor()}
                <AppFormActions className='router-log-filter-editor-actions'>
                  <AppButton
                    type='button'
                    className='router-inline-button'
                    onClick={closeDraft}
                  >
                    {t('common.cancel')}
                  </AppButton>
                  <AppButton
                    type='button'
                    className='router-inline-button'
                    color='blue'
                    onClick={applyDraft}
                  >
                    {t('common.confirm')}
                  </AppButton>
                </AppFormActions>
              </div>
            )}
          </div>
        }
      >
        <AppButton
          type='button'
          className={addButtonClassName}
          disabled={availableOptions.length === 0}
          onClick={() => setPopupOpen(true)}
        >
          {addButtonText}
        </AppButton>
      </AppPopover>
      <div className='router-log-query-box router-log-query-box-inline'>
        <div className='router-log-query-fields'>
          {visibleFilters.length === 0 && emptyChipText ? (
            <div className='router-log-filter-chip router-log-filter-chip-static'>
              <span className='router-log-filter-chip-label'>
                {emptyChipText}
              </span>
            </div>
          ) : (
            visibleFilters.map((item) => (
              <div
                key={item.key}
                className='router-log-filter-chip router-log-filter-chip-static'
              >
                <span className='router-log-filter-chip-label'>
                  {item.label}
                </span>
                <span className='router-log-filter-chip-value'>
                  {renderSummary ? renderSummary(item.key) : null}
                </span>
                <button
                  type='button'
                  className='router-log-filter-chip-remove'
                  onClick={() => onRemoveFilter?.(item.key)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      <AppButton
        type='button'
        className={queryButtonClassName}
        onClick={onQuery}
        loading={queryLoading}
      >
        {queryButtonText}
      </AppButton>
      {onClearFilters ? (
        <AppButton
          type='button'
          className={clearButtonClassName}
          disabled={clearDisabled}
          onClick={onClearFilters}
        >
          {clearButtonText ?? t('common.clear_filters')}
        </AppButton>
      ) : null}
    </>
  );
}

export default ListFilterBar;
