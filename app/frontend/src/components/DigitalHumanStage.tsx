import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import TeacherAvatar, { type MiraGesture, type MiraMood } from "./TeacherAvatar";

/* 应急占位：用 three.js 基础几何拼一个女性英语老师。
   不是授权 GLB，但看得见、会动；等你给正式 .glb/.vrm 后替换 buildAvatar。 */

function mat(color: string, rough = 0.7) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
}
function box(w: number, h: number, d: number, color: string) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}
function sphere(r: number, color: string, seg = 28) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat(color, 0.6));
}
function cyl(rt: number, rb: number, h: number, color: string) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 24), mat(color));
}

function buildAvatar() {
  const rig = new THREE.Group();
  const head = new THREE.Group();
  const body = new THREE.Group();
  rig.add(body, head);

  const SKIN = "#d9a57c";
  const HAIR = "#2c211b";
  const BLAZER = "#35404a";
  const SHIRT = "#efe6d5";
  const SKIRT = "#2a2f36";
  const EYE = "#241b16";
  const LIP = "#b85a4d";
  const ACCENT = "#d7a04a";

  // 头
  const skull = sphere(0.155, SKIN, 32);
  skull.position.y = 1.5;
  head.add(skull);
  const hairBack = sphere(0.165, HAIR, 32);
  hairBack.position.set(0, 1.53, -0.03);
  hairBack.scale.set(1.02, 0.86, 1.02);
  head.add(hairBack);
  const hairTop = sphere(0.16, HAIR, 32);
  hairTop.position.set(0, 1.6, 0.01);
  hairTop.scale.set(1.05, 0.5, 1.02);
  head.add(hairTop);
  const hairSideL = sphere(0.07, HAIR, 24);
  hairSideL.position.set(-0.13, 1.45, 0.02);
  head.add(hairSideL);
  const hairSideR = hairSideL.clone();
  hairSideR.position.x = 0.13;
  head.add(hairSideR);

  // 眼镜（细框）
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2c211b, roughness: 0.4, metalness: 0.2 });
  const lensL = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 12, 28), glassMat);
  lensL.position.set(-0.055, 1.52, 0.14);
  const lensR = lensL.clone();
  lensR.position.x = 0.055;
  head.add(lensL, lensR);
  const bridge = box(0.05, 0.008, 0.008, "#2c211b");
  bridge.position.set(0, 1.52, 0.14);
  head.add(bridge);

  // 眼睛 / 眉 / 嘴
  const eyes: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const eye = sphere(0.02, EYE, 16);
    eye.position.set(0.055 * sx, 1.52, 0.145);
    eye.scale.set(1, 1.25, 0.6);
    head.add(eye);
    eyes.push(eye);
    const brow = box(0.055, 0.008, 0.006, HAIR);
    brow.position.set(0.055 * sx, 1.565, 0.15);
    head.add(brow);
  }
  const mouth = box(0.06, 0.015, 0.008, LIP);
  mouth.position.set(0, 1.435, 0.155);
  head.add(mouth);

  // 颈 + 躯干
  const neck = cyl(0.035, 0.04, 0.1, SKIN);
  neck.position.y = 1.32;
  body.add(neck);
  const torso = box(0.5, 0.62, 0.26, BLAZER);
  torso.position.y = 1.0;
  body.add(torso);
  const shirt = box(0.34, 0.4, 0.05, SHIRT);
  shirt.position.set(0, 1.05, 0.12);
  body.add(shirt);
  const lapelL = box(0.1, 0.28, 0.03, "#2a333c");
  lapelL.position.set(-0.13, 1.02, 0.135);
  lapelL.rotation.z = 0.25;
  body.add(lapelL);
  const lapelR = lapelL.clone();
  lapelR.position.x = 0.13;
  lapelR.rotation.z = -0.25;
  body.add(lapelR);
  const skirt = cyl(0.19, 0.24, 0.32, SKIRT);
  skirt.position.y = 0.66;
  body.add(skirt);

  // 手臂
  for (const s of [-1, 1]) {
    const arm = cyl(0.045, 0.035, 0.55, BLAZER);
    arm.position.set(0.29 * s, 1.05, 0);
    arm.rotation.z = s * 0.12;
    body.add(arm);
    const hand = sphere(0.05, SKIN, 20);
    hand.position.set(0.31 * s, 0.72, 0.01);
    body.add(hand);
  }

  // 腿 + 鞋
  for (const s of [-1, 1]) {
    const leg = cyl(0.055, 0.045, 0.62, SKIN);
    leg.position.set(0.09 * s, 0.32, 0);
    body.add(leg);
    const shoe = box(0.11, 0.06, 0.2, "#1d2024");
    shoe.position.set(0.09 * s, 0.02, 0.03);
    body.add(shoe);
  }

  // 胸针
  const pin = sphere(0.02, ACCENT, 14);
  pin.position.set(0, 1.18, 0.14);
  body.add(pin);

  rig.traverse((o) => { o.frustumCulled = false; });
  return { rig, head, mouth, eyes };
}

export default function DigitalHumanStage({
  mood = "warm", gesture = "none", speaking = false, amplitude = 0, listening = false,
}: {
  mood?: MiraMood; gesture?: MiraGesture; speaking?: boolean; amplitude?: number; listening?: boolean;
}) {
  const boxEl = useRef<HTMLDivElement>(null);
  const ampRef = useRef(0);
  const [failed, setFailed] = useState(false);
  ampRef.current = amplitude;

  useEffect(() => {
    const el = boxEl.current;
    if (!el) return;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let model: THREE.Group | null = null;
    let head: THREE.Group | null = null;
    let mouth: THREE.Mesh | null = null;
    let eyes: THREE.Mesh[] = [];
    const clock = new THREE.Clock();
    let raf = 0;

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setFailed(true);
      return;
    }
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

    const built = buildAvatar();
    model = built.rig;
    head = built.head;
    mouth = built.mouth;
    eyes = built.eyes;
    scene.add(model);

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
      const targetHeight = visibleH * 0.85;
      const targetWidth = (w / h) * targetHeight;
      const scale = Math.min(targetWidth / size.x, targetHeight / size.y);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.1);
      void dt;
      const amp = ampRef.current;
      if (mouth) mouth.scale.y = 0.35 + amp * 2.2;
      if (eyes) {
        const t = (performance.now() % 5200) / 5200;
        const blink = t > 0.985 ? 0.15 : 1;
        eyes.forEach((e) => { e.scale.y = blink; });
      }
      if (head) {
        const breathe = Math.sin(performance.now() / 2200) * 0.01;
        head.rotation.x = head.userData.nodX || 0;
        head.rotation.z = head.userData.nodZ || 0;
        head.position.y = breathe;
      }
      renderer!.render(scene, camera);
    };

    layout();
    raf = requestAnimationFrame(tick);
    observer = new ResizeObserver(layout);
    observer.observe(el);

    let resetTimer = 0;
    const onGesture = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!head) return;
      head.userData.nodX = 0;
      head.userData.nodZ = 0;
      if (d.gesture === "nod") head.userData.nodX = 0.35;
      else if (d.gesture === "lean_in") { head.userData.nodX = 0.2; head.userData.nodZ = 0.1; }
      else if (d.gesture === "chin_tap" || d.mood === "thinking") head.userData.nodZ = 0.25;
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        if (head) { head.userData.nodX = 0; head.userData.nodZ = 0; }
      }, 900);
    };
    window.addEventListener("mira-gesture", onGesture);

    return () => {
      window.clearTimeout(resetTimer);
      window.removeEventListener("mira-gesture", onGesture);
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) { mesh.geometry?.dispose(); (mesh.material as THREE.Material)?.dispose?.(); }
      });
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  // 点头 / 前倾 / 侧头
  useEffect(() => {
    const model = boxEl.current?.querySelector("canvas");
    void model;
    const nodes = document.querySelectorAll<HTMLElement>(".digital-stage");
    void nodes;
    // 头部姿态在渲染循环里读取 userData；这里通过自定义事件更新
    const ev = new CustomEvent("mira-gesture", { detail: { gesture, mood } });
    window.dispatchEvent(ev);
  }, [gesture, mood]);

  if (failed) {
    return <TeacherAvatar mood={mood} gesture={gesture} speaking={speaking} amplitude={amplitude} listening={listening} />;
  }
  return <div className="digital-stage" ref={boxEl} />;
}
