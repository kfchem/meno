# The manual

Meno's manual is part of the website, at
[kfchem.github.io/meno/manual/](https://kfchem.github.io/meno/manual/): how
to install Meno, and how to work in it, a part at a time. Every page is
there in English and in Japanese, and Japanese is not a translation added
after: a page goes up in both languages or not at all.

## Where it lives

| | |
|---|---|
| `site/manual/contents.json` | the languages; the pages, in order; the words of the frame around them (the bar, the column of pages, the footer) in each language |
| `site/manual/pages/<language>/<page>.md` | the pages, `index.md` the contents' own words |
| `site/manual/manual.css`, `manual.js` | the look, and the language switch |
| `scripts/site/manual.mjs` | the build |
| `scripts/site/manual.test.mjs` | its tests, and the build of the real pages |

Japanese text belongs in the repository here alone: in the pages under
`site/manual/pages/ja/` and in the Japanese words of `contents.json`.

## The front door and the switch

`/manual/` sends the reader on at once to `/manual/en/` or `/manual/ja/`:
the language they chose before, if they did, or else the first of their
browser's languages the manual has, or else English. A page's name after
`#` goes on to that page (`/manual/#installing`), which is how the
website's own page links to one. Without script it shows both languages.

Every page has the switch at the top right, each language named in itself. It goes to
the same page in the other language, at the same section - both languages
give their sections the same ids - and keeps the choice for the next visit
(`localStorage`, nothing else). Each page names its other language to search
engines (`hreflang`).

## Writing a page

A page is added to `contents.json` and written in both languages, with the
same sections, in the same order, under the same ids. The build refuses a
page one language has and the other has not, and sections that differ
between the two.

What the manual's Markdown is - anything else is refused, saying where:

- the page's title, `# Title`, first and once;
- sections, `## Heading {#id}` and `### Heading {#id}`, each with its id;
- paragraphs, lists (`- ` or `1. ` at each item, numbered in order, a line
  carried on indented by two spaces or more) and notes (`> ` at each line),
  each block between blank lines;
- within them, `` `code` ``, `*italic*`, `**bold**`, and links: to
  `https://...`, to another page by its name and a section if wanted
  (`installing#mac`), to a section of the same page (`#mac`), and to the
  website's own page (`/`, `/#download`). A link to nothing is refused.

The first paragraph says what the page is about: it stands under the title,
and it is the page's description in the contents and to search engines.

What a page says:

- What Meno does as it is, checked by running it - never copied from the
  design documents in `docs/` or the decisions in them.
- Plain words, one thing to do in a sentence, steps numbered.
- The names of things on screen exactly as the window shows them: in
  *italic* in English, in Japanese corner brackets in Japanese. Meno's own
  words are English in both languages, as Meno shows them. The words of
  Windows, macOS and the browser are the system's own: in Japanese, the
  Japanese system's, with the English after them in brackets (*Open
  Anyway* after macOS's Japanese for it).
- No characters that show differently from one system to another (circled
  numbers, Roman numerals as one character, half-width katakana and the
  like): the build refuses them.

## Building it

```
node scripts/site/release.mjs site _site
node scripts/site/manual.mjs site/manual _site/manual
python3 -m http.server --directory _site
```

then <http://localhost:8000/manual/>. The pages link to folders, so open
them through a server, not as files. `release.mjs` asks GitHub for the
latest release; without the network it leaves the website's page without
one, and the manual does not mind.

`npm test` builds the real pages along with the tests, so a page the build
would refuse fails there - and in CI, on every pull request.

## Publishing

The Pages workflow (`.github/workflows/pages.yml`) builds the website, then
the manual into it (`_site/manual/`, in place of its sources), whenever
`site/` or the build changes on main, and when a release is published.

## Next

"How do I...?" pages: a gallery of what Meno makes, each opening on the
steps that make it, from the first click - one picture of the window a
step, the spot to click marked, and one short sentence. The pictures and
the places marked are to be recorded by the GUI harness (`scripts/gui`),
from a scenario for each, so that they can be taken again whenever the
window changes; the words stay in the manual's pages, in both languages.
