# Anki Card Manager

[ [English](https://github.com/jaewonE/anki-card-manager) | [한국어](https://github.com/jaewonE/anki-card-manager/blob/master/README.ko.md) ]

Anki Card Manager turns `obsidian-to-anki` marker blocks into compact, collapsible cards in Obsidian and provides a vault-wide table for maintaining their source Markdown. Version: **0.1.0**.

## Features

- Renders a complete `<START_ANKI>` / `<END_ANKI>` block as a warning-callout-style card after the editor selection leaves the block.
- Replaces an immediately surrounding Markdown code fence when the card is its only content, so no empty fence remains around the UI. Deleting that card also removes the exclusive fence.
- Keeps the question visible and the answer inside a collapsible section. Move the cursor back into the source range to edit the raw block.
- Keeps rendered cards in place by default, with an option to collect every rendered card at the bottom of the current document.
- Completes a line containing `<START_ANKI>` with `Obsidian-Basic`, blank question and answer areas, `Back:`, and `<END_ANKI>`.
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

## Usage

1. Type `<START_ANKI>` on its own line. The rest of the card template and missing YAML properties are added immediately.
2. Fill in the question and answer, then move the editor selection outside the marker block to see the collapsible card.
3. Select the library ribbon icon or run **Anki Card Manager: Open card manager** to scan the vault.
4. Search, filter, group by tags, open the source, edit, toggle registration, or delete a card from the table.

Source edits are direct vault writes. Keep normal backups or source control, especially before bulk maintenance. If a note changes after the manager scans it, the operation stops instead of writing to a stale range; rescan and retry.

## Commands and hotkeys

- **Open card manager**
- **Insert Anki card**

No default hotkeys are assigned. Configure shortcuts under **Settings → Hotkeys**.

## Settings

- **Card placement:** Keep cards in place (default) or collect them at the document end.
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

```bash
npm install
npm run lint
npm test
npm run build
```

The production release files are generated at the repository root.

## License

[0BSD](LICENSE)
