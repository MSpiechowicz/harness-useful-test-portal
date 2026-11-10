# Contributing

Harness Test Portal is a Tauri 2 desktop app with a SvelteKit front end. The questions are plain JSON files, so most
contributions are content.

## Setup

Requirements: [Bun](https://bun.sh) 1.4+ and, to run the desktop shell, the Rust toolchain pinned in `rust-toolchain.toml`.

```sh
bun install
bun run dev        # the web app at http://localhost:5173 (settings use localStorage, updates are hidden)
bun run dev:app    # the same inside the Tauri window
```

Before opening a pull request run `bun run check`, `bun run lint`, `bun test` and `bun run content:validate`.

## How content is organised

```
content/topics/<topic>/topic.json
content/topics/<topic>/questions/<question-id>.json
content/schema/{topic,question}.schema.json   generated, do not edit
```

- A topic is a folder. Its `id` must equal the folder name. Questions belong to the topic whose folder holds them and
  carry no topic field.
- A question's `id` must equal its file name (without `.json`) and be unique across all topics.
- Ids and topic names are lowercase slugs: letters, digits and single hyphens, at most 64 characters.

## Add a topic

```sh
bun run new:topic prompt-basics
```

This writes `content/topics/prompt-basics/topic.json` with placeholders. Set `title`, `description`, optionally `group`
(topics with the same group are listed together on the home page) and `order` (lower comes first, default 1000, ties
by id). A topic must have at least one question.

## Add a question

```sh
bun run new:question prompt-basics what-is-a-system-prompt                    # single choice (default)
bun run new:question prompt-basics which-affect-cost --type multi
bun run new:question prompt-basics context-window-is-unbounded --type true-false
```

The command refuses to overwrite a file, to use an unknown topic or an invalid slug, or to reuse an id that exists in
another topic. Replace every `TODO` placeholder; the validator warns about leftovers.

### Question rules

| Field         | Rule                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `type`        | `single` (2-8 options, exactly 1 correct), `multi` (3-8 options, at least 2 correct and not all), `true-false` |
| `difficulty`  | `basic`, `intermediate` or `advanced`                                                                          |
| `prompt`      | Plain text. `` `backticks` `` render as inline code. No HTML or Markdown.                                      |
| `code`        | Optional snippet shown in a code block                                                                         |
| `options`     | `{ "id": "a", "text": "..." }`; ids match `^[a-z0-9-]{1,32}$` and are unique within the question               |
| `correct`     | Option ids (an array) for `single`/`multi`, a boolean for `true-false`                                         |
| `explanation` | Plain text, same inline-code rule as `prompt`; explains why the answer is right                                |
| `sources`     | 1-5 `{ "title", "url" }`; `https` only, no credentials in the URL, urls unique                                 |
| `tags`        | Optional slugs, unique                                                                                         |

Multi questions are scored all-or-nothing. Unanswered questions count as wrong.

Texts (`title`, `description`, `group`, `prompt`, `explanation`, option `text`) are either a string or an object keyed
by locale with English required: `{ "en": "..." }`. Only English ships today; the object form is how a translation is
added later. Unknown keys are rejected everywhere (`$schema` is allowed so editors can validate and autocomplete).

### The schema

`src/lib/content/schema.ts` (zod) is the source of truth. After changing it run

```sh
bun run content:schema          # regenerates content/schema/*.json
bun run content:schema --check  # fails when the generated files are out of date (CI runs this)
```

## Validate

```sh
bun run content:validate
```

It lists every problem as `error|warn <file> <field>: <message>` and exits non-zero on errors. It catches: folder or
file name not matching the `id`, duplicate question ids, duplicate or unknown option ids, wrong `correct` counts,
non-https or credentialed sources, duplicate sources, unknown locale keys or missing English text, unknown fields,
a questions folder without `topic.json`, and a topic without questions. `bun run build` runs it first.

## Check source links

```sh
bun run content:links
```

Requests every source URL (HEAD, then GET). Dead links (404, 410, network errors) fail the run; bot-blocked or busy
answers (401, 403, 429, 5xx) are only reported. It needs the network, so it runs on a schedule in CI rather than on
every pull request.

## Commits

[Conventional Commits](https://www.conventionalcommits.org). Content-only changes use `feat(content): ...` for new
topics and questions and `fix(content): ...` for corrections, so releases pick them up. Other scopes: `feat(ui)`,
`fix(settings)`, `chore(deps)` and so on.

## Code style

Prettier (`bun run format`), ESLint and strict TypeScript. UTF-8, LF, two-space indent (`.editorconfig`). Logic that can
be tested without Svelte lives in plain `.ts` files next to its `.test.ts`, because `bun test` cannot compile `.svelte`
or `.svelte.ts`.

The app's CSP forbids inline styles: use classes or Svelte `style:` directives, never `style="..."` attributes.
