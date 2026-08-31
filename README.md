# Anki Card Manager

[ [English](https://github.com/jaewonE/anki-card-manager) | [한국어](https://github.com/jaewonE/anki-card-manager/blob/master/README.ko.md) ]

Anki Card Manager turns `obsidian-to-anki` marker blocks into compact, collapsible cards in Obsidian and provides a vault-wide table for maintaining their source Markdown. Version: **0.2.0**.

## Features

- Renders complete card blocks in Live Preview after selection/focus leaves them, and in Reading view. Obsidian Source mode always shows raw Markdown.
- Replaces an immediately surrounding Markdown code fence when the card is its only content, so no empty fence remains around the UI. Deleting that card also removes the exclusive fence.
- Keeps the question visible and the answer inside a collapsible section. Select the circular pencil icon (**Edit source**) to reveal and focus its raw block, including in document-end mode. Card type appears in the answer header.
- Shows full questions by default. Optional single-line ellipsis applies only while collapsed; expanding a card always reveals the full question.
- Uses the supplied Material Symbols Light highlighter icon for Cloze and an Anki-style card/star icon for other types: blue for registered cards and red for unregistered cards, with brighter dark-mode colors.
- Uses a compact, centered all-edge shadow (4px blur, white in dark mode), with 6px side gutters to prevent clipping. Consecutive cards separated only by whitespace share one shadowed stack, with thin dividers and no individual rounding or shadows. Document-end collections use the same stack layout; the pencil edit button has no shadow.
- Offers a floating card-type menu and a color-coded Registered/Unregistered toggle in the answer header. Both update the live editor with native undo/save support.
- Keeps cards in place by default. Confirmed collection physically moves card source blocks across the entire vault to note ends, above footnotes, with durable backups and recovery.
- Completes a line containing `<START_ANKI>` with the configured card type, blank question and answer areas, the appropriate separator, and `<END_ANKI>`. Typing or pressing Enter does not add another template if its closing marker already exists before the next start marker, including inline starts.
- Backspace or ArrowUp immediately below a rendered stack enters the last card's source at its closing marker. Forward Delete is protected too; ordinary text editing and explicit selection deletion remain available.
- Supports `Cloze` cards with `Text:` and independently revealable blanks, a reveal/hide-all toggle, and automatic hiding when the answer is closed.
- Adds missing `anki_deck: Inbox` and `anki_tags: [Inbox]` YAML properties when a card is completed. These defaults are configurable.
- Scans all Markdown files on demand and shows registered and unregistered cards in one searchable table.
- Edits or deletes the exact source block and opens the source note at the card location.
- Toggles registration without contacting Anki. Unregistering removes standalone `<!--ID: ... -->` lines and changes the markers to `<ANKI_START>` / `<ANKI_END>`; registering changes the markers back.
- Separates Type and Deck columns; groups decks by `::` hierarchy, with optional flat tag groups inside each deck.
- Keeps search focus/caret while updating results and supports case/whitespace-tolerant property searches, comma lists such as `tag:t1,t2`, and a color-coded AND/OR button for all search conditions (default AND).
- Provides row, table, and group checkboxes for bulk registration, tag/deck changes, and deletion, with explicit scope confirmation.
- Provides four configurable card triggers, applied only through an explicit vault-wide save/migration button with source backups and recovery.
- Separates Search/Filter, Grouping and Change state controls, adds a discovered-card-type filter, and uses the supplied filter-reset/file-sync icons. Questions open the edit dialog without an Actions column.
- Samples the selected unique cards by Count or Rate with fixed seed 42, optional per-group allocations, and validation that leaves selection unchanged on failure.

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

Select **Registered** or **Unregistered** beside the type to toggle registration. Its color matches the card icon. Unregistering removes standalone IDs and uses the configured inactive triggers; registering restores the active triggers without creating an ID. In Live Preview the card stays open and updates use ordinary editor undo/save. Reading-view controls update the source file and refresh the preview. This status describes Markdown markers, not whether a note currently exists in Anki.

## Usage

1. Type `<START_ANKI>` (or your configured registered start trigger) on its own line. If no matching closer exists before the next start, the rest of the card template and missing YAML properties are added immediately.
2. Fill in the question and answer, then move the editor selection outside the marker block or focus another pane to see the collapsible card. Use **Edit source** to return to the raw text.
3. Select the library ribbon icon or run **Anki Card Manager: Open card manager** to scan the vault.
4. Search or filter by status/type, group by deck and/or tag, select a question to edit, or open its source. Select cards for sampling or bulk maintenance.

Source edits are direct vault writes. Keep normal backups or source control, especially before bulk maintenance. If a note changes after the manager scans it, the operation stops instead of writing to a stale range; rescan and retry.

### Decks, tags, and manager controls

`anki_deck` is a single string shared by every card in a note. `Mother::Child` puts those cards in Child beneath Mother; a card belongs to one deck, not several ancestor decks. `anki_tags` is a list of independent strings, and each card inherits every tag in that note. Slashes or `::` in tags are kept as literal label text, not interpreted as deck levels.

The default manager view is a flat table. **Group by deck hierarchy** and **Group by tag** can be enabled separately. Together, deck hierarchy comes first and tag groups appear within each exact deck. Labels include their kind, such as **Deck: Inbox (7)** or **Tag: Inbox (7)**. Multi-tag cards appear in several tag groups, but counts and selection always use unique cards. Group checkboxes select/deselect all matching descendants, including collapsed groups; a mixed checkbox indicates partial selection. Filtering clears selections that are no longer among the matching cards.

Next to **Select all matching cards**, **전체 접기** (Collapse all) appears whenever any group is open, including descendants. Otherwise **전체 펼치기** (Expand all) opens every group.

**Search/Filter** contains the search box, its immediately adjacent **AND/OR** button, and compact **All statuses / All card types** dropdowns. AND is blue and OR is orange, with brighter dark-mode colors. Dropdowns fit the selected text so search takes the remaining width. Type options come from the current Vault scan. **Grouping** has blue active buttons and a pale blue panel. **Change state | N selected** sits above the bulk buttons in a pale purple panel; enabled state-action buttons use light purple. **Sampling** uses a pale green panel and the same label size. The header alone shows the filtered/total count.

Select a question to open **Edit Anki card**. Its type dropdown offers `Obsidian-Basic` and `Cloze`; saving uses the same Cloze-to-Basic conversion as individual cards. The clickable source location opens the note at the card in editing mode and closes the dialog without saving its draft. Cancel does not modify source. Registration/deletion are available through bulk controls rather than an Actions column.

The **Reset** icon (`carbon--filter-reset.svg`) clears the query, status/type filters, grouping, expansion, sampling configuration and selection. The adjacent **Sync** icon (`ant-design--file-sync-outlined.svg`) rescans current Vault Markdown, preserving controls and valid selections. If a filtered type no longer exists, the type filter returns to All card types. Sync does not invoke Anki synchronization.

### Search syntax

Search is case-insensitive and ignores whitespace differences within values. Field searches use substring matching (except `status`, which matches `registered` or `unregistered` exactly). The button immediately right of search combines **all** conditions using AND (default, every condition) or OR (any condition), including comma-separated values and separately listed properties/free words:

```text
tags:Inbox
tag:Inbox,Math
TAGS : in box
deck:Mother::Child type:Cloze
tags:"Study notes" path:software
```

Supported fields: `deck` / `anki_deck`, `tags` / `tag` / `anki_tags`, `type`, `front` / `question`, `back` / `answer`, `path` / `source`, `status`, and `id`. Deck/tag/type values split on commas (names cannot contain commas). `tag:t1,t2` is equivalent to `tag:t1 tag:t2` in either mode; OR also applies across different properties, not just a single list. A property value extends until the next property; quotes protect text that looks like a property. Free words before the first property search across question, answer, type, deck, tags, path, and ID using the same mode. Empty input shows all cards permitted by the status/type dropdown filters, which always narrow search results. Reset returns the mode to AND.

### Bulk changes and file-level YAML

Select rows or groups, then choose **Register**, **Unregister**, **Change tags**, **Change deck**, or **Delete**. All operations require confirmation. Registration and deletion affect only the selected unique blocks; unregistering removes their standalone IDs, and deleting also removes an exclusive code fence. These operations never delete notes from Anki itself.

**Deck and tag changes apply to every card in each selected source file, including unselected cards**, because YAML belongs to the file. The dialog lists the affected files and explicitly shows both total and unselected card counts. No cards are moved or given per-card overrides. Deck input accepts one deck; tags support add, remove, or replace using one tag per line (empty replacement clears the list). Duplicate tag values are removed; matching for tag removal is exact and case-sensitive. Other YAML properties and the Markdown body are preserved, though YAML formatting/comments may be normalized.

Bulk writes flush open note editors, validate all targets before any write, and update each file once. Changed card inventories or metadata abort stale actions. Each write rechecks the source atomically. Vault writes are not a cross-file transaction: a write failure stops remaining files and reports completed file paths, without rolling back over newer user edits. Backups or Obsidian File Recovery can be used to restore prior content. Invalid/unreadable YAML files are skipped with a count in the manager header.

### Sampling selected cards

Below Change state, enable **Sampling**, choose **Count** or **Rate**, enter an amount, then select **Execute**. Sampling is off by default, with Rate **30%**. Execute keeps only the sampled cards selected and deselects the rest; it never changes card text, registration or files. Each run uses seed **42** with stable card ordering. The same candidate selection and settings produce the same result, regardless of duplicate tag rows or scan order.

- Count must be an integer from 1 to the number of selected unique cards.
- Rate must be greater than 0 and at most 100; the total sample size is rounded up (`ceil(selected × rate / 100)`).
- With grouping enabled, **Sampling: Count/Rate + amount** beside each group allocates part of the global sample from its selected descendants. All group dropdowns share one mode, independent of the global mode, and changing one updates every group. Empty means unallocated; explicit zero excludes that group from the remainder pool. Group Count values are non-negative integers totaling no more than the final sample size. Group Rate values are shares of the final sample (0–100%), totaling no more than 100%.
- Example: Count 10 with group A set to 6 draws 6 from A and 4 from outside A. From 100 selected cards, Rate 30 with A set to 50% draws 15 from A and 15 from outside A. Integer rate quotas use largest-remainder rounding, including the unallocated share, so they sum to the exact target.
- Independent modes: global Count 10 with group Rate shares 30%, 40%, 30% draws 3, 4, 3 from disjoint groups with sufficient candidates. Global Rate can likewise use group Count quotas.
- Undersized groups contribute every available selected card; missing slots go to the remainder pool. Cards cannot fill two slots, even across overlapping tags or parent/child groups. Smaller selected candidate pools are handled first, with stable group-key tie-breaking. Counts shown in overlapping groups can therefore include cards assigned through another group.
- The remainder is drawn from selected unique cards **outside all explicitly allocated groups**. After drawing, if there are too few candidates to reach the target, an error is shown and the original selection is left intact. Reduce the sample or adjust/clear group values; cards left inside an allocated group are not silently used as the remainder.

Changing the shared **group** Count/Rate mode or grouping clears allocations; changing the **global** mode leaves group mode/values intact. Filtered-out groups lose their allocations. Reset restores disabled global Rate 30%, group Rate, and empty group values. Sampling configuration is local to the current manager view, not persisted.

## Commands and hotkeys

- **Open card manager**
- **Insert Anki card**

No default hotkeys are assigned. Configure shortcuts under **Settings → Hotkeys**.

## Settings

- **Card placement:** Keep in place (default), or explicitly confirm physical vault-wide collection. **Collect cards again** re-collects later additions.
- **Single-line titles:** Show one line with an ellipsis only on collapsed cards; off by default.
- **Complete start markers:** Enable or disable automatic card completion.
- **New card defaults:** Card type dropdown (`Obsidian-Basic` or `Cloze`, default `Obsidian-Basic`), deck (`Inbox`), and tag (`Inbox`).
- **Card triggers:** Registered start/end and unregistered start/end. Defaults are `<START_ANKI>`, `<END_ANKI>`, `<ANKI_START>`, and `<ANKI_END>` respectively.

### Collecting source blocks at document ends

Choosing **Collect at document end** opens a warning dialog. A separate acknowledgement checkbox enables **Move all cards**. Cancel changes nothing. Confirming saves open editors, plans every Markdown file, and verifies a full before/after backup before moving any blocks. Registered/unregistered cards use the configured markers; card contents, identifiers, order, YAML and line endings are retained. Only blank gaps at removal sites collapse to a single newline. Cards are inserted before the first top-level footnote definition outside code fences (everything from that definition onward remains in place). With no footnotes, cards go at EOF.

This changes source files, not just display. Keep in place does not restore old positions. Cards render at their actual positions in both settings; typing, rendering, startup and installation never relocate notes. Use **Collect cards again** for new cards. Upgrading an old virtual-collection setting requires fresh confirmation and temporarily uses Keep in place.

Backups are written to `<configDir>/plugins/anki-card-manager/placement-migration.json` and retained in `placement-backups/` after completion/recovery. Every source write checks the original snapshot; failures restore only unchanged migrated files. Concurrent edits/missing files are untouched and leave automation paused until **Recover card placement** succeeds. A unique commit stamp distinguishes completed moves from interrupted repeat collections, so recovery never rolls back post-commit edits. Keep independent backups and avoid editing during the move. Backup JSON contains private note content and is not automatically deleted.

### Saving triggers and migrating the vault

Trigger fields are drafts: typing does not save them or alter rendering/completion. Closing settings discards unapplied drafts. Select **저장 및 전체 Vault에 적용** (Save and apply to the entire vault) to apply all four values together. Values must be non-empty, single-line strings without surrounding whitespace; they must be distinct and must not contain each other.

The button replaces **every literal occurrence** of the four currently saved triggers in every Vault Markdown file, including prose, code examples and YAML, not just recognized cards. Replacement is simultaneous, so swaps do not cascade, and regex characters or `$` are treated literally. Binary files are excluded. The new triggers take effect across rendering, completion, source editing, registration, deletion protection and manager scans after all writes succeed. **This does not configure `obsidian-to-anki`: update that plugin separately to match your new triggers.**

Keep an independent backup and avoid editing notes during migration. Open note editors are saved first. Before any Markdown write, the plugin writes and verifies a full before/after backup at `<configDir>/plugins/anki-card-manager/trigger-migration.json`. Every write compares its source snapshot. If migration fails before settings commit, unchanged migrated files are restored from the backup; concurrently edited or missing files are left untouched. An unfinished migration pauses card automation, including after restarting Obsidian. Use **Recover trigger migration** in settings; if it reports conflicting files, manually restore those files from the backup and retry. A migration whose settings already committed is finalized without overwriting subsequent edits.

Successful or restored migrations retain their backup under `<configDir>/plugins/anki-card-manager/trigger-backups/`. These JSON files contain complete note content and are not automatically deleted; manage them like other private Vault backups. No whole-Vault change occurs merely by installing or upgrading the plugin.

## Privacy, network access, and platform support

The plugin works locally, makes no network requests, sends no telemetry, and reads or writes only Markdown files, plugin settings and trigger/placement migration backups inside the current vault. Settings are stored in the plugin's `data.json`; migration backups contain affected note contents inside the plugin folder. It does not read files outside the vault.

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

Manager tests also cover deck/tag semantics, field/type search, focus/caret/IME preservation, group selection, collapse/expand and reset, type editing, confirmation scope, YAML/body preservation, duplicate-target safety, stale preflight, and partial-write reporting. Sampling tests cover reproducibility, Count/Rate boundaries, integer quota rounding, group underflow/overlap, deduplication and unchanged selection on failure.

Additional regressions cover type menus and live-editor registration, Cloze unwrapping, custom triggers across all consumers, draft settings, simultaneous literal replacement, durable backups, write/settings failures, concurrent-edit protection, and recovery after restart. Card types, separators and icon assignments are centralized in `src/cardTypes.ts` for future extension.

Source/Live Preview transitions, Reading-view section boundaries/lifecycle, bottom-entry ArrowUp, physical collection/idempotence/footnotes, placement confirmation/recovery, independent group sampling modes, comma and global AND/OR search, and modal source navigation have regression coverage. Tests use sample documents, never real Vault notes.

For browser layout checks, run `npm run test:browser` and open the printed editor, `/manager`, or `/reading` URL. The fixtures use sample text only and never read or write Vault files. CodeMirror and test dependencies are not bundled into the production plugin; Obsidian supplies its own editor runtime.

## License

[0BSD](LICENSE)
