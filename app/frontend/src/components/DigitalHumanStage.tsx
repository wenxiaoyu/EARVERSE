import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import TeacherAvatar, { type MiraGesture, type MiraMood } from "./TeacherAvatar";

/** 数字人舞台：加载用户提供的 GLB。口型跟随 TTS 振幅，头部随意图微动。 */
export default function DigitalHumanStage({
  mood = "warm", gesture = "none", speaking = false, amplitude = 0, listening = false,
}: {
  mood?: MiraMood; gesture?: MiraGesture; speaking?: boolean; amplitude?: number; listening?: boolean;
}) {
  const boxEl = useRef<HTMLDivElement>(null);
  const ampRef = useRef(0);
  const headRef = useRef<THREE.Object3D | null>(null);
  const [failed, setFailed] = useState(false);
  ampRef.current = amplitude;

  useEffect(() => {
    const el = boxEl.current;
    if (!el) return;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let model: THREE.Group | null = null;
    let baseY = 0;
    let raf = 0;
    let resetTimer = 0;
    const clock = new THREE.Clock();
    let mixer: THREE.AnimationMixer | null = null;
    const morphs: { open?: number; blink?: number; smile?: number } = {};
    const meshMorphs: THREE.Mesh[] = [];

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.8, 3.1);
    camera.lookAt(0, 0.8, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x20241f, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.6, 2.6, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xd7a04a, 0.9);
    rim.position.set(-1.6, 1.4, -1.2);
    scene.add(rim);

    const layout = () => {
      const w = el.clientWidth || 400;
      const h = el.clientHeight || 500;
      renderer!.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!model) return;
      const box3 = new THREE.Box3().setFromObject(model);
      const size = box3.getSize(new THREE.Vector3());
      if (size.x <= 0 || size.y <= 0) return;
      const center = box3.getCenter(new THREE.Vector3());
      const dist = camera.position.z;
      const visibleH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const targetHeight = visibleH * 0.68;
      const targetWidth = (w / h) * targetHeight;
      const scale = Math.min(targetWidth / size.x, targetHeight / size.y);
      const targetY = 0.8;
      model.scale.setScalar(scale);
      baseY = targetY - center.y * scale;
      model.position.set(-center.x * scale, baseY, -center.z * scale);
      camera.position.y = targetY;
      camera.lookAt(0, targetY, 0);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.1);
      if (mixer) mixer.update(dt);
      const amp = ampRef.current;
      const now = performance.now();
      for (const m of meshMorphs) {
        const dict = m.morphTargetDictionary;
        const inf = m.morphTargetInfluences;
        if (!dict || !inf) continue;
        if (morphs.open != null) inf[morphs.open] = THREE.MathUtils.lerp(inf[morphs.open], amp * 0.85, 0.5);
        if (morphs.blink != null) {
          const t = (performance.now() % 3200) / 3200;
          inf[morphs.blink] = t > 0.96 ? 1 : 0;
        }
        if (morphs.smile != null && mood === "celebrating") {
          inf[morphs.smile] = THREE.MathUtils.lerp(inf[morphs.smile], 0.7, 0.3);
        }
      }
      const head = headRef.current;
      const swayX = Math.sin(now / 2200) * 0.03;
      const swayY = Math.sin(now / 2800) * 0.07;
      const swayZ = Math.sin(now / 3800) * 0.025;
      const idleNod = (now % 7000) / 7000 > 0.97 ? 0.18 : 0;
      if (model) {
        model.rotation.y = swayY + (model.userData.nodY || 0);
        model.position.y = baseY + Math.sin(now / 1800) * 0.03;
      }
      if (head) {
        head.rotation.x = swayX * 4 + idleNod + (head.userData.nodX || 0);
        head.rotation.z = swayZ * 3 + (head.userData.nodZ || 0);
      } else if (model) {
        model.rotation.x = idleNod + (model.userData.nodX || 0);
        model.rotation.z = (model.userData.nodZ || 0);
      }
      renderer!.render(scene, camera);
    };

    const onGesture = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const head = headRef.current;
      if (head) {
        head.rotation.x = 0;
        head.rotation.z = 0;
        if (d.gesture === "nod") head.rotation.x = 0.3;
        else if (d.gesture === "lean_in") { head.rotation.x = 0.15; head.rotation.z = 0.08; }
        else if (d.gesture === "chin_tap" || d.mood === "thinking") head.rotation.z = 0.2;
      } else if (model) {
        model.userData.nodX = 0;
        model.userData.nodY = 0;
        model.userData.nodZ = 0;
        if (d.gesture === "nod") model.userData.nodX = 0.12;
        else if (d.gesture === "lean_in") model.userData.nodX = 0.08;
        else if (d.gesture === "chin_tap" || d.mood === "thinking") model.userData.nodY = 0.2;
      }
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        if (headRef.current) { headRef.current.rotation.x = 0; headRef.current.rotation.z = 0; }
        else if (model) { model.userData.nodX = 0; model.userData.nodY = 0; model.userData.nodZ = 0; }
      }, 900);
    };
    window.addEventListener("mira-gesture", onGesture);

    new GLTFLoader().load(
      "/avatar/brunette.glb",
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        scene.add(model);
        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model!);
          for (const clip of gltf.animations) mixer.clipAction(clip).play();
        }
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            const mesh = o as THREE.Mesh;
            mesh.frustumCulled = false;
            if (mesh.morphTargetDictionary) {
              meshMorphs.push(mesh);
              if (morphs.open == null) {
                morphs.open = mesh.morphTargetDictionary["mouthOpen"]
                  ?? mesh.morphTargetDictionary["viseme_aa"]
                  ?? mesh.morphTargetDictionary["jawOpen"]
                  ?? mesh.morphTargetDictionary["mouth_open"];
              }
              if (morphs.blink == null) {
                morphs.blink = mesh.morphTargetDictionary["eyesClosed"]
                  ?? mesh.morphTargetDictionary["blink"]
                  ?? mesh.morphTargetDictionary["eyeBlink"];
              }
              if (morphs.smile == null) {
                morphs.smile = mesh.morphTargetDictionary["mouthSmile"]
                  ?? mesh.morphTargetDictionary["smile"];
              }
            }
          }
          if ((o as THREE.Bone).isBone) {
            const bone = o as THREE.Bone;
            // 把 T/A-pose 的手臂放下来，接近自然站姿
            if (bone.name === "LeftArm") bone.rotation.z = 1.15;
            else if (bone.name === "RightArm") bone.rotation.z = -1.15;
            else if (bone.name === "LeftForeArm") bone.rotation.z = 0.35;
            else if (bone.name === "RightForeArm") bone.rotation.z = -0.35;
            if (/head|neck/i.test(bone.name)) headRef.current = bone;
          }
        });
        layout();
      },
      undefined,
      () => { if (!disposed) setFailed(true); },
    );

    observer = new ResizeObserver(layout);
    observer.observe(el);
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(resetTimer);
      window.removeEventListener("mira-gesture", onGesture);
      observer?.disconnect();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) { mesh.geometry?.dispose(); (mesh.material as THREE.Material)?.dispose?.(); }
      });
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const ev = new CustomEvent("mira-gesture", { detail: { gesture, mood } });
    window.dispatchEvent(ev);
  }, [gesture, mood]);

  if (failed) {
    return <TeacherAvatar mood={mood} gesture={gesture} speaking={speaking} amplitude={amplitude} listening={listening} />;
  }
  return <div className="digital-stage" ref={boxEl} />;
}
