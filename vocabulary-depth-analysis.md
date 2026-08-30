# How deep the word list stays a word list

Measured 2026-08-30, against wordfreq 3.1.1 large lists.

The keyboard ships one vocabulary per language, cut at a rank
(`EXT_TOTAL` in `tools/build-wordlists.py`). This note asks what the
right cut is, by reading the words at each depth instead of trusting a
dictionary to say.

**Result: English and Czech run out of words at very different depths.
English falls to half good around 50000 and is 8% good at 75000. Czech
is still 84% good at 150000 and holds to 200000. Czech tolerates three
to five times the depth of English.**

Recommended cuts: **English 50000, Czech 150000.** A symmetric size for
the two languages is wrong in either direction: 40000 starves Czech of
5.8% of its running text, and 100000 would fill a third of the English
list with names and fragments.

Three rankings appear below, and the number moves each time, so read
them in order. Most of the note measures wordfreq alone, which is where
the raw quality curve lives. "The same measurement on the ranking that
ships" repeats it on the blended wordfreq-plus-subtitles order the build
script uses, which moves the English cliff out from 20000 to about
50000. "The gate moves the number" then measures the finished lists,
after the aspell gate has removed the junk, which is what makes English
50000 safe. The first version of this note recommended English 30000; it
was reading the candidate stream instead of the shipped list.

## What was measured

`tools/vocab-depth.py` takes wordfreq's large list per language and
applies the build script's structural filters: the same alphabet regex,
the same one-letter whitelist, the same DROP set. That leaves 307604
English candidates and 596230 Czech candidates in frequency order.

The script then samples 25 random words per depth band, seed 20260830,
and writes them with no verdict attached. Claude labelled every sampled
word by hand: 900 words over 36 bands of wordfreq's own order, 350 over
14 bands of the blended order the build script ranks by, and 100 over 4
bands of the finished lists.

- **G**: the strip should offer this word.
- **M**: real, but marginal. An obscure proper name, a technical term,
  an established foreign word. It costs a prefix slot and rarely helps.
- **B**: must not be listed. A typo, a form with the diacritics stripped,
  a fragment, an abbreviation, or a word from the other language.

The labels are in the appendix, so the judgement can be checked.

An aspell gate was tried first and dropped. It answers a different
question in each language. English aspell holds 19253 capitalized-only
proper names, so it calls `waukesha` and `dodson` words. Czech aspell
holds 2.95 million lowercase forms and still misses live derivation, so
it calls `železnička` and `kafíčko` junk. A gate that is loose in one
language and tight in the other cannot say which language runs out of
words first, and that is the whole question. As a junk filter at depth
it does work, which is a different job. See "The gate moves the number".

`mass%` is the share of running text the band carries, from wordfreq's
own probabilities. It is the value side of the trade: a band full of
junk costs nothing if it also carries no text.

## English

| band | G% | M% | B% | mass% | cum% | mass per 1000 entries |
|---|---|---|---|---|---|---|
| 0-1000 | 100 | 0 | 0 | 71.097 | 71.097 | 71.097 |
| 1000-2000 | 100 | 0 | 0 | 7.442 | 78.539 | 7.442 |
| 2000-3000 | 96 | 0 | 4 | 4.116 | 82.655 | 4.116 |
| 3000-5000 | 100 | 0 | 0 | 4.665 | 87.320 | 2.333 |
| 5000-7500 | 100 | 0 | 0 | 3.182 | 90.502 | 1.273 |
| 7500-10000 | 84 | 12 | 4 | 1.913 | 92.415 | 0.765 |
| 10000-15000 | 76 | 16 | 8 | 2.240 | 94.655 | 0.448 |
| 15000-20000 | 68 | 24 | 8 | 1.270 | 95.925 | 0.254 |
| 20000-30000 | 40 | 48 | 12 | 1.378 | 97.303 | 0.138 |
| 30000-40000 | 36 | 60 | 4 | 0.731 | 98.033 | 0.073 |
| 40000-50000 | 20 | 68 | 12 | 0.446 | 98.479 | 0.045 |
| 50000-75000 | 4 | 68 | 28 | 0.597 | 99.076 | 0.024 |
| 75000-100000 | 0 | 48 | 52 | 0.299 | 99.375 | 0.012 |
| 100000-150000 | 4 | 52 | 44 | 0.302 | 99.677 | 0.006 |
| 150000-200000 | 0 | 24 | 76 | 0.154 | 99.831 | 0.003 |
| 200000-300000 | 0 | 24 | 76 | 0.161 | 99.992 | 0.002 |
| 300000-307604 | 0 | 16 | 84 | 0.008 | 100.000 | 0.001 |

English holds a clean 100% to rank 7500. The first real erosion is at
7500-10000, and it is mild. The break is at 20000: good words fall from
68% to 40% in one step, and marginal words take over. From 20000 to
75000 the list is mostly real but marginal, about half obscure proper
names (`annette`, `mendes`, `westchester`, `skidmore`, `mulroney`) and
half low-use vocabulary (`dereliction`, `foreshore`, `peptic`). Past
75000 junk wins outright: 52% bad at 75000-100000, 76% bad at 150000.

## Czech

| band | G% | M% | B% | mass% | cum% | mass per 1000 entries |
|---|---|---|---|---|---|---|
| 0-1000 | 96 | 0 | 4 | 56.910 | 56.910 | 56.910 |
| 1000-2000 | 96 | 0 | 4 | 6.992 | 63.902 | 6.992 |
| 2000-3000 | 100 | 0 | 0 | 4.200 | 68.103 | 4.200 |
| 3000-5000 | 96 | 0 | 4 | 5.340 | 73.442 | 2.670 |
| 5000-7500 | 88 | 0 | 12 | 4.184 | 77.626 | 1.674 |
| 7500-10000 | 96 | 0 | 4 | 2.867 | 80.493 | 1.147 |
| 10000-15000 | 88 | 12 | 0 | 3.850 | 84.343 | 0.770 |
| 15000-20000 | 88 | 12 | 0 | 2.543 | 86.886 | 0.509 |
| 20000-30000 | 92 | 0 | 8 | 3.227 | 90.113 | 0.323 |
| 30000-40000 | 96 | 0 | 4 | 1.951 | 92.064 | 0.195 |
| 40000-50000 | 88 | 8 | 4 | 1.319 | 93.382 | 0.132 |
| 50000-75000 | 88 | 12 | 0 | 2.012 | 95.394 | 0.080 |
| 75000-100000 | 80 | 16 | 4 | 1.160 | 96.554 | 0.046 |
| 100000-150000 | 88 | 12 | 0 | 1.295 | 97.848 | 0.026 |
| 150000-200000 | 76 | 20 | 4 | 0.707 | 98.556 | 0.014 |
| 200000-300000 | 64 | 12 | 24 | 0.739 | 99.294 | 0.007 |
| 300000-400000 | 32 | 36 | 32 | 0.368 | 99.662 | 0.004 |
| 400000-500000 | 52 | 32 | 16 | 0.211 | 99.873 | 0.002 |
| 500000-596230 | 28 | 28 | 44 | 0.127 | 100.000 | 0.001 |

Czech has no break where English has one. The good rate sits between 76%
and 96% from rank 0 all the way to 200000. It stays flat because the
words down there are ordinary: `kafíčko` at 53366, `vyzkoušíš` at
about 160000, `oceníš`, `pojištěnou`, `štěňátek`, `lidoopi`, `špás`.
These are not rare words. They are common words in a case or a person
the shallower ranks did not reach.

The Czech collapse starts at 200000 (bad jumps from 4% to 24%) and is
complete after 300000. The 400000-500000 band scores higher than the one
above it, which is sampling noise at 25 words per band, not a real
recovery.

Czech has its own junk class instead of English's names: words from the
other language. `you` at rank 1400, `high`, `day`, `from`, `young`,
`friendly`, `paris`, `italy`. English words inside a Czech list are the
worst kind of entry for this keyboard, because both languages share one
strip.

## Why the two languages differ

Czech inflection spreads one word over a long rank range. English does
not. One ordinary Czech verb, measured in the same ranking:

| dělat | dělám | děláš | dělá | děláme | děláte | dělají | dělal | dělaly | dělalo |
|---|---|---|---|---|---|---|---|---|---|
| 244 | 1116 | 2027 | 449 | 4242 | 2656 | 1093 | 1458 | 14236 | 18158 |

One ordinary Czech adjective:

| malý | malé | malá | malou | malých | malému | malými | maličký | malinký |
|---|---|---|---|---|---|---|---|---|
| 761 | 553 | 779 | 1840 | 2082 | 14276 | 8307 | 34703 | 33662 |

The English equivalents finish inside 1500 ranks:

| do | does | did | doing | done | make | makes | made | play | plays | played |
|---|---|---|---|---|---|---|---|---|---|---|
| 49 | 170 | 111 | 218 | 228 | 86 | 319 | 123 | 215 | 1498 | 571 |

So the same amount of language needs about ten times the rank depth in
Czech. wordfreq shows the same thing in its raw entry counts: Czech has
606360 entries against English 321180, from a smaller corpus.

The token coverage confirms it from the other direction. Rank needed to
cover a share of running text:

| coverage | English | Czech | ratio |
|---|---|---|---|
| 90% | 7002 | 29542 | 4.2 |
| 95% | 16127 | 68725 | 4.3 |
| 98% | 39409 | 158715 | 4.0 |
| 99% | 70510 | 250449 | 3.6 |

Czech needs four times the entries for the same coverage. The quality
measurement says it can have them. The two facts fit: the extra Czech
ranks are inflected forms of words the list already has, and inflected
forms of a real word are real words.

## The same measurement on the ranking that ships

The tables above rank by wordfreq alone. The keyboard does not. The
build script ranks by a geometric blend, half wordfreq and half the
OpenSubtitles counts, `WF_ALPHA = 0.5`. A rank in the tables above is
not a rank in the shipped list, so the sampling was repeated against the
blended order, over the bands where the answer could change. Same tool,
`tools/vocab-depth.py en out /path/os-en-419430400.txt.gz`, same 25
words per band, same labeller.

| band | English pure | English blended | Czech pure | Czech blended |
|---|---|---|---|---|
| 10k-15k | 76% | 72% | 88% | . |
| 15k-20k | 68% | 88% | 88% | . |
| 20k-30k | 40% | 64% | 92% | . |
| 30k-40k | 36% | 48% | 96% | . |
| 40k-50k | 20% | 52% | 88% | 92% |
| 50k-75k | 4% | 24% | 88% | 80% |
| 75k-100k | 0% | 8% | 80% | 88% |
| 100k-150k | 4% | 0% | 88% | 84% |
| 150k-200k | 0% | . | 76% | 80% |
| 200k-300k | 0% | . | 64% | 48% |

Percentages are good words. The blend moves the English cliff from
20000 out to about 50000, and leaves Czech where it was.

That asymmetry is the same finding again. The junk the blend removes is
junk that subtitles never contain: web names, brands, handles,
transliterations. English carries a mountain of those, so demanding
subtitle support repairs the English tail. Czech never had that
problem, so nothing changes. What English gains at 15000-30000 is
ordinary speech that wordfreq under-ranked: `gator`, `autism`,
`beetles`, `nemesis`, `forgave`, `socialize`, `dugout`, `rappers`.

The blended English tail past 50000 is still bad, and it fails in the
same way as before: `tanguy`, `rossendale`, `kleist`, `bandra`,
`mcelwaine`, `hollyweird`, `amzn`, `ilb`. The blended Czech tail at
150000-200000 is still ordinary Czech: `prodání`, `nevycházej`,
`rozzářený`, `uhodíte`, `blankytná`, `meditačních`, `nastupovaly`.

Blended samples, same format as the appendix:

```
en 10k-15k  mandy M, sync G, henri M, genre G, guiding G, postcard G, administered G, mosquito G, ph M, pd B, newport G, avalon M, relies G, nintendo G, psi M, ordinance G, abundant G, mechanisms G, meth G, bethlehem G, abusing G, blaring G, pepsi G, francesco M, indifferent G
en 15k-20k  gator G, autism G, intimidate G, beetles G, uncharted G, nemesis G, diligence G, camden M, athena G, lecturer G, forgave G, shedding G, alfonso M, sugars G, whirring G, ama B, artificially G, severance G, individuality G, migrants G, jackal G, tux G, craze G, prized G, repentance G
en 20k-30k  sanitary G, footwear G, dugout G, rappers G, nee M, sorely G, councilor G, socialize G, enzo M, differing G, quadruple G, maximus M, toxicology G, hamptons M, adversaries G, twine G, oskar M, littered G, blume B, splendour G, devouring G, collisions G, priors M, whiteside B, victor's M
en 30k-40k  infertility G, neath M, clanking G, flowered G, hannah's G, wands G, mowgli M, ouija G, renata M, copilot G, padres M, semiautomatic G, malabar B, renaud B, macadamia G, psy M, shoestring G, alway B, abercrombie M, heather's G, solis B, santoro B, erode G, angora M, champaign M
en 40k-50k  skyrocketed G, fervently G, nea B, slo B, li'l G, mosh G, leahy M, karine M, toretto M, drudgery G, redfield M, carcinogens G, bsc B, handsomest G, croaked G, absolutes G, malachy M, unreservedly G, throught B, houseguests G, fining M, potheads G, cpt B, uhhhh B, withstanding G
en 50k-75k  tanguy B, circumnavigation M, rossendale B, consumables M, aen B, paleozoic M, mpeg M, builder's G, kleist B, micha B, roubaix B, attendings B, bandra B, classwork G, shakeup G, rhododendrons M, chapstick G, timeliness G, tendinitis G, forell B, nakazawa B, generalisation M, masterchef M, streetwalker M, desert's M
en 75k-100k transistorized M, athelstane B, oya B, ftse M, pendergast B, pocono B, krishnas M, ster B, jarhead M, peppery G, mukund B, trounce M, wf B, skullduggery M, unprompted G, libro B, esser B, royd B, mcelwaine B, drak B, hollyweird B, shoestrings M, lansdowne B, ukelele B, siad B
en 100k-150k milksop M, allll B, communalism M, looe B, stably M, theroux B, bigman B, minz B, margy B, daghestan B, vegreville B, uge B, kotzebue B, amzn B, dyfed B, bonfils B, woodhall B, chaminade B, ilb B, redhat M, makerbot M, riem B, irredentist M, emam B, shi'ites M

cs 40k-50k  severozápadně G, dřevěnými G, bavlnu G, dosáhnu G, přestavby G, objímá G, prekérní G, krupobití G, vnučky G, zatáhne G, směj G, krabiček G, litvě G, kempování G, knightley M, rozchodem G, legislativu G, kopla G, odešlete G, nedozvěděli G, praci B, bedřich G, ukazatelů G, otáčejí G, braň G
cs 50k-75k  čurat G, nou B, panence G, pahorek G, narazily G, leštit G, zasněžené G, wheel B, jeannie M, protřepat G, prokuratura G, obíhají G, folkové G, vyzkoušené G, ušlechtilého G, přizpůsobila G, dominovat G, miltona M, pacholek G, připustí G, palestinu G, končetinami G, nahrávač G, žertíky G, fiedler M
cs 75k-100k neduhy G, adamův G, spojnice G, nežijete G, květinovou G, nakl B, lumbální M, bělouši G, guláše G, oslepil G, slušností G, dolovat G, vyšumí G, republikových G, třináctiletý G, odvezeš G, spoluvlastnictví G, tlamou G, prováděním G, programům G, pantery G, požehnána G, panáku G, computers B, zločincích G
cs 100k-150k kula M, kastrolu G, vyzvu G, obytným G, farscape B, vlastněné G, útrata G, korytu G, starkem M, satanistické G, cirku G, žíněnky G, napasovat G, treadwell B, dobyto G, vyřízeny G, zrezivělý G, zakopeme G, tržištích G, sedmdesátý G, koncentrují G, vyrytá G, prospěly G, nekontaktovali G, hnacích G
cs 150k-200k prodání G, životaschopná G, nevycházej G, eskortován G, krásnu M, počeštění G, kaitlin B, opravňovalo G, mite B, formovali G, rozzářený G, zastudena G, uhodíte G, blankytná G, proběhněte G, wrc B, zesnulými G, komtesy G, borovicových G, nanicovaté G, meditačních G, pozoruhodnosti G, dotázal G, ecole B, nastupovaly G
cs 200k-300k daleovi M, pružinové G, coy B, podvrhnout G, masse B, rázněji G, rendlík G, nevypořádala G, shepharda M, rakiji M, kunu G, otřásající G, raonic B, odřeknou G, mikimu M, nechráněna G, rozlehlo G, sdrce B, prati B, lotrinsko G, resch B, roppongi B, metar B, navolno G, kalciového M
```

## The gate moves the number (correction, same day)

Every band above is a rank in the candidate stream. The shipped list is
not that stream. The build script drops each candidate that fails its
aspell gate, its cross-language guard, or `needs_apostrophe()`. Position
N in the shipped list is therefore a deeper stream rank than N, and the
gap grows with depth, because rejects get denser:

| shipped position | English stream rank | Czech stream rank |
|---|---|---|
| 10000 | 10026 | . |
| 20000 | 20563 | 21077 |
| 30000 | 32562 | . |
| 40000 | 46636 | . |
| 50000 | 63793 | 55302 |
| 100000 | . | 116384 |
| 150000 | . | 182909 |

The gate does not remove candidates at random. It removes the junk. So
the shipped list at position N is better than the curve above reads at
rank N, and the difference is large enough to change the recommendation.
Measured directly on the shipped lists, same 25 words per band, same
labeller:

| shipped band | G% | M% | B% |
|---|---|---|---|
| en 30000-40000 | 80 | 20 | 0 |
| en 40000-50000 | 56 | 40 | 4 |
| cs 100000-125000 | 88 | 12 | 0 |
| cs 125000-150000 | 100 | 0 | 0 |

```
en 30k-40k  spic M, unrecognizable G, vegans G, brazilians G, hypothalamus M, advancements G, scalding G, clawing G, citywide G, endorses G, chirps G, sprig G, ramrod M, soaks G, expiring G, convergent M, mowers G, uncaring G, bullhorn G, stranglehold G, thickened G, restorations G, imprisoning G, alphas M, sergeant's G
en 40k-50k  abyssinia M, evinced M, labor's G, energetically G, overlapped G, tracheal M, cooperstown M, bullet's G, organisational G, unvarnished M, colander G, debauched M, cellphones G, pinkies G, trio's G, pagodas M, rds B, forbear M, compote G, hocks M, pallbearers G, schumann's M, infiltrator G, afterburners G, recyclables G
cs 100k-125k vynucení G, tobolky G, zariskoval G, albína M, protéz G, bushi M, kniplem M, lijáky G, nevnímáš G, hvězdokupě G, napravování G, kolotočem G, fetišismus G, ohlášením G, tinktura G, neříci G, rozhlíželi G, ztřeštěné G, netahala G, klaunovi G, pročesali G, souběžného G, demolovat G, kolidovat G, bušila G
cs 125k-150k dovíš G, kalcium G, popadaly G, následovné G, znázorňovat G, fandu G, otočnými G, prohlásíme G, učitelův G, odkoupím G, vylekaný G, realistických G, dušiček G, živelnou G, uváženě G, zákonodárném G, posudcích G, protestantům G, testovaného G, badatelské G, unavili G, vlámských G, milostpán G, poroučíme G, podtlaku G
```

The last 10000 entries of a 50000-word English list cost 40% marginal
and 4% bad, not the 24% bad the raw curve predicts at that depth. The
last 25000 of a 150000-word Czech list cost nothing at all in this
sample.

So the earlier recommendation of English 30000 was too conservative. It
read the stream, and the keyboard ships the filtered list. English 50000
is the right cut, and the gate is what makes it safe.

## What the cuts should be

**English 50000.** Measured on the shipped list, 30000-40000 is 80% good
and 40000-50000 is 56% good with one bad word in 25. Position 50000
reaches stream rank 63793, where the gate is doing most of the work. The
concrete win at that depth is the word that started this: `playlists`,
prediction game case 16. Marginal entries are cheaper than they look,
because a rank-45000 word is too rare to outrank a good word on a short
prefix. It surfaces only on a long prefix where nothing better matches.
Do not go past 50000: the stream at 75000 is 8% good, and no gate
rescues `mcelwaine`, `hollyweird` and `amzn`.

**Czech 150000.** The shipped Czech list is 88% good at 100000-125000
and 100% good at 125000-150000. Ranks 40000 to 150000 carry 5.8% of
Czech running text, more than the whole English 20000-to-300000 tail
carries. Czech at 40000 was too shallow by a wide margin. 150000 covers
95.7% of Czech tokens and still has headroom by this measurement, so if
a later need appears, going deeper is defensible. There is no reason to
do it yet.

Byte cost, measured on the files that ship. The core tier is eager, the
ext tier is lazy-loaded after first paint:

| file | entries | raw | gzip |
|---|---|---|---|
| `words-en.js` | 3000 | 51 KiB | 21 KiB |
| `words-ext-en.js` | 47000 | 791 KiB | 279 KiB |
| `words-cs.js` | 3000 | 53 KiB | 22 KiB |
| `words-ext-cs.js` | 147000 | 2663 KiB | 904 KiB |

The extension tier is lazy-loaded after first paint, so the cost is
bandwidth and memory, not time to first keystroke. The size choice needs
`tools/bench-predict.mjs` numbers next to these; this note answers only
the quality half.

## Two junk classes that no depth cut removes

**English contractions without the apostrophe.** `havent` sits at rank
about 14000, inside any English cut. The build script already rejects
these with `needs_apostrophe()`, and the sample confirms the rule earns
its place. `anual` (rank 150000+) and `calander` are the same class one
letter further out, and they fall outside any sane cut anyway.

**Czech words with the diacritics stripped.** `nove` at 20000-30000,
`svuj` at 40000-50000, `ted`, `neni`, `nevim`, `myslim`, `muj`, `kdyz`,
`vic`. These are people typing without diacritics, and wordfreq counts
them as words. The class grows with depth: 0.1% of the top 5000, 0.7% at
100000-150000, 1.5% at the bottom. In the top 150000 there are about 796
of them, found by asking whether an accented twin exists at 20 times the
frequency.

That test is not safe to ship as a filter. It also flags `rad` (genitive
plural of `rada`), `cech` (a guild), `dum`, `site` and `par`, which are
real words that happen to look like stripped forms. A correct filter
needs a real Czech lexicon, and aspell is not it: aspell cs itself
carries `mam`, `novy`, `proc` and `dobry`. The class is worth removing,
at about 0.5% of a 150000-word Czech list, but not with a strip rule
alone.

## What depth cannot buy

`železnička` sits at rank 366885, below the point where the Czech list
is more junk than language. No cut reaches it without taking the junk
too. The same is true of any word that is genuinely rare in the corpus
but common for one person. That is the job of the personal model, not of
the vocabulary size. Depth fixes words that are common everywhere and
merely late in the ranking. It does not fix words that are common only
for you.

## Caveats

- 25 words per band is a small sample. Each rate carries about 10
  percentage points of error. The headline gap is far larger than that
  (English 40% good against Czech 92% at the same 20000-30000 band), but
  a single band's number should not be read to the percent.
- The labels are one judgement, made by Claude, not a panel. The G and B
  classes are firm. The M class is the fuzzy one, and it is where a
  different reader would disagree most.
- wordfreq's data stops at about 2021 and will not be updated, so the
  tail carries the internet of that time. `trezor` and `qotsa` are in
  the English tail for that reason.

## Appendix: the labelled samples

Format is `word` then the label. Seed 20260830, 25 words per band.

### English

<!-- markdownlint-disable -->
```
0-1000       an G, his G, there G, should G, name G, government G, went G, five G, heart G, quite G, held G, main G, similar G, church G, sent G, itself G, serious G, seven G, created G, mark G, ten G, ball G, rock G, create G, limited G
1000-2000    dad G, goals G, plus G, anymore G, records G, fully G, cent G, missed G, owner G, african G, jack G, projects G, method G, window G, cat G, fifth G, function G, mary G, believed G, responsibility G, injury G, jones G, spanish G, communities G, terrible G
2000-3000    survey G, exercise G, requires G, internal G, milk G, taxes G, approved G, documents G, collected G, iii B, stadium G, jail G, assembly G, cheese G, promote G, messages G, politicians G, introduction G, principal G, recognized G, cap G, clinical G, quote G, graduate G, marked G
3000-5000    chocolate G, marks G, visitors G, province G, losses G, math G, refer G, sisters G, inspiration G, mum G, spiritual G, suitable G, cents G, expand G, boxes G, arena G, instagram G, legislative G, dynamic G, sole G, stunning G, garage G, handled G, assuming G, disgusting G
5000-7500    bug G, trusted G, anytime G, cried G, oak G, hitler G, eliminate G, translated G, associates G, teenage G, chains G, faithful G, contributing G, merchant G, obligation G, hack G, lineup G, congrats G, kindly G, evident G, uncertain G, sequel G, armor G, compatible G, cincinnati G
7500-10000   puzzle G, theirs G, ambitious G, factories G, kane M, berkeley G, buys G, mitch G, shepherd G, br B, launches G, knocking G, militia G, gem G, renaissance G, sodium G, uncommon G, abundance G, mock G, louisville G, swamp G, cyrus M, sorted G, elvis G, flynn M
10000-15000  economists G, stellar G, paula G, ty M, ish G, bans G, addict G, breeds G, circumstance G, plc M, contagious G, resisting G, undergone G, hobbies G, planetary G, gil M, obstruction G, ci B, comb G, specifics G, tex M, broadcasts G, decency G, handler G, havent B
15000-20000  ceremonial G, conducts G, kiev G, sneaking G, artworks G, doncaster M, fife M, landowners G, midi M, landings G, clover G, necessities G, administration's G, latch G, napoli M, unc B, werewolf G, dawg G, fag G, reindeer G, kyrie M, summaries G, budding G, cuomo M, msm B
20000-30000  zealand's M, annette M, estranged G, mendes M, vidal M, gaston M, westchester M, aud B, loyalists G, thi B, fortitude G, atv M, dredging G, grated G, jv B, addis M, deduct G, sutter M, videotape G, harrowing G, carpenters G, linn M, natured M, gower M, socializing G
30000-40000  diagonally G, rwandan M, untapped G, cath M, elba M, hovered G, lengthened G, gai B, kona M, axioms M, urea M, cuss G, manipulations G, conclave M, asgard M, vitae M, savour G, angina M, eradicating M, rowers M, sorceress M, stank G, kingship M, workloads G, cryptographic M
40000-50000  saluted G, halibut M, hefner M, civilisations G, koalas G, pegging M, gipsy M, ian's M, resents G, hahahah B, minimising G, slayers M, strom B, foreshore M, implicating M, misdirection M, bodie M, residencies M, moslem M, sidi B, ashoka M, dereliction M, prepayment M, dissipates M, saxe M
50000-75000  iii's B, springy G, cranny M, skidmore M, alts M, cloakroom M, kwong M, mulroney M, isak M, leppard B, centralisation M, onsen M, glamor M, riz B, steamroller M, seger M, witless M, illa B, rz B, gurkha M, pounces M, knoweth B, peptic M, transboundary M, ity B
75000-100000 squalls M, stably M, bosnians M, sloppiness M, alvis B, grampians M, purkinje M, chode B, mantri B, gopalakrishnan B, sniggering M, aquaponics M, sophomoric M, ksp B, goble B, reduplication M, catonsville B, stuy B, swayne B, fabiola M, spellers M, csh B, aashto B, bilt B, saam B
100000-150000 carnegie's M, detainer M, lexicographers M, gyeongju B, grob B, kakkar B, misgendered G, boogies M, sethu B, knicker M, cheerless M, vaster M, croplands M, brushfire M, munakata B, bergy B, sufyan B, redding's B, seminiferous M, stupefy M, rintoul B, angol B, bothnia B, trezor M, gladdens M
150000-200000 anual B, salines M, worf's B, avd B, dobler B, menefee B, sniffled M, parrish's B, bassil B, etling B, moonshadow B, qotsa B, basophil M, cooney's B, darent B, mitsurugi B, sybarite M, kovalam B, wjr B, aschoff B, habicht B, aggravations M, doorstops M, barkis B, byas B
200000-300000 circus's M, everpresent B, calander B, buskin M, annibal B, panthenol M, mascia B, propagule M, shirasu B, syncom B, illogicality M, ruddington B, velten B, parihar B, prixs B, strutters B, taffe B, bricken B, apocynum B, honies B, skatole M, tamkin B, geraud B, kleopatra B, vetti B
300000-307604 bajos B, bgen B, chubbed B, francesi B, hafts M, intertubes M, mettam B, perla's B, saza B, zemer B, achillies B, brini B, detter B, greatist B, hardeeville B, hormann B, konkel B, microformat M, neuengamme B, response's M, shaibani B, shimmie B, slocomb B, tuomioja B, vinexpo B
```

### Czech

```
0-1000       když G, byl G, tam G, všechny G, tě G, snad G, patří G, světě G, petr G, konečně G, malé G, služby G, stal G, metrů G, škole G, měsíců G, zhruba G, kraje G, svými G, udělal G, kolo G, mluví G, zajímavé G, ii B, názor G
1000-2000    kluci G, použití G, celého G, minulosti G, úrovni G, místech G, dodnes G, máma G, našla G, you B, krásný G, divadla G, spolupráce G, brna G, hráčů G, kus G, letadla G, praxi G, psát G, konkrétní G, bydlení G, amerických G, maximální G, výrobce G, naučit G
2000-3000    soutěži G, boha G, momentálně G, čímž G, marek G, budoucí G, historické G, nestalo G, bolest G, hřiště G, poháru G, vyšlo G, muzea G, povrchu G, fotografií G, rychlý G, starosta G, mise G, oblastí G, osn G, software G, starého G, fázi G, slavia G, třikrát G
3000-5000    kvalitu G, správní G, cest G, občané G, výraz G, zeď G, dárky G, pořad G, výhody G, říkali G, změnila G, nýbrž G, nastoupil G, mapa G, dokumentu G, rozpočet G, atmosféru G, vlaku G, předmětem G, porazil G, aleš G, high B, italské G, princezna G, týdně G
5000-7500    day B, snahu G, vyhovuje G, chodil G, cizích G, pořádek G, hluboko G, pochopitelně G, region G, kámoš G, střechy G, poptávka G, vytváření G, from B, židovské G, nedostatku G, motivace G, paris B, scénáře G, instalaci G, sdělení G, labe G, náměstek G, pohybují G, hrubý G
7500-10000   schůzce G, velitele G, ztratili G, klimatu G, nejvýše G, prázdnin G, přidali G, hospodářských G, hladinu G, nástupem G, seminář G, nabídkou G, náskok G, young B, fifa G, jejími G, koukal G, luboš G, papeže G, bojují G, iniciativy G, požádala G, dařilo G, náročnější G, památník G
10000-15000  úplná G, mistrem G, zachránili G, přípravou G, demokratickou G, jezdců G, čerpání G, bezva G, oživení G, nejblíže G, kytarista G, sbírat G, terorismu G, domovů G, baletu G, přesnost G, toalety G, záchrana G, supermarketu G, kytary G, michelle M, kiss M, mechanismy G, nejznámějších G, nina M
15000-20000  češky G, těsto G, cover M, nepoznal G, uplatňuje G, abysme G, branou G, hradem G, ken M, zadržen G, myšlenkami G, receptů G, pohledávek G, zahraničními G, shrnul G, zněla G, štrasburku G, guru G, kauci G, popularita G, dodání G, nedorozumění G, běžci G, ellen M, nebezpeční G
20000-30000  slavností G, řádný G, holení G, vylepšil G, nove B, střehu G, vklad G, většími G, italy B, otroků G, vykoupat G, vyšetřovatel G, albánie G, citlivou G, gigant G, indiány G, nejslavnějších G, rudém G, softwarové G, chytli G, reorganizaci G, říkaj G, měkkou G, družina G, plánováno G
30000-40000  narozeninové G, skleněnou G, vesmírných G, půjčují G, tanečního G, skýtá G, svolat G, oslo G, procenty G, renovaci G, friendly B, minulá G, průběhem G, vzdělávacím G, pronikat G, konzulátu G, uzdravit G, brouků G, jednáme G, programový G, odbočky G, odstartovat G, vzpomínáme G, litvínově G, ideologické G
40000-50000  loděmi G, svuj B, nesetkala G, vázaný G, vydám G, řádném G, pepe M, pozůstatků G, vykořisťování G, hladomoru G, likérky G, odseděl G, patentovat G, vychován G, úžasu G, dekretů G, ekvádor G, rgb M, cyklistického G, kláru G, nosorožce G, praporem G, útěchou G, mlhou G, třesk G
50000-75000  kafíčko G, domluvy G, nevole G, zakončí G, korunoval G, nehrálo G, nadváha G, oddechnout G, garantované G, izraelskými G, fígl G, podporujete G, zdobeny G, jihoamerických G, lživé G, asimov M, ženíšek M, malebná G, promlouvat G, botanika G, advokátních G, mašín M, odešlete G, rodičovského G, doběhne G
75000-100000 honeywell B, hopper M, nekalých G, čelenku G, deformované G, moták G, raspenava M, šmouhy G, ložisky G, častém G, glykosidy M, mušek G, autorovu G, početným G, traktem G, demografickou G, nevraživosti G, amfetamin G, zatažená G, klenotník G, geralt M, ohodnocením G, dořešení G, hraničnímu G, soustřeďovat G
100000-150000 vystačíte G, rozepsal G, wot M, přisedl G, aukro G, depozitu G, chlazeného G, folklórem G, sudích G, kolmých G, statistickými G, merci M, požitkem G, komiksovým G, pravopisných G, zapla G, prosvětluje G, kloboucích G, lidoopi G, modrobílý G, buržoazii G, špás G, anachronismus G, stachelberg M, barcelonském G
150000-200000 rovensku M, lávě G, neobjasněných G, omdlím G, rubina M, štěňátek G, hajným G, psychopatie G, airsoftové G, formanovi M, nezastává G, pojištěnou G, vízy G, vrahovice M, vyzkoušíš G, istanbulském G, oportunismus G, bulharskými G, ovlivnitelná G, prohnilého G, vestavbu G, oceníš G, rozrušování G, pavlenka M, prin B
200000-300000 pigmentová G, relaxoval G, orest B, nezvyšovat G, nezapamatoval G, merchandise M, jilmů G, náctiletého G, popošel G, spolupodíleli G, macnamara B, segwaye M, vypouštějící G, sklápěcími G, swordfish B, azylanti G, biochemička G, magyarok B, malory B, smlsnul G, habyarimana B, janouškové M, spravujících G, fyziologickému G, tancujou G
300000-400000 dostavá B, pyrenejemi G, přeběhnu G, zuboženého G, geomorfologii M, silem B, pavoučci G, protistranické M, meena B, oblety M, vinet B, přivlastnilo G, espinosová M, pseudorománskou M, opomenuti B, sadova M, thomsonův M, kurata B, trnový G, vyzářený M, fairweather B, povážlivý G, tlustších G, elevators B, telemarkové M
400000-500000 clasic B, hýbnout G, skleníkovou G, ultimy M, charakterističtí G, svěsila G, ušklíbá G, hromadnej G, klapnou G, mezoteliomu M, áva B, finišer M, megaphone B, clintonovo M, mandolin M, přišlých M, libore G, nesoudní M, zprošťují G, ututlá G, civilizovaněji G, cranbrook B, leváren G, postřicích M, válčete G
500000-596230 araujo B, ostrostřelcem G, vitariánská M, blízk B, neznášov B, rwc B, tew B, vyčesávají G, záchraného B, zanechanými G, otročího G, arvi B, plaintext B, translokaci M, volnýma G, fyzicích M, miskovitého M, zvlastní B, rafinačních M, bombastičností M, clearence B, suplementací M, clinche B, nachytávka G, vicepremiéři G
```
