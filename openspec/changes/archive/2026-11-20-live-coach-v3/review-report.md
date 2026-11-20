# Review Report — live-coach-v3

## Overall Verdict: PASS

- Streaming SSE keeps English-only guard: CJK tokens are dropped, final reply falls back if needed.
- Model-level barge-in aborts the in-flight fetch and preserves partial text; VAD continues to capture the interrupting utterance.
- Mao (Cubism 4) loads via lazy `cubism4` chunk with core runtime loaded globally; SVG fallback remains.
- Tomorrow goal is written through `models.set_goal` with `for_date = local_date(1)`.

## Known limits
- ASR remains upload-based (DeepSeek has no streaming ASR); "full-duplex" covers generation/playback interruption.
- Mao is a sample model, not a custom adult-teacher model; commercial use needs a licensed asset.
