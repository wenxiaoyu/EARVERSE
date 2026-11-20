# Review Report — live-coach-v2

## Overall Verdict: PASS

- Barge-in is implemented client-side: mic stays on while Mira speaks; first user speech stops TTS immediately and continues recording the same utterance.
- VAD gate is raised while speaking (0.035) to reduce speaker-echo false positives; browser echo cancellation is requested.
- Live2D is lazily loaded so pixi.js does not block first paint; mouth follows TTS amplitude; mood/gesture drive expressions and motions; SVG fallback covers load failure.
- Session debrief writes into `domain.coach` and records speaking corrections into the error history; English-only guard applies to all generated text.
- Sample Live2D model (Shizuku) is vendored with a NOTICE; commercial use needs a licensed model.

## Known limits
- ASR/LLM remain turn-based; the "full-duplex" here interrupts playback, not model generation.
- No emotion/camera input.
