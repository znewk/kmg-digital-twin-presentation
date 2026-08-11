import { useMemo, useRef } from 'react';
import type { StoryWell } from '../../data/geo/storyWells';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  perfPoint,
  resBotY,
  resTopY,
  HD,
  HW,
  OWC_Y,
} from './geology';
import { absToSceneY } from '../../data/geo/fieldData';
import { outlineCentroid, outlineRadius } from '../../data/geo/outline';
import { owcAbs, resolveHorizon, SECTION_BASE_ABS } from '../../data/geo/stratigraphy';

/**
 * Дополнительные слои визуализации недр — перенесены из референсного
 * прототипа (ТЗ §1, §8.4). Каждый включается тумблером и нужен по сценарию:
 * сетка ГГДМ и сейсмика — блок 3 шаг 1, фронт заводнения — блок 3 шаг 3,
 * конус обводнения — обоснование обводнённости.
 */

const COL_OIL = '#f0ae4a';
const COL_WATER = '#5fa8e8';

/** Бегущая градиентная текстура для линий тока и потока в трубах. */
export function makeFlowTexture(hex: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 4;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 42, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, hex);
  g.addColorStop(1, '#ffffff');
  c.fillStyle = g;
  c.fillRect(0, 0, 42, 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/**
 * Сетка ГГДМ: каркас расчётных ячеек по продуктивному пласту плюс сами ячейки
 * инстансами, окрашенные по положению относительно ВНК.
 */
export function GgdmGrid() {
  const { lines, cells, colors, count } = useMemo(() => {
    const NX = 12;
    const NZ = 10;
    const NY = 3;
    // Полуразмеры расчётной области, м. Прежние 440 × 340 достались от
    // выдуманного поля 1400 × 900: на фактическом участке 5352 × 4682 сетка
    // занимала шестую часть промысла в самом центре и выглядела случайным
    // пятном. Берётся большая часть площади залежи, но не весь блок — за
    // контуром нефтеносности расчётной сетки и не бывает.
    const RX = HW * 0.62;
    const RZ = HD * 0.62;

    const lp: number[] = [];
    const push = (a: THREE.Vector3, b: THREE.Vector3) =>
      lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    for (let i = 0; i <= NX; i++)
      for (let j = 0; j <= NZ; j++) {
        const x = -RX + (2 * RX * i) / NX;
        const z = -RZ + (2 * RZ * j) / NZ;
        push(V(x, resTopY(x, z) - 4, z), V(x, resBotY(x, z) + 4, z));
      }
    for (let j = 0; j <= NZ; j++)
      for (let i = 0; i < NX; i++) {
        const z = -RZ + (2 * RZ * j) / NZ;
        const x1 = -RX + (2 * RX * i) / NX;
        const x2 = -RX + (2 * RX * (i + 1)) / NX;
        push(V(x1, resTopY(x1, z) - 4, z), V(x2, resTopY(x2, z) - 4, z));
        push(V(x1, resBotY(x1, z) + 4, z), V(x2, resBotY(x2, z) + 4, z));
      }
    for (let i = 0; i <= NX; i++)
      for (let j = 0; j < NZ; j++) {
        const x = -RX + (2 * RX * i) / NX;
        const z1 = -RZ + (2 * RZ * j) / NZ;
        const z2 = -RZ + (2 * RZ * (j + 1)) / NZ;
        push(V(x, resTopY(x, z1) - 4, z1), V(x, resTopY(x, z2) - 4, z2));
        push(V(x, resBotY(x, z1) + 4, z1), V(x, resBotY(x, z2) + 4, z2));
      }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));

    // Ячейки: матрицы и цвета считаются один раз, дальше только рисуются.
    const n = NX * NZ * NY;
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const amber = new THREE.Color(COL_OIL);
    const blue = new THREE.Color('#3e7fbf');
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();
    const P = new THREE.Vector3();
    for (let i = 0; i < NX; i++)
      for (let j = 0; j < NZ; j++) {
        const x = -RX + (2 * RX * (i + 0.5)) / NX;
        const z = -RZ + (2 * RZ * (j + 0.5)) / NZ;
        const top = resTopY(x, z) - 6;
        const bot = resBotY(x, z) + 6;
        const h = (top - bot) / NY;
        for (let l = 0; l < NY; l++) {
          const cy = bot + h * (l + 0.5);
          P.set(x, cy, z);
          S.set(((2 * RX) / NX) * 0.86, h * 0.8, ((2 * RZ) / NZ) * 0.86);
          M.compose(P, Q, S);
          mats.push(M.clone());
          cols.push(cy > OWC_Y ? amber : blue);
        }
      }

    return { lines: g, cells: mats, colors: cols, count: n };
  }, []);

  const inst = useRef<THREE.InstancedMesh>(null);
  const applied = useRef(false);
  useFrame(() => {
    const m = inst.current;
    if (!m || applied.current) return;
    cells.forEach((mat, i) => m.setMatrixAt(i, mat));
    colors.forEach((c, i) => m.setColorAt(i, c));
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    applied.current = true;
  });

  return (
    <group userData={{ id: 'res-grid' }}>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color={COL_OIL} transparent opacity={0.3} depthWrite={false} />
      </lineSegments>
      <instancedMesh ref={inst} args={[undefined, undefined, count]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0.16} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

/** Сейсмический профиль-срез: отражающие горизонты со сбоем на разломе. */
export function SeismicSection() {
  const texture = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 512;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#0b1622';
    c.fillRect(0, 0, 1024, 512);
    for (let k = 0; k < 44; k++) {
      const y0 = 20 + k * 11;
      const bright = k % 6 === 0;
      c.strokeStyle = bright ? 'rgba(190,215,240,0.8)' : 'rgba(120,150,185,0.35)';
      c.lineWidth = bright ? 1.6 : 1;
      c.beginPath();
      for (let px = 0; px <= 1024; px += 8) {
        const xw = (px / 1024) * 2 - 1;
        let y = y0 - 52 * Math.exp(-xw * xw * 3.2) * (0.3 + k / 44) + 3.5 * Math.sin(px * 0.05 + k * 1.7);
        // Разрыв прослеживания отражений на сбросе — то, ради чего сейсмика
        // вообще показывается на блоке 3.
        if (px > 660) y += 26 * (0.3 + k / 44);
        if (px === 0) c.moveTo(px, y);
        else c.lineTo(px, y);
      }
      c.stroke();
    }
    return new THREE.CanvasTexture(cv);
  }, []);

  /**
   * Профиль идёт по блоку, а не по рамке габарита.
   *
   * Стоял шириной в объявленные 5352 м и по оси сцены. Блок с тех пор построен
   * по контуру снятой площади, которая рамку не заполняет и лежит в ней
   * несимметрично, — и профиль торчал наружу двумя синими языками, висящими
   * рядом с моделью в пустоте. Отсюда и вопрос «это что вообще»: со стороны это
   * не читалось как сейсмический профиль ни при каком ракурсе.
   *
   * Теперь это отрезок запад — восток через центр площади, обрывающийся ровно
   * на её границах: сейсмический профиль и есть линия наблюдений, а за краем
   * съёмки наблюдений нет.
   */
  const { west, span, cz } = useMemo(() => {
    const [ox, oz] = outlineCentroid();
    const w = ox - outlineRadius(Math.PI);
    const e = ox + outlineRadius(0);
    return { west: w, span: e - w, cz: oz };
  }, []);

  const height = Math.abs(absToSceneY(SECTION_BASE_ABS) - absToSceneY(-60));
  const midY = (absToSceneY(SECTION_BASE_ABS) + absToSceneY(-60)) / 2;

  return (
    <mesh position={[west + span / 2, midY, cz]} userData={{ id: 'res-seismic' }}>
      <planeGeometry args={[span, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Фронт заводнения: расширяющиеся от нагнетательных полусферы плюс светящиеся
 * линии тока к добывающим. Главная визуальная метафора блока 3 шага 3.
 */
export function FloodFront({ wells }: { wells: StoryWell[] }) {
  const fronts = useRef<THREE.Mesh[]>([]);
  const streams = useRef<THREE.Group>(null);

  const { injectors, links } = useMemo(() => {
    // Пары «нагнетательная → добывающая» больше не перечисляются вручную:
    // состав фонда приходит из реестра, и захардкоженные идентификаторы после
    // первой же смены выборки указывали бы в пустоту. Линии тока строятся к
    // фактически ближайшим добывающим — так же, как вытеснение идёт в поле.
    const injWells = wells.filter((w) => w.kind === 'inj');
    const producers = wells.filter((w) =>
      ['skn', 'esp', 'frac', 'horiz'].includes(w.kind),
    );

    const inj = injWells.map(perfPoint);
    const curves: THREE.CatmullRomCurve3[] = [];

    for (const source of injWells) {
      const pa = perfPoint(source);
      const nearest = producers
        .map((p) => ({ p, d: (p.x - source.x) ** 2 + (p.z - source.z) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2);

      for (const { p } of nearest) {
        const pb = perfPoint(p);
        const mid = pa.clone().lerp(pb, 0.5);
        mid.y -= 16;
        curves.push(new THREE.CatmullRomCurve3([pa, mid, pb]));
      }
    }

    return { injectors: inj, links: curves };
  }, [wells]);

  const flowTex = useMemo(() => links.map(() => makeFlowTexture(COL_WATER)), [links]);

  useFrame(({ clock }, dt) => {
    // Фронт пульсирует циклом 20 с: волна вытеснения уходит от нагнетательной
    // и гаснет, затем цикл повторяется.
    const k = (clock.elapsedTime % 20) / 20;
    for (const m of fronts.current) {
      if (!m) continue;
      const r = 24 + 300 * k;
      m.scale.set(r, r * 0.32, r);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - k) + 0.03;
    }
    for (const t of flowTex) t.offset.x -= dt * 0.35;
    void streams;
  });

  return (
    <group userData={{ id: 'res-flood' }}>
      {injectors.map((p, i) => (
        <mesh
          key={i}
          position={p}
          ref={(m) => {
            if (m) fronts.current[i] = m;
          }}
        >
          <sphereGeometry args={[1, 20, 14]} />
          <meshBasicMaterial
            color={COL_WATER}
            transparent
            opacity={0.25}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      <group ref={streams}>
        {links.map((c, i) => (
          <mesh key={i}>
            <tubeGeometry args={[c, 48, 2.6, 6, false]} />
            <meshBasicMaterial
              map={flowTex[i]}
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Конус обводнения — подтягивание воды от водонефтяного контакта к перфорации.
 *
 * Физика простая: при отборе давление у забоя падает, и вода из-под контакта
 * поднимается конусом вслед за нефтью. Чем выше отбор, тем выше конус; когда
 * он доходит до перфорации, скважина начинает давать воду. Это и есть основная
 * причина роста обводнённости, вокруг которой строится проблемный сюжет §4.4.5.
 *
 * Строится от ВНК ТОГО горизонта, на котором работает скважина, а не от
 * опорного пласта: раньше конус у скважины, вскрывшей юрский горизонт, рос от
 * мелового контакта на двести метров выше — то есть в чужой толще.
 */
export function WaterCone({ wells }: { wells: StoryWell[] }) {
  const geometry = useMemo(() => {
    const profile = [
      new THREE.Vector2(6, 92),
      new THREE.Vector2(20, 70),
      new THREE.Vector2(52, 42),
      new THREE.Vector2(100, 16),
      new THREE.Vector2(150, 0),
    ];
    return new THREE.LatheGeometry(profile, 26);
  }, []);

  const pos = useMemo(() => {
    // Конус обводнения растёт под добывающей с механизированной добычей —
    // именно у неё форсированный отбор подтягивает воду снизу.
    const w = wells.find((x) => x.kind === 'skn') ?? wells.find((x) => x.kind === 'esp');
    if (w) {
      const h = resolveHorizon(w.record.hor);
      const p = perfPoint(w);
      // Основание конуса — на контакте своего горизонта, вершина тянется к
      // перфорации.
      const base = h ? absToSceneY(owcAbs(h)) : OWC_Y;
      return new THREE.Vector3(p.x, base - 8, p.z);
    }
    // Механизированной добычи среди сюжетных не нашлось — конусу расти не от
    // чего, ставим его на опорный контакт, чтобы объект не исчез молча.
    return new THREE.Vector3(200, OWC_Y - 10, -90);
  }, [wells]);

  return (
    <mesh geometry={geometry} position={pos} userData={{ id: 'res-cone' }}>
      <meshBasicMaterial
        color={COL_WATER}
        transparent
        opacity={0.22}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Карта изолиний по кровле — визуальный след Картопостроителя ABAI. */
export { TopIsolines } from './EarthLayers';

/** Габариты блока — пригодятся секущей плоскости. */
export const BLOCK = { HW, HD };
