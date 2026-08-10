import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, SMAA, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useShow } from '../store/useShow';
import { TIER_SETTINGS, usePerfTier } from '../hooks/usePerfTier';
import { CameraRig } from './CameraRig';
import { FieldShowcase } from './hero/FieldShowcase';
import { Field } from './field/Field';

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
          top: { value: new THREE.Color('#0f1a2e') },
          bot: { value: new THREE.Color('#03060d') },
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

function SceneContents() {
  usePerfTier();
  const tier = useShow((s) => s.tier);
  const settings = TIER_SETTINGS[tier];

  return (
    <>
      <SkyDome />
      <AmbientRig />
      <CameraRig />

      <Suspense fallback={null}>
        <FieldShowcase shadows={settings.shadows} />
        <Field shadows={settings.shadows} />
      </Suspense>

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

  return (
    <div className="fixed inset-0">
      <Canvas
        dpr={TIER_SETTINGS[tier].dpr}
        shadows={TIER_SETTINGS[tier].shadows}
        gl={{
          antialias: tier === 'low',
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
        }}
        camera={{ fov: 38, near: 0.5, far: 6000, position: [0, 34, 128] }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor('#050810', 1);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          // Плотность рассчитана на масштаб промысла (обзор с ~1800 м даёт
          // мягкую воздушную перспективу). На витрине в 60 м туман при этом
          // практически не работает — там глубину задаёт тёмный фон.
          scene.fog = new THREE.FogExp2(0x081020, 0.00034);
        }}
      >
        <SceneContents />
      </Canvas>
    </div>
  );
}
