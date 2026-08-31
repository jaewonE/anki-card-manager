# Changelog

## 0.1.2

- Add opt-in single-line question titles with ellipsis; full titles remain the default.
- Add all-edge shadows with white dark-mode halos, shared stacks for consecutive/document-end cards, and thin unrounded internal dividers.
- Show blue/red Anki-style registration icons with brighter dark variants, move card type to the answer header, and use a circular gray pencil edit button.
- Support Cloze cards with Text:, opaque independently revealable Markdown blanks, reveal/hide-all controls, and reset on close. Preserve source notation and Cloze separators during manager edits and registration toggles.
- Avoid duplicate completion when a closing marker appears before the next start, including Enter and inline nested-start cases.
- Reveal source before Backspace/forward Delete can remove a hidden card or stack; preserve ordinary text edits and explicit selection deletion.
- Expand parser/editor regression coverage and light/dark browser fixtures, retaining the 0.1.1 rendering stability fixes.

## 0.1.1

- Supply multiline and block decorations directly from a CodeMirror StateField to prevent invalid editor layout updates during initial rendering and cursor movement.
- Render cards when the editor loses focus, coalesce focus updates to avoid reentrant dispatch, and remeasure after dropdown and asynchronous Markdown changes.
- Add an Edit source button in both placement modes and keep source offsets current after surrounding text edits.
- Release Markdown components correctly when CodeMirror reuses widget DOM; ignore late size callbacks after widget removal.
- Add two-version editor DOM regression tests and a browser fixture covering repeated focus/edit cycles without modifying Vault files.

## 0.1.0

- Render complete Anki marker blocks and their exclusive Markdown fences as collapsible, callout-style cards when their source is not being edited.
- Add inline and document-end card placement modes plus automatic card and YAML completion.
- Add a vault-wide searchable card manager with hierarchical tag grouping, source navigation, direct editing, deletion, and registration toggles.
- Preserve `obsidian-to-anki` compatibility while keeping all processing local to the vault.
