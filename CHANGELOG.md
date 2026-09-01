# Changelog

## 0.3.2

- Partition large adjacent card stacks into bounded 24-card widgets with collapsed-height estimates, retaining the stable CodeMirror StateField decoration and atomic-range architecture.
- Cache the parsed editor projection across focus, selection and presentation-only updates; reparse only when source text, source path or card triggers change.
- Render answer Markdown and controls only on first expansion, while preserving open cards across widget recycling and source mutations.
- Prioritize Reading-view chunks near the viewport, hydrate the remainder in bounded background batches for reliable direct jumps, preserve surrounding prose and continuous stack styling, and add large-stack, parse-cache, lazy-answer and intersection regressions.

## 0.3.1

- Seed every sampling execution from the current time so repeated runs can select different cards while retaining duplicate-safe quotas and validation.
- Make the manager header Sync icon and `Rebuild card index` command open the same complete-rebuild confirmation dialog.
- Show completed/total Markdown file progress during a full rebuild, retain incremental startup and Vault-event updates, and avoid table rerenders for progress-only notifications.
- Add time-seed, rebuild progress and confirmation regressions plus equivalent English/Korean documentation.

## 0.3.0

- Persist the complete manager card projection in a local IndexedDB database and load it before reconciling changed Vault files.
- Reindex only created, modified, renamed or deleted Markdown paths, coalesce rapid events, and retain a full rebuild command plus memory fallback.
- Precompute normalized search fields while indexing, preserve every existing manager column and stale-write guard, and update only affected paths after card or bulk edits.
- Render at most 100 rows per table page and defer tables for large collapsed groups, while retaining selection, grouping, sampling and accessibility behavior.
- Add IndexedDB, warm-cache, incremental lifecycle, fallback, pagination and large-group regression coverage plus equivalent English/Korean documentation.

## 0.2.4

- Add `-property:value` exclusions for every supported search property and alias, including comma lists such as `-tag:t1,t2`.
- Always remove cards matching any exclusion in both AND and OR modes; retain existing AND/OR behavior for included terms and support exclusion-only searches.
- Preserve quoting, case/whitespace tolerance, field matching rules, search focus, selection safety and read-only search behavior.
- Add parser and manager regressions and update search hints plus English/Korean usage documentation.

## 0.2.3

- Remove the table-wide "Anki cards table" hover tooltip by using a referenced accessible label instead of Obsidian's tooltip-triggering aria-label attribute.
- Preserve screen-reader names, keyboard focus and horizontal scrolling, with unique labels across grouped tables and multiple manager views.
- Add tooltip-attribute and accessible-label regression coverage; update English/Korean documentation.

## 0.2.2

- Add 12px left padding to the results toolbar while retaining the existing grouping-only collapse/expand controls.
- Keep table columns and headers on narrow screens; scroll each table horizontally, including nested groups, with keyboard-accessible scroll regions.
- Keep Question and Source text at its normal color without underlines on hover/focus, preserving keyboard focus indicators.
- Add table structure and narrow-pane/viewport regression fixtures; update equivalent English/Korean usage documentation.

## 0.2.1

- Keep Registered buttons blue and Unregistered buttons red to match card icons, including hover/focus and brighter dark-mode colors.
- Share Question and Source link padding, bright backgrounds and small corner radii in the manager.
- Place the select-all checkbox before its label and keep collapse/expand-all immediately beside it in a left-aligned toolbar.
- Add selection-toolbar regression coverage and host-theme color checks in the browser fixtures; update English/Korean documentation.

## 0.2.0

- Keep raw Markdown visible in Obsidian Source mode and render interactive cards in Reading view with section-aware deduplication and managed component cleanup.
- Use the supplied Material Symbols Light highlighter for Cloze. ArrowUp from below a card stack enters the last card at its closing marker without deleting source.
- Replace virtual document-end rendering with confirmed physical vault-wide card relocation above footnotes. Preserve source contents/order/YAML/line endings, normalize vacated gaps, and keep inline placement as the default.
- Require a warning, acknowledgement and final confirmation before collection; retain verified source backups, compare snapshots, roll back safe failures, and recover interrupted or repeated collections without overwriting concurrent edits. Installation/startup never relocate notes.
- Add an independent shared group sampling Count/Rate mode, including global Count 10 with group Rate 30/40/30. Keep deterministic seed 42, exact total quotas and failure-without-selection-change behavior.
- Add comma-separated tag/deck/type search and a blue/orange global AND/OR button immediately right of search. Apply the selected mode to both comma lists and separately listed conditions; default/reset to AND.
- Style grouping and sampling with pale blue/green panels, align Sampling label size, refine question padding/background/radius, and make edit-dialog source locations open the card in its note.
- Expand regression and browser fixtures and update equivalent English/Korean usage, migration and recovery documentation. Retain Obsidian 1.5.0 compatibility.

## 0.1.5

- Use the supplied Carbon filter-reset and Ant Design file-sync SVG geometry. Separate Search/Filter, Grouping and Change state controls with blue grouping and pale-purple state actions.
- Add a filter for discovered card types, size status/type dropdowns to their current labels, let search fill the remaining width, and keep only the header's filtered/total count.
- Remove the Actions column; open editing by selecting a question. Offer a Basic/Cloze dropdown with the shared card conversion logic and preserve cancel-without-write behavior.
- Prefix group names with Deck/Tag and add collapse-all/expand-all controls that include descendants.
- Add opt-in Count/Rate sampling (default Rate 30%) with fixed seed 42, group count/share allocations, exact integer quota rounding, duplicate-safe allocation and shortage redistribution.
- Reject invalid sample budgets or insufficient unallocated candidates without changing selection or writing files. Reset all sampling controls and clear obsolete group allocations.
- Add deterministic sampling and manager DOM regressions, verify light/dark browser behavior, and document grouping, selection-only sampling and recovery rules in both languages.

## 0.1.4

- Limit single-line ellipsis to collapsed cards and show full questions when expanded. Halve all-edge shadows, add side gutters, and remove pencil-button shadows.
- Add native floating Basic/Cloze menus, safe Cloze-to-Basic unwrapping (single/double colons), and color-matched registration toggles using live editor transactions. Keep the updated card expanded.
- Centralize type/separator/icon definitions; use blank icons for Cloze and Anki-style icons for other types. Offer a Basic/Cloze dropdown for new-card defaults.
- Add four draft trigger settings with explicit Save and apply to the entire vault. Simultaneously replace literal occurrences throughout Markdown and use saved triggers across rendering, completion, card actions, deletion protection and manager scans.
- Verify a durable source backup before migration, reject stale writes, restore unchanged files on failure, and pause automation until interrupted migrations are recovered. Retain private backups inside the Vault; leave external obsidian-to-anki configuration unchanged.
- Expand two-version CodeMirror, manager, settings and migration regression coverage, verify light/dark browser layouts, and document controls, migration scope and recovery in English and Korean. Retain Obsidian 1.5.0 compatibility.

## 0.1.3

- Group cards by the file's single `anki_deck` using `::` hierarchy; keep multi-value tags flat and optionally group them within each deck.
- Separate Type and Deck columns, preserve search focus/caret/IME during result updates, and add case/whitespace-tolerant property search with inline hints.
- Add Reset and Vault-sync controls, unique row/table/group selection with mixed states, and selection pruning for filtered-out cards.
- Add confirmed bulk registration, unregistration, deletion, and file-level deck/tag changes (add/remove/replace tags), with explicit disclosure of affected unselected cards.
- Preserve Markdown bodies and unrelated YAML properties, preflight bulk targets, compare source snapshots before each write, and report partial completion without overwriting concurrent edits.
- Add manager model/DOM/bulk-write regression tests, a sample-only browser fixture, and bilingual manager usage/safety documentation. Retain Obsidian 1.5.0 compatibility.

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
