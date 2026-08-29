// The prediction-game exchanges (prediction-game.md) as data, shared by
// every harness that replays them: tools/eval-game.mjs (the shipped
// engine) and tools/api-lm-predict.mjs (a served model). One file so the
// two columns of any comparison are the same 14 cases.
//
// mode: 'complete' = the last token is a prefix still being typed;
// 'next' = the last token is committed, the strip predicts the next
// word (prefix ''). The game transcript has no trailing spaces, so the
// mode is read from what the user picked.
export const CASES = [
  { n: 1, input: 'you are am', prefix: 'am', prev: 'are', prev2: 'you', recent: ['you', 'are'], want: 'amazing' },
  { n: 2, input: 'how', prefix: '', prev: 'how', prev2: '', recent: ['how'], want: 'are' },
  { n: 3, input: 'do i e', prefix: 'e', prev: 'i', prev2: 'do', recent: ['do', 'i'], want: 'even' },
  { n: 4, input: 'future is', prefix: '', prev: 'is', prev2: 'future', recent: ['future', 'is'], want: 'now' },
  { n: 5, input: 'its', prefix: 'its', prev: '', prev2: '', recent: [], want: "it's" },
  { n: 6, input: 'I', prefix: '', prev: 'i', prev2: '', recent: ['i'], want: 'love' },
  { n: 7, input: 'I w', prefix: 'w', prev: 'i', prev2: '', recent: ['i'], want: 'would' },
  { n: 8, input: 'deliberat', prefix: 'deliberat', prev: '', prev2: '', recent: [], want: 'deliberately' },
  { n: 9, input: 'paja se šla vykoupat a zapla', prefix: 'zapla', prev: 'a', prev2: 'vykoupat', recent: ['paja', 'se', 'šla', 'vykoupat', 'a'], want: 'zaplavat' },
  { n: 10, input: 'mam hlad dam si k', prefix: 'k', prev: 'si', prev2: 'dam', recent: ['mam', 'hlad', 'dam', 'si'], want: 'kuře' },
  { n: 11, input: 'smoo', prefix: 'smoo', prev: '', prev2: '', recent: [], want: 'smooth' },
  { n: 12, input: 'ahojky zebricko', prefix: 'zebricko', prev: 'ahojky', prev2: '', recent: ['ahojky'], want: 'zebřičko' },
  { n: 13, input: 'zkouška nového predik', prefix: 'predik', prev: 'nového', prev2: 'zkouška', recent: ['zkouška', 'nového'], want: 'predikčního' },
  { n: 14, input: 'zkouška nového predikčního', prefix: '', prev: 'predikčního', prev2: 'nového', recent: ['zkouška', 'nového', 'predikčního'], want: 'algoritmu' },
];

// The language each case is written in. The game splits 9 English and 5
// Czech, which is how czech-lm-research.md reports every model.
export const LANG = { 1: 'en', 2: 'en', 3: 'en', 4: 'en', 5: 'en', 6: 'en', 7: 'en', 8: 'en', 11: 'en', 9: 'cs', 10: 'cs', 12: 'cs', 13: 'cs', 14: 'cs' };
