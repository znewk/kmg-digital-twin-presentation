import { Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, SMAA, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useShow } from '../store/useShow';
import { TIER_SETTINGS, usePerfTier } from '../hooks/usePerfTier';
import { CameraRig } from './CameraRig';
import { FreeLook } from './FreeLook';
import { Globe } from './geo/Globe';
import { FieldEntry } from './geo/FieldEntry';
import { Field } from './field/Field';
import { renderStats } from './stats';

/**
 * Сцена целиком. Всё офлайн: ни одного внешнего запроса — окружение для PBR
 * собирается процедурно из Lightformer'ов, а не тянется HDRI с CDN.
 */

/**
 * Общий свет и окружение. Направленные источники живут внутри подсцен: у
 * витрины и у поля отличается масштаб на порядок с лишним, и одна теневая
 * камера не может обслуживать и качалку в шесть метров, и промысел в полтора
 * километра — она либо мажет, либо не достаёт.
 */
function AmbientRig() {
  return (
    <>
      <hemisphereLight args={['#9fb8d8', '#3a2f24', 0.7]} />

      {/* Процедурное окружение: без него металл читается чёрным. */}
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={2.4} color="#dfe8f5" position={[0, 8, -12]} scale={[14, 14, 1]} />
        <Lightformer intensity={1.1} color="#f0c98a" position={[10, 4, 8]} scale={[8, 8, 1]} />
        <Lightformer intensity={0.7} color="#4a6ea8" position={[-10, -4, 6]} scale={[10, 10, 1]} />
      </Environment>
    </>
  );
}

/** Градиент неба: полусфера с шейдером, дешевле любой текстуры. */
function SkyDome() {
  return (
    <mesh scale={900}>
      <sphereGeometry args={[1, 24, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={{
          top: { value: new THREE.Color('#13203a') },
          bot: { value: new THREE.Color('#070c16') },
        }}
        vertexShader={`
          varying vec3 vP;
          void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `}
        fragmentShader={`
          varying vec3 vP;
          uniform vec3 top, bot;
          void main(){
            float h = clamp(vP.y * 0.5 + 0.42, 0.0, 1.0);
            gl_FragColor = vec4(mix(bot, top, h), 1.0);
          }
        `}
      />
    </mesh>
  );
}

/**
 * Съём показателей кадра. Ставится последним в дереве сцены, чтобы попасть в
 * конец очереди кадра и прочитать уже накопленные за него значения.
 */
function RenderStats() {
  const { gl } = useThree();
  useFrame(() => {
    const r = gl.info.render;
    renderStats.calls = r.calls;
    renderStats.triangles = r.triangles;
    renderStats.geometries = gl.info.memory.geometries;
    renderStats.textures = gl.info.memory.textures;
    renderStats.programs = gl.info.programs?.length ?? 0;
  });
  return null;
}

function SceneContents() {
  usePerfTier();
  const tier = useShow((s) => s.tier);
  const paused = useShow((s) => s.paused);
  const settings = TIER_SETTINGS[tier];

  return (
    <>
      <SkyDome />
      <AmbientRig />
      {/* На паузе управление камерой отдаётся мыши, таймлайн отступает */}
      <CameraRig enabled={!paused} />
      <FreeLook />
      {/*
        Снижение к промыслу. Живёт ВНЕ Suspense: пока грузится датасет
        месторождения, граница ожидания снимает с экрана всё, что внутри неё, —
        а переход обязан идти и в этот момент, он для того и нужен.
      */}
      <FieldEntry />

      <Suspense fallback={null}>
        <Globe />
        <Field shadows={settings.shadows} />
      </Suspense>

      <RenderStats />

      {settings.bloom && (
        <EffectComposer enableNormalPass={false} multisampling={0}>
          <Bloom
            intensity={0.62}
            luminanceThreshold={0.62}
            luminanceSmoothing={0.28}
            mipmapBlur
          />
          <Vignette offset={0.28} darkness={0.62} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  );
}

export function Stage() {
  const tier = useShow((s) => s.tier);

  /**
   * Когда камерой владеет раскадровка, сцена перестаёт ловить курсор.
   *
   * Это и разбор модуля, и полный цикл. Кадр поставлен, объекты подсвечены —
   * случайный клик по соседней качалке увёл бы камеру на другой конец
   * промысла и открыл карточку, к происходящему отношения не имеющую. Ведёт
   * здесь раскадровка, а не мышь.
   *
   * Один выключатель на всю сцену, а не проверка в каждом обработчике: клик
   * ловят десятки мест — толщи разреза, установки, инстансы фонда, — и
   * пропустить одно из них было бы делом времени. Без событий указателя на
   * канвасе луч не пускается вовсе, заодно не остаётся и курсора-руки.
   */
  const dive = useShow((s) => s.dive);
  const inCycle = useShow((s) => s.cycleShot !== null);

  return (
    <div className="fixed inset-0">
      <Canvas
        style={{ pointerEvents: dive || inCycle ? 'none' : 'auto' }}
        dpr={TIER_SETTINGS[tier].dpr}
        shadows={TIER_SETTINGS[tier].shadows}
        gl={{
          antialias: tier === 'low',
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          /**
           * Логарифмический буфер глубины.
           *
           * Сцена охватывает четыре порядка расстояния: кабельный ввод на
           * устье в полуметре от камеры и обзорный план промысла с девяти
           * километров. Обычный буфер такой диапазон не тянет — точность
           * падает как d²/(near·2²⁴), и приходилось держать ближнюю плоскость
           * на десяти метрах, чтобы трассы труб не проваливались сквозь
           * рельеф. Ценой этого было то, что ближе десяти метров подойти
           * нельзя вообще.
           *
           * Логарифмический буфер распределяет точность равномерно по
           * порядкам, и ближнюю плоскость можно опустить до полуметра, не
           * теряя разрешение вдали.
           */
          logarithmicDepthBuffer: true,
          // Только для снятия контрольных кадров (?shot). На тяжёлой сцене под
          // софтверным рендером кадр строится долго, и снимок попадает в уже
          // очищенный буфер — сцена выглядит пустой, хотя рисуется. В показе
          // флаг не используется: сохранение буфера стоит производительности.
          preserveDrawingBuffer: new URLSearchParams(globalThis.location?.search ?? '').has('shot'),
        }}
        // Дальность рассчитана на самый крупный объект сцены — промысел
        // 5352 × 4682 м, обзорные ракурсы уходят от него на семь-девять
        // километров, а свободный осмотр отпускает камеру на четырнадцать.
        //
        // Ближняя плоскость опущена до полуметра: она держалась на десяти
        // метрах ради точности глубины, и это же не давало подойти к
        // оборудованию вплотную. Теперь точность обеспечивает логарифмический
        // буфер, а не отодвинутая плоскость.
        camera={{ fov: 38, near: 0.5, far: 30000, position: [0, 34, 128] }}
        onCreated={({ gl, scene }) => {
          if (import.meta.env.DEV) {
            Object.assign(globalThis, { __scene: scene, __gl: gl });
          }
          gl.setClearColor('#050810', 1);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          // Плотность рассчитана на настоящий габарит промысла: 5352 × 4682 м,
          // обзорные ракурсы уходят на семь-девять километров.
          //
          // Прежние 0,00034 были подобраны под поле в 1400 м. На семи
          // километрах та же формула даёт 1 − exp(−(0,00034·7000)²) ≈ 99,7 %
          // затухания: вся сцена заливалась ровным цветом тумана, и это
          // выглядело как «ничего не рендерится». При 0,00007 на восьми
          // километрах затухание около 27 % — воздушная перспектива есть,
          // а промысел виден.
          scene.fog = new THREE.FogExp2(0x081020, 0.00007);
        }}
      >
        <SceneContents />
      </Canvas>
    </div>
  );
}
