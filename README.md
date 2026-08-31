# Anki Card Manager

[ [English](https://github.com/jaewonE/anki-card-manager) | [한국어](https://github.com/jaewonE/anki-card-manager/blob/master/README.ko.md) ]

Anki Card Manager turns `obsidian-to-anki` marker blocks into compact, collapsible cards in Obsidian and provides a vault-wide table for maintaining their source Markdown. Version: **0.1.4**.

## Features

- Renders a complete `<START_ANKI>` / `<END_ANKI>` block as a warning-callout-style card after the editor selection leaves the block or the editor loses focus.
- Replaces an immediately surrounding Markdown code fence when the card is its only content, so no empty fence remains around the UI. Deleting that card also removes the exclusive fence.
- Keeps the question visible and the answer inside a collapsible section. Select the circular pencil icon (**Edit source**) to reveal and focus its raw block, including in document-end mode. Card type appears in the answer header.
- Shows full questions by default. Optional single-line ellipsis applies only while collapsed; expanding a card always reveals the full question.
- Uses a blank icon for Cloze and an Anki-style card/star icon for other types: blue for registered cards and red for unregistered cards, with brighter dark-mode colors.
- Uses a compact, centered all-edge shadow (4px blur, white in dark mode), with 6px side gutters to prevent clipping. Consecutive cards separated only by whitespace share one shadowed stack, with thin dividers and no individual rounding or shadows. Document-end collections use the same stack layout; the pencil edit button has no shadow.
- Offers a floating card-type menu and a color-coded Registered/Unregistered toggle in the answer header. Both update the live editor with native undo/save support.
- Keeps rendered cards in place by default, with an option to collect every rendered card at the bottom of the current document.
- Completes a line containing `<START_ANKI>` with the configured card type, blank question and answer areas, the appropriate separator, and `<END_ANKI>`. Typing or pressing Enter does not add another template if its closing marker already exists before the next start marker, including inline starts.
- Backspace immediately after a rendered card/stack reveals source instead of deleting the hidden block. Forward Delete is protected too; ordinary text editing and explicit selection deletion remain available.
- Supports `Cloze` cards with `Text:` and independently revealable blanks, a reveal/hide-all toggle, and automatic hiding when the answer is closed.
- Adds missing `anki_deck: Inbox` and `anki_tags: [Inbox]` YAML properties when a card is completed. These defaults are configurable.
- Scans all Markdown files on demand and shows registered and unregistered cards in one searchable table.
- Edits or deletes the exact source block and opens the source note at the card location.
- Toggles registration without contacting Anki. Unregistering removes standalone `<!--ID: ... -->` lines and changes the markers to `<ANKI_START>` / `<ANKI_END>`; registering changes the markers back.
- Separates Type and Deck columns; groups decks by `::` hierarchy, with optional flat tag groups inside each deck.
- Keeps search focus/caret while updating results and supports case/whitespace-tolerant property searches such as `tags:Inbox`.
- Provides row, table, and group checkboxes for bulk registration, tag/deck changes, and deletion, with explicit scope confirmation.
- Provides four configurable card triggers, applied only through an explicit vault-wide save/migration button with source backups and recovery.

## Card format

The plugin recognizes this registered form with the default triggers:

```text
<START_ANKI>
Obsidian-Basic
Question (multiple lines are allowed)
Back:
Answer (multiple lines are allowed)
<!--ID: 1775887365861-->
<END_ANKI>
```

The containing Markdown file should include:

```yaml
---
anki_deck: Development::Certification
anki_tags:
  - certification
---
```

The plugin remains compatible with `obsidian-to-anki`, but it does not invoke Anki, AnkiConnect, or the `obsidian-to-anki` synchronization process itself.

### Cloze cards

Only the exact card type `Cloze` uses `Text:` instead of `Back:`:

```text
<START_ANKI>
Cloze
What is **UML**?
Text:
**UML** is a {{c1::standardized object-oriented modeling language}}.
- Elements: {{c1::things}}, {{c1::relationships}}, {{c2::diagrams}}
<END_ANKI>
```

Every blank is initially covered by an opaque highlight, even when several blanks share the same number. Click a blank (or press Enter/Space while focused) to reveal it independently. **Reveal all answers / Hide all answers** sits next to the card type. Closing the answer hides all blanks again. Markdown inside answers, including bold text and inline code, is rendered normally when revealed.

The viewer also accepts the supplied single-colon form `{{c1:answer}}`; viewing never rewrites the source notation. Use standard double-colon `{{c1::answer}}` syntax for Anki compatibility. Registration toggles and ordinary edits retain `Text:`. Viewing or revealing blanks does not modify the note.

### Type and registration controls

Expand a card and select its type label with the downward triangle. A native Obsidian floating menu offers **Obsidian-Basic** and **Cloze**, including keyboard selection. Converting Cloze to Basic changes `Text:` to `Back:` and unwraps single/double-colon cloze tokens in the question and answer, retaining the answer text and Markdown while removing hints. Converting Basic to Cloze changes the type and separator to `Text:` without adding blanks. IDs and registration state are preserved during type changes.

Select **Registered** or **Unregistered** beside the type to toggle registration. Its color matches the card icon. Unregistering removes standalone IDs and uses the configured inactive triggers; registering restores the active triggers without creating an ID. The card stays open after these actions, and updates use the live editor's ordinary undo and save flow. This status describes the Markdown markers, not whether a note currently exists in Anki.

## Usage

1. Type `<START_ANKI>` (or your configured registered start trigger) on its own line. If no matching closer exists before the next start, the rest of the card template and missing YAML properties are added immediately.
2. Fill in the question and answer, then move the editor selection outside the marker block or focus another pane to see the collapsible card. Use **Edit source** to return to the raw text.
3. Select the library ribbon icon or run **Anki Card Manager: Open card manager** to scan the vault.
4. Search, filter, group by deck and/or tag, open the source, edit, toggle registration, or select cards for bulk maintenance.

Source edits are direct vault writes. Keep normal backups or source control, especially before bulk maintenance. If a note changes after the manager scans it, the operation stops instead of writing to a stale range; rescan and retry.

### Decks, tags, and manager controls

`anki_deck` is a single string shared by every card in a note. `Mother::Child` puts those cards in Child beneath Mother; a card belongs to one deck, not several ancestor decks. `anki_tags` is a list of independent strings, and each card inherits every tag in that note. Slashes or `::` in tags are kept as literal label text, not interpreted as deck levels.

The default manager view is a flat table. **Group by deck hierarchy** and **Group by tag** can be enabled separately. Together, deck hierarchy comes first and tag groups appear within each exact deck. Multi-tag cards appear in several tag groups, but counts and selection always use unique cards. Group checkboxes select/deselect all matching descendants, including collapsed groups; a mixed checkbox indicates partial selection. Filtering clears selections that are no longer among the matching cards.

The **Reset** icon clears the query, status filter, grouping, group expansion state, and selection. The adjacent **Sync** icon rescans current Vault Markdown, preserving the controls. It does not invoke Anki synchronization.

### Search syntax

Search is case-insensitive and ignores whitespace differences within values. Field searches use substring matching (except `status`, which matches `registered` or `unregistered` exactly). Multiple fields are combined with AND:

```text
tags:Inbox
TAGS : in box
deck:Mother::Child type:Cloze
tags:"Study notes" path:software
```

Supported fields: `deck` / `anki_deck`, `tags` / `tag` / `anki_tags`, `type`, `front` / `question`, `back` / `answer`, `path` / `source`, `status`, and `id`. A property value extends until the next property; quotes protect text that looks like a property. Free words before the first property are AND-matched across question, answer, type, deck, tags, path, and ID. Empty input shows all cards permitted by the status filter.

### Bulk changes and file-level YAML

Select rows or groups, then choose **Register**, **Unregister**, **Change tags**, **Change deck**, or **Delete**. All operations require confirmation. Registration and deletion affect only the selected unique blocks; unregistering removes their standalone IDs, and deleting also removes an exclusive code fence. These operations never delete notes from Anki itself.

**Deck and tag changes apply to every card in each selected source file, including unselected cards**, because YAML belongs to the file. The dialog lists the affected files and explicitly shows both total and unselected card counts. No cards are moved or given per-card overrides. Deck input accepts one deck; tags support add, remove, or replace using one tag per line (empty replacement clears the list). Duplicate tag values are removed; matching for tag removal is exact and case-sensitive. Other YAML properties and the Markdown body are preserved, though YAML formatting/comments may be normalized.

Bulk writes flush open note editors, validate all targets before any write, and update each file once. Changed card inventories or metadata abort stale actions. Each write rechecks the source atomically. Vault writes are not a cross-file transaction: a write failure stops remaining files and reports completed file paths, without rolling back over newer user edits. Backups or Obsidian File Recovery can be used to restore prior content. Invalid/unreadable YAML files are skipped with a count in the manager header.

## Commands and hotkeys

- **Open card manager**
- **Insert Anki card**

No default hotkeys are assigned. Configure shortcuts under **Settings → Hotkeys**.

## Settings

- **Card placement:** Keep cards in place (default) or collect them at the document end.
- **Single-line titles:** Show one line with an ellipsis only on collapsed cards; off by default.
- **Complete start markers:** Enable or disable automatic card completion.
- **New card defaults:** Card type dropdown (`Obsidian-Basic` or `Cloze`, default `Obsidian-Basic`), deck (`Inbox`), and tag (`Inbox`).
- **Card triggers:** Registered start/end and unregistered start/end. Defaults are `<START_ANKI>`, `<END_ANKI>`, `<ANKI_START>`, and `<ANKI_END>` respectively.

### Saving triggers and migrating the vault

Trigger fields are drafts: typing does not save them or alter rendering/completion. Closing settings discards unapplied drafts. Select **저장 및 전체 Vault에 적용** (Save and apply to the entire vault) to apply all four values together. Values must be non-empty, single-line strings without surrounding whitespace; they must be distinct and must not contain each other.

The button replaces **every literal occurrence** of the four currently saved triggers in every Vault Markdown file, including prose, code examples and YAML, not just recognized cards. Replacement is simultaneous, so swaps do not cascade, and regex characters or `$` are treated literally. Binary files are excluded. The new triggers take effect across rendering, completion, source editing, registration, deletion protection and manager scans after all writes succeed. **This does not configure `obsidian-to-anki`: update that plugin separately to match your new triggers.**

Keep an independent backup and avoid editing notes during migration. Open note editors are saved first. Before any Markdown write, the plugin writes and verifies a full before/after backup at `<configDir>/plugins/anki-card-manager/trigger-migration.json`. Every write compares its source snapshot. If migration fails before settings commit, unchanged migrated files are restored from the backup; concurrently edited or missing files are left untouched. An unfinished migration pauses card automation, including after restarting Obsidian. Use **Recover trigger migration** in settings; if it reports conflicting files, manually restore those files from the backup and retry. A migration whose settings already committed is finalized without overwriting subsequent edits.

Successful or restored migrations retain their backup under `<configDir>/plugins/anki-card-manager/trigger-backups/`. These JSON files contain complete note content and are not automatically deleted; manage them like other private Vault backups. No whole-Vault change occurs merely by installing or upgrading the plugin.

## Privacy, network access, and platform support

The plugin works locally, makes no network requests, sends no telemetry, and reads or writes only Markdown files, plugin settings and trigger-migration backups inside the current vault. Settings are stored in the plugin's `data.json`; migration backups contain affected note contents inside the plugin folder. It does not read files outside the vault.

`isDesktopOnly` is `false`. The editor card renderer and responsive manager are implemented with Obsidian APIs and browser-compatible code for desktop and mobile.

## Installation

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub release.
2. Copy them to `<Vault>/.obsidian/plugins/anki-card-manager/`.
3. Reload Obsidian and enable **Anki Card Manager** under **Settings → Community plugins**.

Community Plugins installation will be available after the plugin is accepted into Obsidian's Community Plugin directory.

## Development

Use Node.js 22.13+ (or a newer LTS release).

```bash
npm install
npm run lint
npm test
npm run build
```

The production release files are generated at the repository root.

`npm test` runs parser tests and real CodeMirror DOM regression tests on versions 6.38.6 and 6.43.9. These cover initial rendering, position 251, focus/blur, dropdown measurement, source editing, both placement modes, card grouping, truncation, Cloze masking/reset and source preservation, completion boundaries, keyboard/native deletion protection, repeated edits, and extension cleanup. Obsidian host APIs are stubbed; these tests do not replace an in-app Obsidian check.

Manager tests also cover deck/tag semantics, field search, focus/caret/IME preservation, group selection and reset, confirmation scope, YAML/body preservation, duplicate-target safety, stale preflight, and partial-write reporting.

Additional regressions cover type menus and live-editor registration, Cloze unwrapping, custom triggers across all consumers, draft settings, simultaneous literal replacement, durable backups, write/settings failures, concurrent-edit protection, and recovery after restart. Card types, separators and icon assignments are centralized in `src/cardTypes.ts` for future extension.

For browser layout checks, run `npm run test:browser` and open the printed editor or `/manager` URL. The fixtures use sample text only and never read or write Vault files. CodeMirror and test dependencies are not bundled into the production plugin; Obsidian supplies its own editor runtime.

## License

[0BSD](LICENSE)
