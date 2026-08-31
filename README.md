# Anki Card Manager

[ [English](https://github.com/jaewonE/anki-card-manager) | [한국어](https://github.com/jaewonE/anki-card-manager/blob/master/README.ko.md) ]

Anki Card Manager turns `obsidian-to-anki` marker blocks into compact, collapsible cards in Obsidian and provides a vault-wide table for maintaining their source Markdown. Version: **0.1.2**.

## Features

- Renders a complete `<START_ANKI>` / `<END_ANKI>` block as a warning-callout-style card after the editor selection leaves the block or the editor loses focus.
- Replaces an immediately surrounding Markdown code fence when the card is its only content, so no empty fence remains around the UI. Deleting that card also removes the exclusive fence.
- Keeps the question visible and the answer inside a collapsible section. Select the circular pencil icon (**Edit source**) to reveal and focus its raw block, including in document-end mode. Card type appears in the answer header.
- Shows full questions by default, with an optional single-line ellipsis setting.
- Uses Anki-style card/star icons: blue for registered cards and red for unregistered cards, with brighter dark-mode colors.
- Uses a centered, all-edge shadow (white in dark mode). Consecutive cards separated only by whitespace share one shadowed stack, with thin dividers and no individual rounding or shadows. Document-end collections use the same stack layout.
- Keeps rendered cards in place by default, with an option to collect every rendered card at the bottom of the current document.
- Completes a line containing `<START_ANKI>` with the configured card type, blank question and answer areas, the appropriate separator, and `<END_ANKI>`. Typing or pressing Enter does not add another template if its closing marker already exists before the next start marker, including inline starts.
- Backspace immediately after a rendered card/stack reveals source instead of deleting the hidden block. Forward Delete is protected too; ordinary text editing and explicit selection deletion remain available.
- Supports `Cloze` cards with `Text:` and independently revealable blanks, a reveal/hide-all toggle, and automatic hiding when the answer is closed.
- Adds missing `anki_deck: Inbox` and `anki_tags: [Inbox]` YAML properties when a card is completed. These defaults are configurable.
- Scans all Markdown files on demand and shows registered and unregistered cards in one searchable table.
- Edits or deletes the exact source block and opens the source note at the card location.
- Toggles registration without contacting Anki. Unregistering removes standalone `<!--ID: ... -->` lines and changes the markers to `<ANKI_START>` / `<ANKI_END>`; registering changes the markers back.
- Groups table rows by hierarchical tags such as `study/software/sdlc`.

## Card format

The plugin recognizes this registered form:

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

The viewer also accepts the supplied single-colon form `{{c1:answer}}`; it never rewrites the source notation. Use standard double-colon `{{c1::answer}}` syntax for Anki compatibility. Manager edits, registration toggles, and the `Cloze` default template retain `Text:`. Viewing or revealing blanks does not modify the note.

## Usage

1. Type `<START_ANKI>` on its own line. If no matching closer exists before the next start, the rest of the card template and missing YAML properties are added immediately.
2. Fill in the question and answer, then move the editor selection outside the marker block or focus another pane to see the collapsible card. Use **Edit source** to return to the raw text.
3. Select the library ribbon icon or run **Anki Card Manager: Open card manager** to scan the vault.
4. Search, filter, group by tags, open the source, edit, toggle registration, or delete a card from the table.

Source edits are direct vault writes. Keep normal backups or source control, especially before bulk maintenance. If a note changes after the manager scans it, the operation stops instead of writing to a stale range; rescan and retry.

## Commands and hotkeys

- **Open card manager**
- **Insert Anki card**

No default hotkeys are assigned. Configure shortcuts under **Settings → Hotkeys**.

## Settings

- **Card placement:** Keep cards in place (default) or collect them at the document end.
- **Single-line titles:** Show one line with an ellipsis; off by default.
- **Complete start markers:** Enable or disable automatic card completion.
- **New card defaults:** Card type (`Obsidian-Basic`), deck (`Inbox`), and tag (`Inbox`).

## Privacy, network access, and platform support

The plugin works locally, makes no network requests, sends no telemetry, and reads or writes only Markdown files and plugin settings inside the current vault. Settings are stored in the plugin's `data.json`. It does not read files outside the vault.

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

For browser layout checks, run `npm run test:browser` and open the printed localhost URL. The fixture uses sample text only and never reads or writes Vault files. CodeMirror and test dependencies are not bundled into the production plugin; Obsidian supplies its own editor runtime.

## License

[0BSD](LICENSE)
