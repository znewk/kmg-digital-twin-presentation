import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DIVE_BY_ID } from '../../data/dives';
import { useFieldData } from '../../data/geo/fieldData';
import { useShow } from '../../store/useShow';
import { resolveAnchor } from './resolve';

/**
 * Подсветка объектов, которыми управляет модуль (ТЗ §4.4.3).
 *
 * Показать название продукта и не показать, чем он управляет, — значит
 * оставить зрителя с логотипом вместо понимания. Карта на стр. 12 отчёта об
 * обследовании прямо сопоставляет модули объектам промысла: «Трубопроводы» —
 * напорному нефтепроводу, «КНС и ППД» — насосным станциям, «Химизация» — БРХ.
 * Здесь эта привязка становится видимой.
 *
 * Подсвечиваются ФАКТИЧЕСКИЕ объекты датасета, найденные по правилу шага:
 * «все нагнетательные в работе», «все ГЗУ», «все трассы нефтесбора». Выдумать
 * среди них лишний технически невозможно — если объекта нет в данных, он не
 * загорится.
 *
 * Кольцами, а не окраской самих моделей. Перекрасить инстансы значило бы
 * потерять их собственный вид ровно там, где на них смотрят; кольцо на земле
 * читается с любого ракурса и не спорит с материалом установки.
 */

const RING_RADIUS: Record<string, number> = {
  facility: 26,
  wells: 12,
  hubs: 20,
  points: 16,
  external: 90,
};

export function ModuleFocus() {
  const data = useFieldData();
  const dive = useShow((s) => s.dive);

  const step = dive ? DIVE_BY_ID.get(dive.id)?.steps[dive.step] : null;

  const marks = useMemo(() => {
    if (!step?.highlight) return [];
    const out: { x: number; y: number; z: number; r: number }[] = [];

    for (const spec of step.highlight) {
      // Недра колец на земле не имеют: пласт подсвечивается собственными
      // режимами разреза, а не меткой на поверхности.
      if (spec.source === 'subsurface') continue;

      const a = resolveAnchor(spec, data);
      const r = RING_RADIUS[spec.source] ?? 18;
      for (const p of a.points) out.push({ x: p.x, y: p.y, z: p.z, r });

      // У трасс подсвечиваются их концы: кольцо в середине километровой
      // трубы не говорит ни о чём, а концы — это узлы, между которыми она идёт.
      for (const path of a.paths) {
        const first = path.pts[0];
        const last = path.pts[path.pts.length - 1];
        out.push({ x: first.x, y: first.y, z: first.z, r: 10 });
        out.push({ x: last.x, y: last.y, z: last.z, r: 10 });
      }
    }
    return out;
  }, [step, data]);

  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);

  useEffect(() => {
    const m = mesh.current;
    if (!m || marks.length === 0) return;

    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();

    marks.forEach((k, i) => {
      p.set(k.x, k.y + 2.5, k.z);
      s.set(k.r, k.r, 1);
      mat.compose(p, q, s);
      m.setMatrixAt(i, mat);
    });
    m.count = marks.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [marks]);

  // Пульс общий для всех колец, поэтому меняется прозрачность материала, а не
  // сотни матриц каждый кадр.
  useFrame(({ clock }) => {
    const m = material.current;
    if (!m) return;
    m.opacity = 0.3 + 0.32 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.1));
  });

  if (marks.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, marks.length]}
      frustumCulled={false}
      renderOrder={6}
    >
      {/* Единичное кольцо, масштабируется под габарит объекта */}
      <ringGeometry args={[1, 1.32, 28]} />
      <meshBasicMaterial
        ref={material}
        color="#35d0c2"
        transparent
        opacity={0.5}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}
