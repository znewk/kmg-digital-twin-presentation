import * as THREE from 'three';

/**
 * Бегущий поток в трубах и импульсы по проводам.
 *
 * Почему это патч стандартного материала, а не собственный шейдер. Труба
 * должна остаться металлической и правильно освещённой — с бликом, тенью и
 * отражением окружения. Собственный `ShaderMaterial` всё это выбрасывает:
 * пришлось бы заново писать PBR-модель освещения ради бегущей полоски.
 * `onBeforeCompile` вставляет свечение прямо в готовый шейдер three, и
 * материал остаётся тем же самым.
 *
 * Почему это ничего не стоит. Поток — не движение геометрии, а сдвиг фазы по
 * продольной координате, посчитанной один раз при сборке трубы (`aAlong` в
 * метрах). На процессоре в кадре не происходит ничего, кроме записи одного
 * числа во время. Шестьсот сорок девять трасс нефтесбора текут ровно за ту же
 * цену, что одна.
 */

/** Единое время для всех потоков. Пишется одним компонентом раз в кадр. */
export const flowTime = { value: 0 };

export interface FlowOptions {
  /** Собственный цвет трубы. */
  color: string;
  /** Цвет бегущей волны. */
  flowColor: string;
  /** Длина волны, м: через сколько метров повторяется импульс. */
  period: number;
  /** Скорость волны, м/с. */
  speed: number;
  /** Яркость волны. */
  intensity?: number;
  metalness?: number;
  roughness?: number;
  /** Резкость фронта: чем больше, тем короче светящийся хвост. */
  sharpness?: number;
}

/**
 * Материал трубы с бегущей волной. Геометрия обязана нести атрибут `aAlong` —
 * продольную координату в метрах, иначе волна не появится.
 */
export function makeFlowMaterial(opts: FlowOptions): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: opts.color,
    metalness: opts.metalness ?? 0.6,
    roughness: opts.roughness ?? 0.42,
  });

  const flowColor = new THREE.Color(opts.flowColor);
  const intensity = opts.intensity ?? 1.6;
  const sharpness = opts.sharpness ?? 6;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = flowTime;
    shader.uniforms.uFlowColor = { value: flowColor };
    shader.uniforms.uPeriod = { value: opts.period };
    shader.uniforms.uSpeed = { value: opts.speed };
    shader.uniforms.uIntensity = { value: intensity };
    shader.uniforms.uSharpness = { value: sharpness };

    shader.vertexShader = `
      attribute float aAlong;
      varying float vAlong;
      ${shader.vertexShader}
    `.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAlong = aAlong;');

    shader.fragmentShader = `
      uniform float uTime;
      uniform float uPeriod;
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uSharpness;
      uniform vec3 uFlowColor;
      varying float vAlong;
      ${shader.fragmentShader}
    `.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      // Фаза бежит вдоль трубы: волна с резким фронтом и мягким хвостом —
      // так читается направление течения, а симметричная полоса выглядела бы
      // стоячей.
      float flowPhase = fract(vAlong / uPeriod - uTime * uSpeed / uPeriod);
      float flowBand = pow(flowPhase, uSharpness);
      totalEmissiveRadiance += uFlowColor * flowBand * uIntensity;`,
    );
  };

  // Без этого three переиспользует программу другого материала с теми же
  // параметрами, и поток появляется не там, где задан.
  material.customProgramCacheKey = () =>
    `flow-${opts.flowColor}-${opts.period}-${opts.speed}-${sharpness}`;

  return material;
}

/**
 * Материал провода с бегущим импульсом. Отдельный, потому что провод —
 * `LineSegments` без освещения: у линий нет нормалей, и стандартный материал им
 * не подходит.
 */
export function makePulseMaterial(opts: {
  color: string;
  pulseColor: string;
  period: number;
  speed: number;
  opacity?: number;
  /**
   * Длина штриха, м. Задаётся там, где линия обозначает трассу закопанной
   * трубы, а не саму трубу: сплошная линия читается как труба, лежащая на
   * земле, и спорит с тем, что труба на самом деле в грунте. Пунктир — это
   * разметка, и он не притворяется предметом.
   */
  dash?: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: flowTime,
      uColor: { value: new THREE.Color(opts.color) },
      uPulse: { value: new THREE.Color(opts.pulseColor) },
      uPeriod: { value: opts.period },
      uSpeed: { value: opts.speed },
      uOpacity: { value: opts.opacity ?? 0.85 },
      uDash: { value: opts.dash ?? 0 },
    },
    vertexShader: `
      attribute float aAlong;
      varying float vAlong;
      void main() {
        vAlong = aAlong;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uPeriod;
      uniform float uSpeed;
      uniform float uOpacity;
      uniform float uDash;
      uniform vec3 uColor;
      uniform vec3 uPulse;
      varying float vAlong;
      void main() {
        if (uDash > 0.0 && fract(vAlong / uDash) > 0.58) discard;
        float phase = fract(vAlong / uPeriod - uTime * uSpeed / uPeriod);
        float pulse = pow(phase, 14.0);
        vec3 c = mix(uColor, uPulse, pulse);
        gl_FragColor = vec4(c, uOpacity + pulse * (1.0 - uOpacity));
      }
    `,
  });
}
