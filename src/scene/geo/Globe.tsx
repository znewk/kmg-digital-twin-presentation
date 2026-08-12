import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import kzOblasts from '../../data/geo/kz-oblasts.json';
import { progressRef, selectFieldMode, useShow } from '../../store/useShow';
import { FieldToken } from './FieldToken';
import { FLAT_BEATS, TOTAL_BEATS } from '../../data/stages';
import {
  geometryRings,
  ringToSurface,
  ringsToSegments,
  lonLatToVec3,
  GLOBE_R,
  MOLDABEK,
} from './projection';

/**
 * Открывающая гео-последовательность (ТЗ §3.1): планета → Казахстан →
 * Атырауская область → погружение к площадке.
 *
 * Всё живёт на одной сфере: карта областей и call-out нарисованы прямо по
 * поверхности глобуса, поэтому переход между этапами — это движение камеры, а
 * не подмена сцены. Границы запечены в бандл, сеть в рантайме не трогается.
 */

/**
 * Этапы, на которых планета вообще существует в сцене.
 *
 * Список ведётся вручную и потому обязан меняться вместе с этапами. После
 * слияния трёх первых блоков в один он остался со старыми именами: этапов
 * «kazakhstan» и «atyrau» больше нет, а нового «intro» в нём не было.
 * Компонент возвращает null, когда этапа нет в списке, — глобус просто не
 * рисовался, пока показ не доходил до снижения к Молдабеку.
 */
const GEO_STAGES = new Set(['globe', 'intro', 'outro', 'descend']);

/** Слои приподняты над сферой, иначе линии тонут в ней и мерцают. */
const R_COAST = GLOBE_R * 1.0015;
const R_OBLAST = GLOBE_R * 1.003;
const R_FILL = GLOBE_R * 1.0022;
const R_MARK = GLOBE_R * 1.006;

interface GeoFeature {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

function useCountryBorders() {
  return useMemo(() => {
    // world-atlas отдаёт TopoJSON — разворачиваем в GeoJSON один раз при
    // монтировании. 110m хватает: на дистанции облёта более детальные
    // береговые линии неотличимы, а весят в семь раз больше.
    const topo = countries110m as unknown as Topology;
    const fc = feature(topo, topo.objects.countries) as unknown as {
      features: GeoFeature[];
    };

    const world: number[] = [];
    let kzRings: number[][][] = [];
    for (const f of fc.features) {
      const rings = geometryRings(f.geometry);
      if (f.properties.name === 'Kazakhstan') kzRings = rings;
      ringsToSegments(rings, R_COAST, world);
    }

    const worldGeom = new THREE.BufferGeometry();
    worldGeom.setAttribute('position', new THREE.Float32BufferAttribute(world, 3));

    const kzGeom = new THREE.BufferGeometry();
    kzGeom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(ringsToSegments(kzRings, R_OBLAST), 3),
    );

    return { worldGeom, kzGeom, kzRings };
  }, []);
}

function useOblasts() {
  return useMemo(() => {
    const data = kzOblasts as {
      oblasts: { name: string; nameRu: string; code: string | null; geometry: { type: string; coordinates: unknown } }[];
    };

    const lines: number[] = [];
    let atyrauFill: THREE.BufferGeometry | null = null;

    for (const o of data.oblasts) {
      const rings = geometryRings(o.geometry);
      ringsToSegments(rings, R_OBLAST, lines);
      if (o.code === 'KZ-ATY') {
        // Берём самое длинное кольцо: у области есть острова и косы,
        // подсвечивать нужно материковый контур.
        const main = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
        atyrauFill = ringToSurface(main, R_FILL);
      }
    }

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    return { lineGeom, atyrauFill };
  }, []);
}

const _worldPos = new THREE.Vector3();

export function Globe() {
  const stageId = useShow((s) => s.stageId);
  const fieldMode = useShow(selectFieldMode);
  const { camera } = useThree();
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);

  const oblastLines = useRef<THREE.LineSegments>(null);
  const atyrauMesh = useRef<THREE.Mesh>(null);
  const dimMesh = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Group>(null);

  const { worldGeom, kzGeom } = useCountryBorders();
  const { lineGeom, atyrauFill } = useOblasts();

  const moldabekPos = useMemo(
    () => lonLatToVec3(MOLDABEK[0], MOLDABEK[1], R_MARK),
    [],
  );

  /**
   * Разворот значка по местному горизонту: вверх — нормаль к поверхности,
   * вправо — восток, вниз по экрану — юг.
   *
   * Сценка построена в обычных координатах — «вверх» у неё по оси Y. На сфере
   * вверх у каждой точки своё направление; без разворота качалки на широте
   * Атырау лежали бы на боку.
   *
   * Но одной нормали мало. Поворот «кратчайшей дугой» доворачивает сценку
   * вокруг нормали на произвольный угол, и план промысла вставал на карту
   * наискось — ряды качалок шли по диагонали, коллектор наперекос к контуру
   * области. Здесь базис задан явно, поэтому ряды идут по параллели, а
   * читатель карты видит план так же, как видел бы его на бумаге.
   */
  const moldabekQuat = useMemo(() => {
    const up = moldabekPos.clone().normalize();
    // Восток = вертикаль мира × нормаль. На полюсе вырождается, на широте
    // Атырау — нет; проверка стоит одной строки и снимает вопрос.
    const east = new THREE.Vector3(0, 1, 0).cross(up);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    const south = east.clone().cross(up).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(east, up, south),
    );
  }, [moldabekPos]);

  /**
   * Планета уходит из сцены, как только показ перешёл на промысел.
   *
   * Не «прячется», а размонтируется: глобус радиусом 300 единиц и промысел
   * шириной пять километров стоят вокруг одного начала координат, и оставленная
   * планета оказалась бы шариком в середине месторождения.
   */
  const active = GEO_STAGES.has(stageId) && !fieldMode;

  useFrame(() => {
    if (!active) return;

    const raw = progressRef.current * TOTAL_BEATS;
    const i = Math.min(TOTAL_BEATS - 1, Math.floor(raw));
    const t = raw - i;
    const stage = FLAT_BEATS[i].stage.id;
    /**
     * Первые три такта — один этап, и различать их приходится по такту, а не
     * по этапу: подлёт от планеты к области идёт внутри одного блока.
     */
    const beat = FLAT_BEATS[i].id;

    // Планета медленно вращается только на первом этапе; как только начинается
    // подлёт к Казахстану, вращение замирает — иначе цель уезжает из-под камеры.
    if (spin.current) {
      const spinPhase = beat === 'planet' ? t : 1;
      spin.current.rotation.y = 0.35 * (1 - spinPhase) * 0.6;
    }

    // Контуры областей проявляются при подлёте к Казахстану.
    const oblastVis =
      beat === 'planet' ? Math.max(0, t - 0.55) / 0.45 : 1;
    if (oblastLines.current) {
      (oblastLines.current.material as THREE.LineBasicMaterial).opacity = 0.42 * oblastVis;
    }

    // Call-out: Атырауская область загорается, остальная страна гаснет.
    /*
      ЗАВИСИТ ОТ ЭТАПА, А НЕ ОТ ТАКТА. Второй и третий этап стоят на одном
      ракурсе и различаются только плашкой — фон между ними обязан быть
      неотличим. Пока условие смотрело на такт, подсветка гасла при переходе на
      итог, и карта менялась при неподвижной камере: это и читалось как прыжок
      фона.
    */
    const callout =
      stage === 'outro' || stage === 'descend'
        ? 1
        : beat === 'context'
          ? Math.min(1, t / 0.35)
          : 0;

    // На подлёте заливка отступает: она нужна, чтобы выделить область на фоне
    // страны, а вблизи площадки просто заливает кадр сплошным янтарём.
    const fillFade = stage === 'descend' ? 1 - 0.82 * Math.min(1, t / 0.35) : 1;
    if (atyrauMesh.current) {
      (atyrauMesh.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * callout * fillFade;
    }
    if (dimMesh.current) {
      (dimMesh.current.material as THREE.MeshBasicMaterial).opacity = 0.62 * callout;
    }

    /**
     * Значок пилота держит постоянный размер на экране.
     *
     * От Атырауской области до подлёта к площадке камера сокращает дистанцию
     * на порядок; при фиксированном размере сценка была бы то точкой, то во
     * весь кадр.
     *
     * Множитель подобран так, чтобы сценка целиком помещалась ВНУТРЬ контура
     * области рядом со своей координатой. Прежний значок был вдвое крупнее и
     * вылезал за восточный край Атырауской области в соседнюю: карта тогда
     * говорит «промысел где-то тут вообще», а нужно «промысел вот здесь».
     *
     * Пульсации нет. Она годилась точке-маркеру, а сценка с работающими
     * качалками, дышащая целиком, читается сбоем масштаба, а не акцентом.
     */
    if (markerRef.current) {
      markerRef.current.visible = callout > 0.05;
      const dist = camera.position.distanceTo(markerRef.current.getWorldPosition(_worldPos));
      markerRef.current.scale.setScalar(callout * dist * 0.04);
    }

    if (root.current) root.current.visible = true;
  });

  if (!active) return null;

  return (
    <group ref={root}>
      {/* Свет планеты: тёплый терминатор с одной стороны, холодный отсвет с другой */}
      <directionalLight color="#f0e2cc" intensity={2.4} position={[600, 320, 700]} />
      <directionalLight color="#4a6ea8" intensity={0.5} position={[-700, -200, -400]} />

      <group ref={spin}>
        {/* Тело планеты */}
        <mesh>
          <sphereGeometry args={[GLOBE_R, 96, 64]} />
          <meshStandardMaterial color="#0e2036" roughness={0.95} metalness={0} />
        </mesh>

        {/* Атмосферный ореол: обратные грани с аддитивным свечением */}
        <mesh scale={1.035}>
          <sphereGeometry args={[GLOBE_R, 64, 48]} />
          <meshBasicMaterial
            color="#3a6ea8"
            transparent
            opacity={0.16}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Береговые линии и границы стран */}
        <lineSegments geometry={worldGeom}>
          <lineBasicMaterial color="#5f7c9e" transparent opacity={0.5} depthWrite={false} />
        </lineSegments>

        {/* Казахстан — акцентная граница */}
        <lineSegments geometry={kzGeom}>
          <lineBasicMaterial color="#35d0c2" transparent opacity={0.95} depthWrite={false} />
        </lineSegments>

        {/* Затемнение остальной страны при call-out Атырау */}
        <mesh ref={dimMesh} scale={1.0045}>
          <sphereGeometry args={[GLOBE_R, 64, 48]} />
          <meshBasicMaterial color="#050810" transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Контуры областей — поверх затемнения, чтобы не пропадали */}
        <lineSegments ref={oblastLines} geometry={lineGeom} renderOrder={2}>
          <lineBasicMaterial
            color="#8fbaf0"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
          />
        </lineSegments>

        {/* Атырауская область */}
        {atyrauFill && (
          <mesh ref={atyrauMesh} geometry={atyrauFill} renderOrder={3}>
            <meshBasicMaterial
              color="#f0ae4a"
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
        )}

        {/* Маркер пилота: Молдабек Восточный */}
        {/*
          Вместо точки на карте — карикатура промысла: качалки качают, факел
          горит, по коллектору бежит нефть.

          Точка сообщает «здесь» и больше ничего. Аудитории, не связанной с
          отраслью, из неё не понять, о каком производстве идёт речь, — а
          сценка объясняет это без единого слова, пока докладчик говорит своё.
        */}
        <group
          ref={markerRef}
          position={moldabekPos}
          quaternion={moldabekQuat}
          visible={false}
          renderOrder={4}
        >
          <FieldToken />
        </group>
      </group>
    </group>
  );
}
