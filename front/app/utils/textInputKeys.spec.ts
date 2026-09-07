import { describe, expect, it } from 'vitest'
import { isBoldShortcut } from './textInputKeys'

/** Minimal stand-in for the fields `isBoldShortcut` actually reads — a full `KeyboardEvent`
 *  needs a DOM, which these pure-logic specs (see dockPhysics.spec.ts / wheelIntent.spec.ts)
 *  deliberately don't stand up. */
function key(overrides: Partial<Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>>): KeyboardEvent {
  return { key: 'b', metaKey: false, ctrlKey: false, ...overrides } as KeyboardEvent
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
