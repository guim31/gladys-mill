// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code and the documentation. German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { connectionReport } from '../src/app.js';
import { LANGUAGES } from '../src/config.js';
import { MESSAGES, MODE_LABELS, NAMES, REPORT, WIDGET_TEXT, fill } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the configuration offers the four languages, French by default', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  const field = manifest.config_schema.find((f) => f.key === 'language');
  assert.equal(field.default, 'fr');
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 38, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the brand, the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
});

test('the feature names and the mode labels exist in every language', () => {
  assert.deepEqual(tableProblems(NAMES, 'NAMES', MAX.featureName), []);
  assert.deepEqual(tableProblems(MODE_LABELS, 'MODE_LABELS', MAX.featureName), []);
});

test('every message of the code has the four languages', () => {
  const found = [
    ...Object.entries(MESSAGES).flatMap(([key, value]) =>
      problems(value, `MESSAGES.${key}`, MAX.message),
    ),
    ...Object.entries(WIDGET_TEXT).flatMap(([key, value]) =>
      problems(
        fill(value, { count: 12, failed: 3 }),
        `WIDGET_TEXT.${key}`,
        ['empty', 'done', 'partial'].includes(key) ? MAX.message : MAX.short,
      ),
    ),
  ];
  assert.deepEqual(found, []);
});

test('the connection report exists in every language', () => {
  const render = (value) => (typeof value === 'function' ? value('192.0.2.40', 'Bureau') : value);
  assert.deepEqual(tableProblems(REPORT, 'REPORT', MAX.message, render), []);
  const report = connectionReport({
    cloud: { ok: false, auth: false },
    locals: [
      { host: '192.0.2.40', ok: true, name: 'Bureau' },
      { host: '192.0.2.41', ok: false, reason: 'no answer (timeout)' },
    ],
    invalidHosts: ['x y'],
  });
  assert.deepEqual(problems(report, 'connectionReport', 400), []);
  assert.match(report.de, /Mill-Cloud: Die Mill-Cloud antwortet nicht/);
  assert.match(report.es, /Direcciones ignoradas: x y\./);
});

/** The `##` headings of a doc, in order. */
const headings = (text) => [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

test('the four docs exist, with the same number of sections', async () => {
  const docs = Object.fromEntries(
    await Promise.all(
      LANGS.map(async (lang) => [
        lang,
        await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
      ]),
    ),
  );
  const count = headings(docs.en).length;
  assert.ok(count >= 8, `docs/en.md has ${count} sections`);
  for (const lang of LANGS) {
    assert.equal(headings(docs[lang]).length, count, `docs/${lang}.md: ${headings(docs[lang])}`);
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short`);
    if (lang === 'de') {
      assert.doesNotMatch(docs.de, POLITE_GERMAN, 'docs/de.md uses the polite form');
    }
  }
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Heater', fr: 'Radiateur', de: 'Heizkörper' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Konto', 'Ihre IP', 'mit Ihrem', 'Ihnen']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.config_schema[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.config_schema[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
  assert.deepEqual(headings('## A\ntext\n## B\n### c'), ['A', 'B']);
});
