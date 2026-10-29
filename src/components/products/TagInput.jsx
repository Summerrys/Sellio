import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

// "#Gluten   free " → "Gluten free": spaces stay inside a tag, a leading # goes.
export const cleanTag = (text) =>
  String(text || '').replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();

// Tags added to a list: cleaned, no repeats (in any letter case), at most MAX_TAGS.
export function addTags(list, texts) {
  const next = Array.isArray(list) ? [...list] : [];
  for (const raw of texts) {
    const tag = cleanTag(raw);
    if (tag && next.length < MAX_TAGS && !next.some((t) => String(t).toLowerCase() === tag.toLowerCase())) next.push(tag);
  }
  return next;
}

// A listing's tags as chips. Type one, then a comma, Enter or Add; × takes one off. What's
// still typed when the box loses focus is added too; draftRef holds it meanwhile, so a Save
// tapped while typing (some phones keep the box focused) adds it as well.
export default function TagInput({ id, value, onChange, draftRef = null }) {
  const tags = Array.isArray(value) ? value.filter((t) => typeof t === 'string' && t) : [];
  const [text, setTextState] = useState('');
  const full = tags.length >= MAX_TAGS;
  const setText = (next) => {
    setTextState(next);
    if (draftRef) draftRef.current = next;
  };
  useEffect(() => () => { if (draftRef) draftRef.current = ''; }, [draftRef]);

  const commit = (texts, rest = '') => {
    const next = addTags(tags, texts);
    if (next.length !== tags.length) onChange(next);
    setText(rest);
  };
  const onType = (e) => {
    const typed = e.target.value;
    if (!typed.includes(',')) { setText(typed); return; }
    const parts = typed.split(',');
    const rest = parts.pop();
    commit(parts, rest);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit([text]);
    } else if (e.key === 'Backspace' && !text && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div>
      <div
        data-testid="tag-input"
        className="flex flex-wrap items-center gap-1.5 min-h-10 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-sm focus-within:ring-1 focus-within:ring-ring"
      >
        {tags.map((tag) => (
          <span key={tag.toLowerCase()} data-testid="tag-chip" className="inline-flex items-center h-7 pl-2.5 rounded-full bg-slate-100 text-slate-700 text-[13px] font-medium">
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              aria-label={`Remove tag ${tag}`}
              className="w-7 h-7 inline-flex items-center justify-center rounded-full text-slate-500 hover:text-slate-800"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        {!full && (
          <input
            id={id}
            value={text}
            onChange={onType}
            onKeyDown={onKeyDown}
            onBlur={() => { if (cleanTag(text)) commit([text]); }}
            placeholder={tags.length ? 'Add another' : 'Add a tag, e.g. halal'}
            enterKeyHint="enter"
            autoComplete="off"
            maxLength={300}
            className="flex-1 min-w-[120px] h-7 bg-transparent px-1 text-base md:text-sm outline-none placeholder:text-muted-foreground"
          />
        )}
        {!full && cleanTag(text) && (
          <button
            type="button"
            // Keeps the typing box focused (the keyboard stays up) while this adds the tag.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit([text])}
            className="h-7 px-3 rounded-full text-white text-[13px] font-semibold"
            style={{ background: 'rgb(var(--color-primary, 59 130 246))' }}
          >
            Add
          </button>
        )}
      </div>
      <p className={cn('text-[11px] mt-1', full ? 'text-amber-700' : 'text-slate-500')}>
        {full ? `That’s ${MAX_TAGS} tags, the most a listing can have.` : `Separate tags with a comma, or tap Add. Up to ${MAX_TAGS}.`}
      </p>
    </div>
  );
}
