import { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";
import * as PIXI from "pixi.js";
import TeacherAvatar, { type MiraGesture, type MiraMood } from "./TeacherAvatar";

// Cubism 运行时需要挂在 window.PIXI 上
(window as any).PIXI = PIXI;

let cubism4Promise: Promise<void> | null = null;
function loadCubismRuntime(): Promise<void> {
  if ((window as any).Live2DCubismCore) return Promise.resolve();
  if (!cubism4Promise) {
    cubism4Promise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/live2d/lib/live2dcubismcore.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("cubism core load failed"));
      document.head.appendChild(s);
    });
  }
  return cubism4Promise;
}

const EXPRESSION: Record<MiraMood, string> = {
  warm: "exp_01",
  curious: "exp_03",
  thinking: "exp_03",
  encouraging: "exp_02",
  correcting: "exp_04",
  celebrating: "exp_07",
  concerned: "exp_05",
  confused: "exp_06",
};

const MOTION: Record<MiraGesture, [string, number]> = {
  none: ["Idle", 0],
  nod: ["TapBody", 1],
  lean_in: ["TapBody", 2],
  open_palm: ["TapBody", 3],
  point_up: ["TapBody", 4],
  hand_on_chest: ["TapBody", 1],
  shrug: ["TapBody", 5],
  thumbs_up: ["TapBody", 2],
  wave: ["TapBody", 4],
  chin_tap: ["TapBody", 0],
};

export default function Live2DStage({
  mood = "warm", gesture = "none", speaking = false, amplitude = 0, listening = false,
}: {
  mood?: MiraMood; gesture?: MiraGesture; speaking?: boolean; amplitude?: number; listening?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const appRef = useRef<Application | null>(null);
  const ampRef = useRef(0);
  const [failed, setFailed] = useState(false);

  ampRef.current = amplitude;

  useEffect(() => {
    let app: Application | null = null;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv) return;

    (async () => {
      try {
        await loadCubismRuntime();
        app = new Application({
          view: cv,
          transparent: true,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
        });
        appRef.current = app;
        const model = await Live2DModel.from("/live2d/mao/Mao.model3.json", {
          autoInteract: false,
        });
        if (disposed) { model.destroy(); app.destroy(true, true); return; }
        model.anchor.set(0.5, 0.5);
        app.stage.addChild(model);
        modelRef.current = model;
        try { model.motion("Idle", 0); } catch { /* motion group may differ */ }

        const layout = () => {
          const w = el.clientWidth || 400;
          const h = el.clientHeight || 500;
          app!.renderer.resize(w, h);
          const mw = model.width || 300;
          const mh = model.height || 450;
          const scale = Math.min(w / mw, h / mh) * 0.9;
          model.scale.set(scale);
          model.position.set(w / 2, h * 0.5);
        };
        layout();
        observer = new ResizeObserver(layout);
        observer.observe(el);

        // 口型：跟随 TTS 振幅
        const tick = () => {
          if (disposed || !modelRef.current) return;
          const core = (modelRef.current as any).internalModel?.coreModel;
          const v = ampRef.current;
          try {
            core?.setParameterValueById?.("PARAM_MOUTH_OPEN_Y", v);
            core?.setParameterValueById?.("ParamMouthOpenY", v);
          } catch { /* ignore */ }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      try {
        modelRef.current?.destroy();
      } catch { /* ignore */ }
      modelRef.current = null;
      try { appRef.current?.destroy(true, true); } catch { /* ignore */ }
      appRef.current = null;
    };
  }, []);

  // 表情 / 动作：由对话意图驱动
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const expr = EXPRESSION[mood];
    if (expr) { try { model.expression(expr); } catch { /* ignore */ } }
    if (gesture && gesture !== "none") {
      const [group, idx] = MOTION[gesture] || MOTION.none;
      try { model.motion(group, idx); } catch { /* ignore */ }
    }
  }, [mood, gesture]);

  if (failed) {
    return <TeacherAvatar mood={mood} gesture={gesture} speaking={speaking} amplitude={amplitude} listening={listening} />;
  }

  return (
    <div className="live2d-stage" ref={box}>
      <canvas ref={canvas} />
      {listening && <span className="live2d-ring" />}
    </div>
  );
}
