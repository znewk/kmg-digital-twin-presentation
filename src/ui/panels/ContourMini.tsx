import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MATERIALS } from '../../scene/field/kit/Assembly';
import { box, cyl, mergeParts, type MatKey, type Part } from '../../scene/field/kit/parts';
import { buildRigStatic } from '../../scene/field/facilities/rig';
import { buildSp } from '../../scene/field/facilities/sp';

/**
 * Вращающаяся миниатюра над заголовком контура.
 *
 * Итоговая плашка — три колонки процентов, и колонки эти различаются только
 * подписью. Зритель в зале читает заголовки по диагонали, и «ЦД пласта» от
 * «ЦД скважины» на слух и на глаз не отличает: обе строки для него одинаково
 * абстрактны. Модель над заголовком называет предмет раньше, чем текст, —
 * пласт, буровая, сборный пункт узнаются мгновенно и без отраслевого опыта.
 *
 * Вращение здесь работает не украшением. Неподвижная миниатюра в тёмной
 * плашке читается плоской иконкой; медленный оборот показывает объём и
 * сообщает, что это модель, а не картинка, — ровно то, о чём идёт доклад.
 *
 * Оборудование берётся у промысла: те же построители, что и в сцене. Рисовать
 * для плашки отдельные модели значило бы, что на слайде одно, а в показе
 * другое.
 */

/**
 * Блок пласта: разрез с нефтенасыщенным коллектором и вскрывшей его скважиной.
 *
 * Единственная миниатюра, которой нет готовой на промысле, — и не может быть:
 * пласт лежит под землёй и в наземной сборке не представлен. Собран тем же
 * набором примитивов и на тех же материалах, поэтому в одном ряду с буровой и
 * сборным пунктом выглядит вещью того же мира.
 */
function buildReservoir(): Part[] {
  const W = 22;
  const D = 15;
  const out: Part[] = [];

  // Снизу вверх: подошвенная вода, нефтенасыщенный коллектор, вмещающая
  // порода, покрышка. Янтарный слой — тот, ради которого всё и считается.
  const layers: [MatKey, number][] = [
    ['pipeWater', 2.2],
    ['accent', 3.2],
    ['concrete', 2.6],
    ['insulation', 1.8],
  ];

  let y = 0;
  for (const [mat, h] of layers) {
    out.push(box(mat, W, h, D, 0, y + h / 2, 0));
    y += h;
  }

  // Скважина вскрывает коллектор: ствол идёт с устья до середины нефтяного слоя
  const shoe = 2.2 + 3.2 / 2;
  const head = y + 5;
  out.push(cyl('steel', 0.55, head - shoe, 2.5, (head + shoe) / 2, -1.5, 0, 0, 0, 10));
  out.push(box('steelDark', 1.9, 1.2, 1.9, 2.5, head, -1.5));

  return out;
}

/**
 * Контур → предмет. Связь по `dive`, а не по порядку колонок: колонки на
 * экране и контуры в данных — разные списки, и совпадение их порядка держалось
 * бы на удаче.
 */
const BUILDERS: Record<string, () => Part[]> = {
  plast: buildReservoir,
  skv: buildRigStatic,
  dob: buildSp,
};

/**
 * Модель приводится к единичному габариту и центрируется по нему.
 *
 * Буровая высотой сорок метров и сборный пункт шириной тридцать четыре в одном
 * ряду должны занимать одинаковое место, иначе колонки перестают быть
 * колонками. Приведение по описанному кубу даёт это без ручного подбора
 * масштаба под каждую модель — и не сломается, если построитель однажды
 * дорастёт ещё одним узлом.
 */
function Spin({ build }: { build: () => Part[] }) {
  const group = useRef<THREE.Group>(null);

  const model = useMemo(() => {
    const merged = mergeParts(build());
    const bbox = new THREE.Box3();
    for (const g of merged.values()) {
      g.computeBoundingBox();
      if (g.boundingBox) bbox.union(g.boundingBox);
    }
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    return { merged, center, scale: 2 / (Math.max(size.x, size.y, size.z) || 1) };
  }, [build]);

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += Math.min(dt, 0.1) * 0.45;
  });

  return (
    <group ref={group} scale={model.scale}>
      <group position={[-model.center.x, -model.center.y, -model.center.z]}>
        {[...model.merged.entries()].map(([key, geometry]) => (
          <mesh key={key} geometry={geometry}>
            <meshStandardMaterial {...MATERIALS[key]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function ContourMini({ kind }: { kind?: string }) {
  const build = kind ? BUILDERS[kind] : undefined;
  if (!build) return null;

  return (
    <div className="pointer-events-none h-24 w-28">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [2.1, 1.55, 2.6], fov: 40 }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight intensity={2.1} position={[5, 7, 4]} />
        {/* Холодная подсветка с теневой стороны — иначе половина модели чёрная */}
        <directionalLight intensity={0.55} color="#6f9bd0" position={[-6, 2, -5]} />
        <Spin build={build} />
      </Canvas>
    </div>
  );
}
