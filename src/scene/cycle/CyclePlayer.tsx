import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cycleRoutes, type RoutePoint } from '../../data/cycle/route';
import { FULL_CYCLE, SHOT_BY_ID, type Shot } from '../../data/cycle/storyboard';
import { useFieldData } from '../../data/geo/fieldData';
import { useShow } from '../../store/useShow';
import { flowEnabled, flowTime } from '../field/kit/flow';
import { surfY } from '../field/geology';

/**
 * Проигрыватель полного цикла (ТЗ §4.4).
 *
 * Ведёт раскадровку: отсчитывает длительность кадра, переключает на следующий,
 * и подсвечивает ровно тот участок маршрута, о котором идёт речь. Камеру ведёт
 * не он, а `FreeLook` — там живут орбитальные контролы, и перехватывать камеру
 * из двух мест значит драться за неё.
 *
 * Подсвечивается ОДИН участок. Это и есть главное отличие от прошлой версии,
 * где зажигались все 649 трасс нефтесбора разом: зритель видел, что «всё
 * связано», и не понимал ни одного звена. Здесь в кадре ровно та труба, о
 * которой сейчас говорят.
 */

/** Цвета сред (§8.1). */
const COLOR = {
  oil: '#f0ae4a',
  ppd: '#5fa8e8',
  gas: '#35d0c2',
};

/** Какой участок маршрута течёт на этом кадре. */
type Segment = 'flowline' | 'collector' | 'trunk' | 'waterline' | null;

function segmentOf(shot: Shot): Segment {
  switch (shot.play) {
    case 'flow-flowline':
      return 'flowline';
    case 'flow-collector':
      return 'collector';
    case 'flow-trunk':
      return 'trunk';
    case 'flow-water':
      return 'waterline';
    default:
      return null;
  }
}

/**
 * Нитка потока по участку маршрута.
 *
 * Продольная координата в метрах считается по фактической длине трассы, а не
 * по номеру вершины: частота оцифровки в чертеже отражает подробность съёмки
 * участка, а не его протяжённость, и волна ползла бы на поворотах и прыгала на
 * прямых.
 */
function FlowRibbon({ pts, color, radius }: { pts: RoutePoint[]; color: string; radius: number }) {
  const geometry = useMemo(() => {
    if (pts.length < 2) return null;

    const v = pts.map((p) => new THREE.Vector3(p.x, surfY(p.x, p.z) + 5, p.z));
    const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal');
    const g = new THREE.TubeGeometry(curve, Math.min(320, Math.max(24, v.length * 4)), radius, 8, false);

    const total = curve.getLength();
    const uv = g.attributes.uv;
    const along = new Float32Array(uv.count);
    for (let i = 0; i < uv.count; i++) along[i] = uv.getX(i) * total;
    g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));

    return g;
  }, [pts, radius]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: flowTime,
          uFlowOn: flowEnabled,
          uColor: { value: new THREE.Color(color) },
          uFade: { value: 0 },
        },
        // Логарифмическая глубина включена на всю сцену: собственный шейдер
        // обязан её учитывать, иначе нитка то тонет в земле, то висит поверх.
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
            // Резкий фронт и длинный хвост: по ним читается направление
            // течения. Симметричная полоса выглядела бы стоячей.
            float phase = fract(vAlong / 120.0 - uTime * 0.35 * uFlowOn);
            float head = pow(phase, 8.0);
            gl_FragColor = vec4(uColor, (0.2 + head * 1.2) * uFade);
          }
        `,
      }),
    [color],
  );

  // Нитка проявляется, а не включается: мгновенное появление на смене кадра
  // читается как сбой картинки.
  useFrame((_, dt) => {
    const u = material.uniforms.uFade;
    u.value += (1 - u.value) * (1 - Math.exp(-dt * 3));
  });

  useEffect(
    () => () => {
      geometry?.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} renderOrder={5} />;
}

/** Пульсирующее кольцо на земле — «речь идёт об этом объекте». */
function Halo({ at, radius, color }: { at: RoutePoint; radius: number; color: string }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const m = material.current;
    if (!m) return;
    m.opacity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.2));
  });

  return (
    <mesh
      position={[at.x, surfY(at.x, at.z) + 1.5, at.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={4}
    >
      <ringGeometry args={[radius, radius * 1.35, 40]} />
      <meshBasicMaterial
        ref={material}
        color={color}
        transparent
        opacity={0.4}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function CyclePlayer() {
  const data = useFieldData();
  const shotId = useShow((s) => s.cycleShot);
  const playing = useShow((s) => s.cyclePlaying);
  const setCycleShot = useShow((s) => s.setCycleShot);

  const { oil: route, ppd } = useMemo(() => cycleRoutes(data), [data]);

  /**
   * Отсчёт кадра начинается заново при каждой смене — в том числе при ручном
   * переходе по индикатору. Иначе выбранный вручную кадр доживал бы остаток
   * чужого времени и сменялся через полсекунды.
   */
  const elapsed = useRef(0);
  useEffect(() => {
    elapsed.current = 0;
  }, [shotId]);

  /**
   * Кадр включает свои режимы сцены и гасит чужие.
   *
   * Состояние задаётся ЦЕЛИКОМ по текущему кадру, а не правится по разнице с
   * предыдущим. Иначе при переходе назад или прыжке по индикатору остаются
   * включёнными слои прошлого кадра, и разобраться, откуда взялась сейсмика в
   * кадре про сборный пункт, уже невозможно.
   */
  useEffect(() => {
    if (!shotId) return;
    const shot = SHOT_BY_ID.get(shotId);
    if (!shot) return;

    const want = shot.setup ?? {};
    const f = want.features ?? {};
    useShow.setState((s) => ({
      exploded: want.exploded ?? false,
      clip: want.clip ?? false,
      features: {
        ...s.features,
        grid: f.grid ?? false,
        isolines: f.isolines ?? false,
        seismic: f.seismic ?? false,
        flood: f.flood ?? false,
        cone: f.cone ?? false,
        drainage: f.drainage ?? false,
        utilities: f.utilities ?? false,
        traces: f.traces ?? false,
        // Поток остаётся включённым всегда: это движение среды в трубах, а не
        // слой поверх сцены, и гасить его посреди рассказа о потоке незачем.
        flow: true,
      },
    }));
  }, [shotId]);

  useFrame((_, dt) => {
    if (!playing || !shotId) return;
    const shot = SHOT_BY_ID.get(shotId);
    if (!shot) return;

    elapsed.current += dt;
    if (elapsed.current < shot.seconds) return;
    elapsed.current = 0;

    const i = FULL_CYCLE.findIndex((s) => s.id === shotId);
    const next = FULL_CYCLE[i + 1];
    // Цикл кончился — останавливаемся на последнем кадре, а не уходим по кругу:
    // «товарная нефть» это конец рассказа, и снова падать в пласт незачем.
    if (!next) {
      useShow.setState({ cyclePlaying: false });
      return;
    }
    setCycleShot(next.id);
  });

  useEffect(() => {
    if (playing && !useShow.getState().cycleShot) setCycleShot(FULL_CYCLE[0].id);
  }, [playing, setCycleShot]);

  if (!shotId || !route) return null;
  const shot = SHOT_BY_ID.get(shotId);
  if (!shot) return null;

  const color = COLOR[shot.line];
  const segment = segmentOf(shot);

  const ribbon =
    segment === 'flowline'
      ? route.flowline
      : segment === 'collector'
        ? route.collector
        : segment === 'trunk'
          ? [route.spAt, { x: route.spAt.x + 2400, z: route.spAt.z - 200 }]
          : segment === 'waterline'
            ? (ppd?.waterline ?? [])
            : [];

  // Кольца — на объектах, о которых идёт речь в этом кадре.
  const halos: { at: RoutePoint; r: number }[] = [];
  switch (shot.look.at) {
    case 'gzu':
      halos.push({ at: route.gzuAt, r: 26 });
      break;
    case 'pad':
      halos.push({ at: route.gzuAt, r: 26 });
      break;
    case 'sp':
      halos.push({ at: route.spAt, r: 46 });
      break;
    case 'kns':
      if (ppd) halos.push({ at: ppd.knsAt, r: 34 });
      break;
    case 'injector':
      if (ppd) halos.push({ at: ppd.injectorAt, r: 18 });
      break;
    case 'wellhead':
    case 'flowline':
      halos.push({ at: route.flowline[0], r: 18 });
      break;
  }

  return (
    <group>
      {ribbon.length >= 2 && (
        <FlowRibbon
          key={`${shotId}:ribbon`}
          pts={ribbon}
          color={color}
          radius={segment === 'flowline' ? 2.2 : 4}
        />
      )}
      {halos.map((h, i) => (
        <Halo key={`${shotId}:halo:${i}`} at={h.at} radius={h.r} color={color} />
      ))}
    </group>
  );
}
