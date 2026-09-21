import { describe, expect, it } from 'vitest'
import { isBoldShortcut, isEditableTarget, isUndoShortcut } from './textInputKeys'

/** Minimal stand-in for the fields `isBoldShortcut`/`isUndoShortcut` actually read — a full
 *  `KeyboardEvent` needs a DOM, which these pure-logic specs (see dockPhysics.spec.ts /
 *  wheelIntent.spec.ts) deliberately don't stand up. */
function key(overrides: Partial<Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>>): KeyboardEvent {
  return { key: 'b', metaKey: false, ctrlKey: false, shiftKey: false, ...overrides } as KeyboardEvent
}

describe('isBoldShortcut', () => {
  it('fires on Cmd+B (macOS)', () => {
    expect(isBoldShortcut(key({ key: 'b', metaKey: true }))).toBe(true)
  })

  it('fires on Ctrl+B (Windows/Linux)', () => {
    expect(isBoldShortcut(key({ key: 'b', ctrlKey: true }))).toBe(true)
  })

  it('is case-insensitive on the key (Shift+Cmd+B reports "B")', () => {
    expect(isBoldShortcut(key({ key: 'B', metaKey: true }))).toBe(true)
  })

  it('does not fire on a bare "b" with no modifier', () => {
    expect(isBoldShortcut(key({ key: 'b' }))).toBe(false)
  })

  it('does not fire on Cmd/Ctrl with a different key', () => {
    expect(isBoldShortcut(key({ key: 'i', metaKey: true }))).toBe(false)
    expect(isBoldShortcut(key({ key: 'i', ctrlKey: true }))).toBe(false)
  })
})

describe('isUndoShortcut', () => {
  it('fires on Cmd+Z (macOS)', () => {
    expect(isUndoShortcut(key({ key: 'z', metaKey: true }))).toBe(true)
  })

  it('fires on Ctrl+Z (Windows/Linux)', () => {
    expect(isUndoShortcut(key({ key: 'z', ctrlKey: true }))).toBe(true)
  })

  it('is case-insensitive on the key', () => {
    expect(isUndoShortcut(key({ key: 'Z', metaKey: true }))).toBe(true)
  })

  it('does not fire on a bare "z" with no modifier', () => {
    expect(isUndoShortcut(key({ key: 'z' }))).toBe(false)
  })

  it('does not fire on Cmd/Ctrl+Shift+Z (redo is out of scope)', () => {
    expect(isUndoShortcut(key({ key: 'z', metaKey: true, shiftKey: true }))).toBe(false)
    expect(isUndoShortcut(key({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe(false)
  })

  it('does not fire on Cmd/Ctrl with a different key', () => {
    expect(isUndoShortcut(key({ key: 'y', metaKey: true }))).toBe(false)
  })
})

describe('isEditableTarget', () => {
  function elementLike(overrides: Partial<{ tagName: string; isContentEditable: boolean }>): EventTarget {
    return { tagName: 'DIV', isContentEditable: false, ...overrides } as unknown as EventTarget
  }

  it('is true for an <input>', () => {
    expect(isEditableTarget(elementLike({ tagName: 'INPUT' }))).toBe(true)
  })

  it('is true for a <textarea>', () => {
    expect(isEditableTarget(elementLike({ tagName: 'TEXTAREA' }))).toBe(true)
  })

  it('is true for a contenteditable element', () => {
    expect(isEditableTarget(elementLike({ tagName: 'DIV', isContentEditable: true }))).toBe(true)
  })

  it('is false for a plain element', () => {
    expect(isEditableTarget(elementLike({ tagName: 'BUTTON' }))).toBe(false)
  })

  it('is false for null', () => {
    expect(isEditableTarget(null)).toBe(false)
  })
})
