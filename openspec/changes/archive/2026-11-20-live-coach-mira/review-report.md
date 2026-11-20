# Review Report — live-coach-mira

## Overall Verdict: PASS

- Mira entry is a sidebar card below the nav, not an 8th nav item; active state is clear.
- English-only is enforced at input, prompt, output, TTS boundary and history; Chinese input does not reach the LLM.
- LearnerBrief is built in English (no Chinese labels/glosses) and includes goal, six metrics, weak hearing, deaf words, recent errors, pronunciation issues, scenario history, recitation level.
- Avatar is layered SVG with head/torso/arms/hands, mood expressions, amplitude-driven mouth, gesture classes and reduced-motion fallback.
- Live room supports text fallback and automatic VAD voice turns; teacher audio uses server TTS with browser fallback.
- No persistence of coach conversations in MVP; no Today 60-minute coupling.

## Known limits
- Turn-based MVP, not full duplex/barge-in.
- No camera/emotion recognition.
- Conversation history is current session only.
