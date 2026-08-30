// The four word-list modules, loaded from the repo root by default and
// from WORDS_DIR when that is set:
//
//   WORDS_DIR=/tmp/lists node tools/eval-game.mjs
//
// The override exists for vocabulary sweeps. Choosing a list size means
// scoring several candidate lists against the same harnesses, and the
// working tree is mounted from the user's machine, so swapping files in
// place to do it is the one thing this repo must not do.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.WORDS_DIR
  ? path.resolve(process.env.WORDS_DIR)
  : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const load = async (file, name) =>
  (await import(pathToFileURL(path.join(root, file)).href))[name];

export const WORDS = {
  en: await load('words-en.js', 'WORDS'),
  cs: await load('words-cs.js', 'WORDS'),
};
export const WORDS_EXT = {
  en: await load('words-ext-en.js', 'WORDS_EXT'),
  cs: await load('words-ext-cs.js', 'WORDS_EXT'),
};
export const WORDS_DIR = root;
