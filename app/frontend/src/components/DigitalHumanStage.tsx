import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import TeacherAvatar, { type MiraGesture, type MiraMood } from "./TeacherAvatar";

/** 数字人舞台：先用 three.js 官方示例的 Ready Player Me 人物占位，
    后续换成用户提供的 .glb / .vrm。口型由 TTS 振幅驱动。 */
export default function DigitalHumanStage({
  mood = "warm", gesture = "none", speaking = false, amplitude = 0, listening = false,
}: {
  mood?: MiraMood; gesture?: MiraGesture; speaking?: boolean; amplitude?: number; listening?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ampRef = useRef(0);
  const headRef = useRef<THREE.Object3D | null>(null);
  const [failed, setFailed] = useState(false);
  ampRef.current = amplitude;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let model: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const clock = new THREE.Clock();
    let raf = 0;

    const renderer_ = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer = renderer_;
    renderer_.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer_.setClearColor(0x000000, 0);
    el.appendChild(renderer_.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.25, 1.9);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x20241f, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.5, 2.5, 2.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xd7a04a, 0.8);
    rim.position.set(-1.6, 1.2, -1.4);
    scene.add(rim);

    const morphs: { open?: number; blink?: number; smile?: number } = {};
    const meshMorphs: THREE.Mesh[] = [];

    const layout = () => {
      const w = el.clientWidth || 400;
      const h = el.clientHeight || 500;
      renderer_?.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!model) return;
      const box3 = new THREE.Box3().setFromObject(model);
      const size = box3.getSize(new THREE.Vector3());
      const center = box3.getCenter(new THREE.Vector3());
      const scale = Math.min(w / size.x, h / size.y) * 0.82;
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.1);
      if (mixer) mixer.update(dt);
      if (renderer_) renderer_.render(scene, camera);

      const amp = ampRef.current;
      for (const m of meshMorphs) {
        const dict = m.morphTargetDictionary;
        const inf = m.morphTargetInfluences;
        if (!dict || !inf) continue;
        if (morphs.open != null) inf[morphs.open] = THREE.MathUtils.lerp(inf[morphs.open], amp * 0.85, 0.5);
        if (morphs.blink != null) {
          const t = (performance.now() % 5200) / 5200;
          const blink = t > 0.985 ? 1 : 0;
          inf[morphs.blink] = THREE.MathUtils.lerp(inf[morphs.blink], blink, 0.4);
        }
        if (morphs.smile != null && mood === "celebrating") {
          inf[morphs.smile] = THREE.MathUtils.lerp(inf[morphs.smile], 0.7, 0.3);
        }
      }
    };

    new GLTFLoader().load(
      "/avatar/readyplayer-me.glb",
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        scene.add(model);
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            const mesh = o as THREE.Mesh;
            mesh.frustumCulled = false;
            if (mesh.morphTargetDictionary) {
              meshMorphs.push(mesh);
              if (morphs.open == null) {
                morphs.open = mesh.morphTargetDictionary["viseme_aa"] ?? mesh.morphTargetDictionary["mouthOpen"] ?? mesh.morphTargetDictionary["jawOpen"];
              }
              if (morphs.blink == null) {
                morphs.blink = mesh.morphTargetDictionary["eyesClosed"] ?? mesh.morphTargetDictionary["blink"] ?? mesh.morphTargetDictionary["eyeBlink"];
              }
              if (morphs.smile == null) {
                morphs.smile = mesh.morphTargetDictionary["mouthSmile"] ?? mesh.morphTargetDictionary["smile"];
              }
            }
          }
          if ((o as THREE.Bone).isBone && /head/i.test(o.name)) headRef.current = o;
        });
        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);
        }
        layout();
        raf = requestAnimationFrame(tick);
      },
      undefined,
      () => { if (!disposed) setFailed(true); },
    );

    observer = new ResizeObserver(layout);
    observer.observe(el);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      if (model) {
        scene.remove(model);
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) { mesh.geometry?.dispose(); (mesh.material as THREE.Material)?.dispose?.(); }
        });
      }
      renderer_?.dispose();
      renderer_?.domElement.remove();
    };
  }, []);

  // 简单肢体：点头 / 前倾 / 侧头；真正数字人接入后再细化骨骼控制
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    if (gesture === "nod") head.rotation.x = 0.35;
    else if (gesture === "lean_in") { head.rotation.x = 0.2; head.rotation.z = 0.1; }
    else if (gesture === "chin_tap" || mood === "thinking") head.rotation.z = 0.25;
    const t = window.setTimeout(() => {
      head.rotation.x = 0;
      head.rotation.z = 0;
    }, 900);
    return () => window.clearTimeout(t);
  }, [gesture, mood]);

  if (failed) {
    return <TeacherAvatar mood={mood} gesture={gesture} speaking={speaking} amplitude={amplitude} listening={listening} />;
  }

  return <div className="digital-stage" ref={box} />;
}
