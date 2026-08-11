import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CYCLE_LINE, CYCLE_STEPS, STEP_BY_ID } from '../../data/cycle/chain';
import { useFieldData } from '../../data/geo/fieldData';
import { useShow } from '../../store/useShow';
import { flowEnabled, flowTime } from '../field/kit/flow';
import { resolveChain, type ResolvedAnchor } from './resolve';

/**
 * Сквозная цепочка полного цикла в сцене (ТЗ §4.4).
 *
 * Показывает ОДИН передел за раз: трассы шага текут, объекты шага помечены.
 * Так и задумано — §4.4 требует сквозной цепочки, а не одновременного свечения
 * всего промысла. Если запустить поток по всем 649 трассам нефтесбора, 142
 * водоводам и 439 линиям электропередачи разом, зритель увидит светящуюся
 * паутину, из которой не следует ровно ничего: где начало, где конец, куда
 * идёт нефть. Цепочка читается только последовательно.
 *
 * Остальные сети при этом никуда не деваются и продолжают жить своей анимацией
 * — это фон работающего промысла. Здесь поверх него идёт выделенная нитка
 * текущего передела.
 */

/** Через сколько секунд цепочка сама переходит к следующему шагу. */
const STEP_SECONDS = 6;

/**
 * Геометрия нитки потока: труба по трассе с продольной координатой.
 *
 * `aAlong` в метрах — по ней шейдер гонит волну. Считается по фактической длине
 * трассы, а не по номеру вершины: иначе на участке с частой оцифровкой волна
 * ползёт, а на редкой прыгает, при том что труба одна и та же.
 */
function buildFlowTube(pts: THREE.Vector3[], radius: number): THREE.BufferGeometry | null {
  if (pts.length < 2) return null;

  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const segments = Math.min(220, Math.max(12, pts.length * 2));
  const g = new THREE.TubeGeometry(curve, segments, radius, 6, false);

  // Длина вдоль оси трубы: у TubeGeometry первая координата развёртки идёт
  // ровно вдоль неё, остаётся домножить на полную длину.
  const total = curve.getLength();
  const uv = g.attributes.uv;
  const along = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) along[i] = uv.getX(i) * total;
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));

  return g;
}

/** Нитки текущего шага. */
function StepFlow({ anchor, color }: { anchor: ResolvedAnchor; color: string }) {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const p of anchor.paths) {
      const g = buildFlowTube(p.pts, 3.4);
      if (g) parts.push(g);
    }
    return parts;
  }, [anchor]);

  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: flowTime,
        uFlowOn: flowEnabled,
        uColor: { value: new THREE.Color(color) },
        uFade: { value: 0 },
      },
      // Логарифмическая глубина включена на всю сцену, и собственный шейдер
      // обязан её учитывать — иначе нитка то тонет в земле, то висит поверх
      // установок.
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float aAlong;
        varying float vAlong;
        void main() {
          vAlong = aAlong;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uTime;
        uniform float uFlowOn;
        uniform float uFade;
        uniform vec3 uColor;
        varying float vAlong;
        void main() {
          #include <logdepthbuf_fragment>
          // Сгусток с резким фронтом и длинным хвостом: по нему читается
          // направление течения. Симметричная полоса выглядела бы стоячей.
          float phase = fract(vAlong / 90.0 - uTime * 0.42 * uFlowOn);
          float head = pow(phase, 9.0);
          float base = 0.16;
          gl_FragColor = vec4(uColor, (base + head) * uFade);
        }
      `,
    });
    return m;
  }, [color]);

  // Появление и уход нитки — плавные. Мгновенное включение на смене шага
  // читается как сбой картинки, а не как переход к следующему переделу.
  useFrame((_, dt) => {
    const u = material.uniforms.uFade;
    u.value += (1 - u.value) * (1 - Math.exp(-dt * 4));
  });

  useEffect(
    () => () => {
      for (const g of geometry) g.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <group>
      {geometry.map((g, i) => (
        <mesh key={i} geometry={g} material={material} />
      ))}
    </group>
  );
}

/**
 * Метки объектов шага.
 *
 * Кольцо на земле вокруг каждого объекта передела. Не подпись и не выноска:
 * подписей на сорока одной ГЗУ разом не прочитать, а увидеть, СКОЛЬКО их и как
 * они расставлены по промыслу, — можно.
 */
function StepMarks({ anchor, color }: { anchor: ResolvedAnchor; color: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = anchor.points.length;

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);

    anchor.points.forEach((pt, i) => {
      p.set(pt.x, pt.y + 2, pt.z);
      mat.compose(p, q, s);
      m.setMatrixAt(i, mat);
    });
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [anchor, count]);

  // Пульс кольца — общий для всех, поэтому меняется масштаб материала, а не
  // матрицы инстансов: перезаписывать сотню матриц каждый кадр незачем.
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const m = material.current;
    if (!m) return;
    m.opacity = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.4));
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <ringGeometry args={[16, 24, 24]} />
      <meshBasicMaterial
        ref={material}
        color={color}
        transparent
        opacity={0.5}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

export function CycleChain() {
  const data = useFieldData();
  const stepId = useShow((s) => s.cycleStep);
  const playing = useShow((s) => s.cyclePlaying);
  const setCycleStep = useShow((s) => s.setCycleStep);

  // Якоря считаются один раз на датасет, а не на каждый шаг: правила поиска
  // разрешаются по одним и тем же данным, и пересчитывать их при переходе
  // между переделами незачем.
  const chain = useMemo(() => resolveChain(CYCLE_STEPS, data), [data]);

  const elapsed = useRef(0);
  useFrame((_, dt) => {
    if (!playing) return;
    elapsed.current += dt;
    if (elapsed.current < STEP_SECONDS) return;
    elapsed.current = 0;

    const i = CYCLE_STEPS.findIndex((s) => s.id === useShow.getState().cycleStep);
    const next = CYCLE_STEPS[(i + 1) % CYCLE_STEPS.length];
    setCycleStep(next.id);
  });

  // Запуск цепочки без выбранного шага начинает её с начала — с пласта.
  useEffect(() => {
    if (playing && !useShow.getState().cycleStep) setCycleStep(CYCLE_STEPS[0].id);
  }, [playing, setCycleStep]);

  if (!stepId) return null;
  const step = STEP_BY_ID.get(stepId);
  if (!step) return null;

  const anchor = chain.get(stepId);
  // Якорь не разрешился — в датасете таких объектов нет. Показывать нечего, и
  // подставлять что-то похожее нельзя: ровно это правило и делает цепочку
  // проверяемой.
  if (!anchor || anchor.empty) return null;

  const color = CYCLE_LINE[step.line].color;

  return (
    <group>
      <StepFlow key={`${stepId}:flow`} anchor={anchor} color={color} />
      {!anchor.subsurface && <StepMarks key={`${stepId}:marks`} anchor={anchor} color={color} />}
    </group>
  );
}
