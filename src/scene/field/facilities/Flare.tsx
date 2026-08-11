import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toSceneX, toSceneZ, useFieldData } from '../../../data/geo/fieldData';
import { Assembly } from '../kit/Assembly';
import { box, cone, cyl, pipe, torus, valve, type Part } from '../kit/parts';
import { surfY } from "../geology";
import { EQUIPMENT_SCALE } from "../kit/scale";

/**
 * Факельная установка — в фактической точке чертежа [4156, 2462], рядом со
 * сборным пунктом «СП Молдабек» (ТЗ §4.4.1, нитка газа).
 *
 * Факел единственный на промысле, поэтому он не инстансируется, а живёт
 * отдельным объектом с собственной анимацией: пламя и дым (§4.4.2).
 *
 * Почему пламя и дым — шейдер, а не частицы. Система частиц на пламя это
 * несколько сотен спрайтов, которые каждый кадр пересчитываются на процессоре
 * и сортируются по глубине. Здесь тот же результат даёт одна коническая
 * оболочка с искажением в вершинном шейдере и градиентом во фрагментном:
 * стоимость — один вызов отрисовки и ноль работы на процессоре, а горит оно
 * убедительнее, потому что это сплошной объём, а не облако точек.
 */

const STACK_H = 30;

/** Ствол факела с опорной фермой, растяжками, оголовком и дежурными горелками. */
function buildFlareStack(): Part[] {
  const out: Part[] = [];

  // Фундамент и опорная тумба
  out.push(box('concrete', 5.4, 0.6, 5.4, 0, 0.3, 0));
  out.push(box('concrete', 2.2, 1.2, 2.2, 0, 0.9, 0));

  // Ствол: снизу шире, кверху сужается
  out.push(cone('steel', 0.55, 0.9, STACK_H, 0, 1.5 + STACK_H / 2, 0, 0, 0, 0, 14));

  // Кольца жёсткости по стволу
  for (let i = 1; i <= 6; i++) {
    const y = 1.5 + (STACK_H * i) / 7;
    const r = 0.9 - (0.35 * i) / 7;
    out.push(torus('steelDark', r + 0.05, 0.05, 0, y, 0, Math.PI / 2));
  }

  // Оголовок с ветровым экраном и дежурными горелками
  const topY = 1.5 + STACK_H;
  out.push(cone('steelDark', 0.75, 0.55, 1.6, 0, topY + 0.8, 0, 0, 0, 0, 14));
  out.push(torus('steelDark', 0.78, 0.07, 0, topY + 1.5, 0, Math.PI / 2));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    out.push(
      cyl('steel', 0.06, 1.1, Math.cos(a) * 0.68, topY + 0.6, Math.sin(a) * 0.68, 0, 0, 0, 6),
    );
  }

  // Растяжки на три анкера — без них тридцатиметровый ствол читается как
  // воткнутая в землю палка.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const ax = Math.cos(a) * 11;
    const az = Math.sin(a) * 11;
    out.push(box('concrete', 0.7, 0.7, 0.7, ax, 0.35, az));
    out.push(pipe('steelDark', 0.035, [0, 1.5 + STACK_H * 0.62, 0], [ax, 0.7, az], 5));
    out.push(pipe('steelDark', 0.03, [0, 1.5 + STACK_H * 0.88, 0], [ax, 0.7, az], 5));
  }

  // Подводящий газопровод с гидрозатвором и задвижкой
  out.push(pipe('pipe', 0.16, [-9, 0.9, 0], [-1.4, 0.9, 0]));
  out.push(pipe('pipe', 0.16, [-1.4, 0.9, 0], [-1.4, 2.6, 0]));
  out.push(pipe('pipe', 0.14, [-1.4, 2.6, 0], [-0.35, 2.6, 0]));
  out.push(...valve(-5, 1.05, 0, 1.1));
  // Гидрозатвор — вертикальная ёмкость перед стволом
  out.push(cyl('insulation', 0.75, 2.6, -7, 2.2, 2.6, 0, 0, 0, 14));
  out.push(cone('insulation', 0.35, 0.75, 0.4, -7, 3.7, 2.6, 0, 0, 0, 14));
  out.push(pipe('pipe', 0.12, [-7, 0.9, 2.6], [-7, 0.9, 0]));

  // Ограждение зоны факела
  const R = 13;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = ((i + 1) / 16) * Math.PI * 2;
    out.push(box('steel', 0.07, 1.5, 0.07, Math.cos(a) * R, 0.75, Math.sin(a) * R));
    out.push(
      pipe(
        'steel',
        0.025,
        [Math.cos(a) * R, 1.45, Math.sin(a) * R],
        [Math.cos(b) * R, 1.45, Math.sin(b) * R],
        4,
      ),
    );
  }

  return out;
}

/**
 * Пламя. Коническая оболочка, у которой вершины гуляют по времени: чем выше
 * по факелу, тем сильнее болтанка — как и в натуре, где струя срывается на
 * турбулентность не сразу, а разогнавшись.
 */
function Flame({ y }: { y: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          uniform float uTime;
          varying float vH;
          void main() {
            vH = clamp(position.y / 11.0, 0.0, 1.0);
            vec3 p = position;
            float sway = vH * vH * 1.9;
            p.x += sin(uTime * 3.1 + position.y * 0.55) * sway;
            p.z += cos(uTime * 2.6 + position.y * 0.47) * sway;
            float pulse = 1.0 + 0.16 * sin(uTime * 7.0 + position.y * 1.4);
            p.xz *= pulse * (1.0 - vH * 0.55);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          varying float vH;
          void main() {
            // Снизу вверх: белое ядро, жёлтый, оранжевый, к срыву — красный.
            vec3 core = vec3(1.0, 0.95, 0.78);
            vec3 mid = vec3(0.98, 0.66, 0.18);
            vec3 tip = vec3(0.78, 0.22, 0.06);
            vec3 c = mix(core, mid, smoothstep(0.0, 0.45, vH));
            c = mix(c, tip, smoothstep(0.45, 1.0, vH));
            float a = (1.0 - vH) * 0.85;
            gl_FragColor = vec4(c, a);
          }
        `,
      }),
    [],
  );

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh position={[0, y, 0]} material={material} userData={{ id: 'flare-flame' }}>
      <coneGeometry args={[1.05, 11, 14, 14, true]} />
    </mesh>
  );
}

/**
 * Дым: столб клубов, всплывающих и растворяющихся. Клубы — инстансы одной
 * плоскости, развёрнутой к камере в вершинном шейдере, поэтому столб читается
 * с любого ракурса и не стоит ничего на процессоре.
 */
function Smoke({ y }: { y: number }) {
  const COUNT = 14;

  const { geometry, material } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1);
    g.index = plane.index;
    g.attributes.position = plane.attributes.position;
    g.attributes.uv = plane.attributes.uv;

    // Смещение фазы по клубам: иначе весь столб пульсирует разом.
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) seed[i] = i / COUNT;
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    g.instanceCount = COUNT;

    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime;
        attribute float aSeed;
        varying float vLife;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // Жизнь клуба: 0 — только оторвался, 1 — растворился.
          float life = fract(uTime * 0.13 + aSeed);
          vLife = life;

          float rise = life * 46.0;
          float spread = 1.6 + life * 9.0;
          vec3 offset = vec3(
            sin(aSeed * 41.0 + life * 2.2) * life * 7.0,
            rise,
            cos(aSeed * 27.0 + life * 1.8) * life * 5.0
          );

          // Разворот к камере: берём оси вида из модельно-видовой матрицы.
          vec3 center = (modelViewMatrix * vec4(offset, 1.0)).xyz;
          vec3 p = center + vec3(position.x, position.y, 0.0) * spread;
          gl_Position = projectionMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        varying float vLife;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float soft = smoothstep(1.0, 0.15, d);
          // Появляется быстро, тает долго.
          float a = soft * smoothstep(0.0, 0.12, vLife) * (1.0 - vLife) * 0.34;
          vec3 c = mix(vec3(0.24, 0.22, 0.2), vec3(0.42, 0.44, 0.47), vLife);
          gl_FragColor = vec4(c, a);
        }
      `,
    });

    return { geometry: g, material: m };
  }, []);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return <mesh position={[0, y, 0]} geometry={geometry} material={material} renderOrder={3} />;
}

export function Flare() {
  const data = useFieldData();
  const light = useRef<THREE.PointLight>(null);

  const spot = useMemo(() => {
    const p = data.points.flare[0];
    if (!p) return null;
    const x = toSceneX(p[0]);
    const z = toSceneZ(p[1]);
    return { x, y: surfY(x, z), z };
  }, [data]);

  // Отсвет от пламени: единственный динамический источник в сцене, поэтому
  // мерцание считаем прямо здесь, без отдельного компонента.
  useFrame(({ clock }) => {
    if (!light.current) return;
    const t = clock.elapsedTime;
    light.current.intensity = 260 + 70 * Math.sin(t * 5.3) + 40 * Math.sin(t * 11.7);
  });

  if (!spot) return null;

  return (
    <group userData={{ id: 'fac-flare' }}>
      <Assembly build={buildFlareStack} placements={[spot]} id="flare-stack" />
      <group position={[spot.x, spot.y, spot.z]}>
        <Flame y={(1.5 + STACK_H + 6.6) * EQUIPMENT_SCALE} />
        <Smoke y={(1.5 + STACK_H + 13) * EQUIPMENT_SCALE} />
        <pointLight
          ref={light}
          position={[0, (1.5 + STACK_H + 4) * EQUIPMENT_SCALE, 0]}
          color="#ff9a3c"
          distance={220}
          decay={2}
        />
      </group>
    </group>
  );
}
