# Benchmarks

How accurate and how fast recognition and speaker separation are, measured on **public data**
so that anyone can run the same thing and check. Most other figures in these docs were
measured on real meetings, which cannot be published; this page is the part that can be
reproduced.

The scripts are in [`bench/`](../bench). They call the transcription service's and the
diarizer's own code rather than copying their settings, so what is measured is what ships.
The figures below are from one machine on one date (2026-11-09, v4.8.0 plus the changes
merged since, including the fix to sherpa-onnx's merge step described below), and the machine
is named with them.

**In short**

| | GPU path | CPU path |
| --- | --- | --- |
| Japanese recognition of a whole recording, character error rate | **14.1%** (faster-whisper, CUDA) | **11.2%** (whisper.cpp) |
| Recognition speed, as a fraction of the audio's length | **0.034** — an hour in about 2 minutes | **0.72** — an hour in about 43 minutes |
| Same audio three times | identical (0.00% apart) | — |
| Speaker separation, clear lines given to the right person (English) | **90.5%** (pyannote) | **86.1%** (sherpa-onnx) |
| Speed of speaker separation | 0.066 — an hour in about 4 minutes | 0.14 — an hour in about 8 minutes |

Three things here were not expected, and each is explained below:

- The CPU path recognises *better* than the GPU path, and the cause is one setting
  ([why](#what-the-gap-between-the-paths-is)).
- The run-to-run variation recorded in
  [Design decisions](design-decisions.md#transcription-is-not-reproducible-and-the-cause-is-the-temperature-fallback)
  does not appear on this material at all ([why](#same-audio-three-times)).
- Speaker separation on the CPU path did little better than separating no one, and the cause
  was Voxinq's own step after sherpa-onnx, not the model. Fixed, it comes within a point of
  pyannote ([why](#what-the-results-say)).

**The machine:** Intel Core i7-13620H (10 cores, 16 threads), NVIDIA GeForce RTX 4060 Laptop
GPU (8 GB), Windows 11. faster-whisper 1.2.1 on CTranslate2 4.8.0, pywhispercpp 1.5.1,
pyannote.audio 4.0.7, sherpa-onnx 2.0.1. The CPU path used 8 threads, which is what the
service picks on this machine (half the logical cores).

## Recognition (Japanese)

### What was measured

**Data:** 300 clips drawn at random (fixed seed) from the ReazonSpeech test set — 30.8 minutes
of Japanese speech from television, each with a human transcription. Television is not a
meeting: it is clearer, better miked and rarely spoken over. Treat these as figures for clean
speech; a real meeting room is harder.

**Model:** `large-v3-turbo`, the default, on both paths. The GPU path runs CTranslate2 weights
at `int8_float16`; the CPU path runs whisper.cpp's own weights of the same model.

**Two passes**, because a meeting is recognised in two ways:

- **Clips, one at a time** — each clip given to the service the way a line is during a
  recording (`transcribe_segment_ex`: the live settings and the filters that drop silence and
  the phrases Whisper invents over it). This leaves out the step that cuts a recording into
  lines; each clip is one line.
- **Long file** — the 300 clips joined into one 33-minute file, half a second apart, and
  recognised the way a meeting is after it ends or when it is re-transcribed: the same call,
  settings and filters as the service's re-transcription job. The GPU path ran this three
  times.

**Score:** character error rate (CER) — the edits needed to turn the output into the
reference, over the reference's length. Both are normalised first (NFKC, lower case, letters
and digits only), so punctuation, spacing and full-width digits are not counted. What *is*
counted: a word written in kanji in one and kana in the other (美味しい against おいしい) is an
error, though a reader would not call it one.

### Results

| | CER, clips | CER, long file | Speed, clips | Speed, long file |
| --- | --- | --- | --- | --- |
| faster-whisper, CUDA (GPU path) | 15.0% | **14.1%** | 0.070 | **0.034** |
| whisper.cpp, CPU (CPU path) | 10.6% | **11.2%** | 2.49 | **0.72** |

Speed is time taken over the audio's length: below 1 is faster than real time. Loading the
model took 8 s on the GPU path and 248 s on the CPU path, the first time only (most of it a
1.5 GB download); it is not in the speed figures.

**The CPU path is too slow for clips and fast enough for a file.** At 2.49 it would fall
further behind with every line of a live meeting, which is why a machine without a GPU
[does not try](design-decisions.md#so-a-host-that-cannot-keep-up-does-not-try) and recognises
the recording after the meeting instead. A whole file goes much faster, at 0.72 — so an hour's
meeting is text about 43 minutes after it ends.

### What the gap between the paths is

The two paths run the same model, so a gap of three to four points needs explaining. Two
differences were tested by changing one at a time on the GPU path:

| GPU path, changed | CER, clips | CER, long file |
| --- | --- | --- |
| as shipped | 15.0% | 14.1% |
| weights at `float16` rather than `int8_float16` | 14.8% | 14.3% |
| faster-whisper's own voice detector off | **12.2%** | **10.3%** |

**The weights are not it.** **The voice detector is.** On faster-whisper the service turns on
its built-in Silero voice detector (`vad_filter=True`) inside every piece it recognises; the
CPU path has no such step. It is there to stop Whisper inventing text over silence
([the two layers](design-decisions.md#vad-is-two-layers-both-already-present)), and on this
material it gets in the way in two directions:

- **It drops speech.** Over the long file the output comes out 3% shorter than the reference
  with it on, and the same length with it off. Among the clips, 21 outputs fall below 80% of
  the reference's length with it on, 9 with it off — the start of a sentence, or a phrase in
  the middle, gone.
- **It lifts faint speech into the text.** Some clips carry a few words of the neighbouring
  sentence, quietly, at an edge. Whisper given the whole clip passes over them; given only the
  pieces the detector kept, it transcribes them (39 outputs over 120% of the reference's length
  with it on, 32 with it off).

Turned off, the GPU path matches the CPU path.

**This page does not change the setting**, and the figures above are as shipped. The detector
was turned on for silence inside meeting audio, and television clips have almost none — so
the half of the trade it pays for is not tested here. Whether to loosen or remove it needs the
same comparison on real meetings with their pauses, and is a separate change.

Those edge words are also part of what remains for every path: the reference does not include
them, so a path that transcribes them is charged for it.

### Same audio three times

The long file was recognised three times on the GPU path, and the three outputs were
**identical** — 0.00% of characters apart.

That is not a contradiction of the 15% recorded in
[Design decisions](design-decisions.md#transcription-is-not-reproducible-and-the-cause-is-the-temperature-fallback),
and it says where that variation comes from. Whisper only samples — the step that draws random
numbers — when a decode fails its checks for repetition or low confidence. Clean, close-miked
speech almost never fails them; a real meeting does, often. So the variation is a property of
the audio: none on clear speech, a sixth of the text on the meeting where it was measured.
Anyone comparing two settings on meeting audio still needs that control.

## Speaker separation (English)

### What was measured

**Data:** four meetings from the AMI corpus's test set — `EN2002a`, `ES2004a`, `IS1009a` and
`TS3003a` — 92 minutes in all, four people in each, in English. The audio is AMI's headset mix:
everyone's close-talking microphone summed into one track, so it is cleaner than one microphone
in the middle of a table, and full of people speaking over each other. The reference, who spoke
when, comes from AMI's own word-level annotation.

**What is asked of the diarizer** is what Voxinq asks of it: not to draw speaker turns, but to
name the speaker of each line of a transcript it already has. So the lines are taken from the
reference — every stretch of one person speaking that is at least half a second long, 1,006 in
all — and handed to `diarization/diarize.py` as the transcript. Recognition plays no part.
The diarizer gives each line the speaker it shares the most time with, as it does for a real
meeting.

**Score:** the share of lines given to the right person, after the best one-to-one pairing of
the diarizer's labels with the four people. Reported by count and by length, and split in two:
**clear lines**, and lines **at least half spoken over** by someone else. In these meetings that
second kind is 45% of the lines — mostly a "yeah" or a "mm" inside someone else's sentence.

Each meeting was run twice: told there are four people, as Voxinq is when four participants
are ticked as expected to speak, and not told.

### Results

| | pyannote (GPU path) | sherpa-onnx (CPU path) | everyone given to whoever talks most |
| --- | --- | --- | --- |
| Clear lines, right | **90.5%** | 86.1% | — |
| All lines, right by length | **85.3%** | 84.5% | 49.7% |
| All lines, right by count | 61.6% | 58.4% | 36.4% |
| Lines spoken over, right | 26.2% | 24.4% | — |
| Not told the count: by length | 85.3% | 84.1% | |
| Speed, as a fraction of the audio's length | 0.066 | 0.14 | |

By meeting, told the count, by length:

| | pyannote | sherpa-onnx | sherpa-onnx before the fix | whoever talks most |
| --- | --- | --- | --- | --- |
| `EN2002a` (36 min) | 79.0% | 78.7% | 35.1% | 35.1% |
| `ES2004a` (17 min) | 88.7% | 87.9% | 56.5% | 42.6% |
| `IS1009a` (14 min) | 87.9% | 85.2% | 66.5% | 60.2% |
| `TS3003a` (25 min) | 95.9% | 95.0% | 91.6% | 84.5% |

The last column is the score for giving every line to the person who talks most: what a
diarizer that separated no one at all would get. It is high where one person dominates, as in
`TS3003a`, so a figure only means something next to it. Before the fix, sherpa-onnx scored
54.4% by length overall against that baseline's 49.7%, 53.3% of clear lines, and 52.2% when not
told the count.

### What the results say

**pyannote names nine clear lines in ten correctly**, with or without the count. It found four
people on its own in three of the meetings, and in the fourth a fifth with a few lines; telling
it the count made no difference worth reporting. An hour of audio takes about four minutes.

**A line spoken over is right about one time in four** — chance, among four people — on both
backends. Each gives every moment to one speaker, so a "yeah" inside someone else's sentence
goes to the person whose sentence it is. In Voxinq's own transcripts such a word is usually not
a line of its own: lines are cut where the recording pauses, and there is no pause in the middle
of someone else's sentence. So the clear-line figure is the nearer one to what a transcript
shows; the all-lines figure is what it is when people talk over each other.

**sherpa-onnx comes within a point of pyannote** on these meetings: 84.5% by length against
85.3%, and 86.1% of clear lines against 90.5%. Not told the count, it found four people in
three of the meetings and five in `EN2002a`, at 84.1%.

Until this was fixed it did little better than separating no one: 54.4% by length, and in
`EN2002a` it put 521 of 523 lines on one person even when told there were four. The fault was
in Voxinq's own step after sherpa, not in sherpa or its voice model:

- **What sherpa returns is sound.** It splits a meeting into far more clusters than there are
  people — 136 for the four in `EN2002a` — but the clusters are nearly pure: giving each turn
  to whoever the reference says spoke most of it, 91–98% of a cluster's speech is one person's.
- **The merge that followed was not.** Voxinq joined the two most alike clusters, again and
  again, until the count was reached. A cluster of one or two turns — crosstalk, a laugh, two
  voices at once — is alike to nobody, so it was always joined last, and real people were joined
  first to make room for it: four labels, three of them for a line each.
- **The fix** merges only what is clearly one person — clusters whose centroids are at least
  0.82 alike — and then decides who the speakers are by how much each group says: told the
  count, the groups with the most speech; not told, every group with at least 10 seconds and 1%
  of the speech. Every other cluster goes to the speaker it is nearest. In these meetings one
  person's clusters were 0.88–0.97 alike and different people's 0.5–0.75, though one pair
  reached 0.81; any threshold from 0.80 to 0.85 gave the figures above, and 0.78 joined two
  people in `EN2002a`.
- **The other fix tried** was to give the count to sherpa's own clustering and skip the merge.
  That reached 76.3% by length: better than before, worse than the fixed merge, so the count
  still goes to the merge.

The threshold was chosen on these same four meetings, so they are not an independent test of
it. Two real Japanese meetings that took no part in choosing it are:

| | before the fix | after |
| --- | --- | --- |
| 12 minutes, 3 people, told the count | 86% of lines agree with pyannote, 2 speakers found | **89%**, 3 found |
| 12 minutes, 3 people, not told | 86%, 2 found | **89%**, 4 found (the fourth with 4 lines) |
| 41 minutes, 4 people, told the count | 62%, 2 speakers found | **85%**, 4 found |
| 41 minutes, 4 people, not told | 35% — every line on one speaker | **85%**, 4 found |

The 41-minute meeting shows the collapse
[recorded in Design decisions](design-decisions.md#diarization-has-two-backends-chosen-by-the-hardware)
for a 49-minute one, whose recording no longer exists to be run again. With a GPU, pyannote is chosen
anyway; without one, the gap that remains is a few points, and `DIA_BACKEND=pyannote` still
closes it at the price of separation taking about as long as the meeting.

**Limits:** four meetings, in English, from a headset mix, plus two Japanese meetings scored
against pyannote rather than against people. More real Japanese meetings, measured on
recordings that cannot be published, are in
[Design decisions](design-decisions.md#a-line-that-holds-two-speakers-is-divided-between-them).

## Run it yourself

You need the repository with both Python environments set up as in [Setup](setup.md)
(`stt-service/.venv` and `diarization/.venv`), `ffmpeg` on the path, and about 3 GB of disk.

1. **Get the data.** None of it is in the repository.
   - ReazonSpeech test set: the two parquet files from
     [japanese-asr/ja_asr.reazonspeech_test](https://huggingface.co/datasets/japanese-asr/ja_asr.reazonspeech_test)
     (`data/test-00000-of-00002.parquet` and `-00001-`), into one directory.
   - AMI: for each of `EN2002a`, `ES2004a`, `IS1009a` and `TS3003a`, the headset mix
     `https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/<m>/audio/<m>.Mix-Headset.wav`
     saved as `<m>.wav`, and `only_words/rttms/test/<m>.rttm` from
     [BUTSpeechFIT/AMI-diarization-setup](https://github.com/BUTSpeechFIT/AMI-diarization-setup),
     all into one directory.
2. **Prepare it** (needs `pyarrow`: `pip install pyarrow` in the service's environment):
   `stt-service/.venv/Scripts/python bench/prepare.py --reazon <dir> --ami <dir>` — writes
   `bench/data/`, which is ignored by git.
3. **Recognition:** `stt-service/.venv/Scripts/python bench/asr.py --backend faster-whisper`
   and `--backend whisper.cpp --runs 1`, then
   `stt-service/.venv/Scripts/python bench/score_asr.py bench/results/asr-*.json`.
4. **Speaker separation:** `diarization/.venv/Scripts/python bench/diarize.py --backend pyannote`
   and `--backend sherpa`. pyannote needs the gated model already downloaded (or `HF_TOKEN`);
   sherpa needs `diarization/fetch_models.py` run once.

On Linux and macOS the environments' Python is `.venv/bin/python`. The clip sample is fixed by
a seed in `prepare.py`, so the same 300 clips come out on any machine. Speeds will differ with
the hardware; on a CUDA machine the recognition outputs should match closely, not exactly.

## The data and its terms

- **ReazonSpeech** (Reazon Holdings), published under
  [CDLA-Sharing-1.0](https://cdla.dev/sharing-1-0/) with a condition that it be used only as
  Article 30-4 of the Japanese Copyright Act allows — analysis such as this. The copy used is
  the test split as mirrored by `japanese-asr`; its card states no terms of its own, so the
  original's apply. Nothing from it is redistributed here, and no transcript produced from it is
  published.
- **AMI Meeting Corpus** (the AMI Consortium), audio and annotations under
  [CC BY 4.0](https://groups.inf.ed.ac.uk/ami/corpus/license.shtml).
- **AMI-diarization-setup** (Brno University of Technology), the speaker references, under
  Apache-2.0: who spoke when, from AMI's word-level annotations, counting words only.
