import { useEffect, useRef, useState } from 'react';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  OrthographicCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three';

/**
 * "DEAD → ALIVE" (design v2, D016): a dormant dot-matrix that ignites as
 * the visitor moves the cursor or scrolls - dots ripple away from the
 * pointer, drift on simplex-noise flow, grow and darken; left alone, the
 * field decays back to stillness. It literalizes the positioning line:
 * "I build solutions, not dead software."
 *
 * Plain three via named imports (tree-shakes; R3F retains all of three).
 * Reference implementation: direction-v2-bold.html.
 */

interface SceneProps {
  active: boolean;
  onFail: () => void;
}

const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.0*dot(m,g);}
`;

const VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uMouse;
uniform float uLife;
uniform float uDpr;
varying float vR;
${SNOISE}
void main(){
  vec3 p = position;
  float n1 = snoise(position.xy * 1.6 + vec2(uTime * 0.15, 0.0));
  float n2 = snoise(position.yx * 1.6 - vec2(0.0, uTime * 0.12));
  p.x += n1 * 0.05 * uLife;
  p.y += n2 * 0.05 * uLife;
  float d = distance(position.xy, uMouse);
  float ripple = smoothstep(0.55, 0.0, d);
  vec2 dir = normalize(position.xy - uMouse + vec2(0.0001));
  p.xy += dir * ripple * 0.14 * uLife;
  vR = ripple;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (2.4 + ripple * 7.0) * (0.6 + 0.7 * uLife) * uDpr;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLife;
varying float vR;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  float a = 0.24 + 0.42 * uLife + 0.5 * vR;
  gl_FragColor = vec4(uColor, min(a, 0.92));
}
`;

const IDLE_DECAY_MS = 300;

function readInk(): Color {
  return new Color(
    getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
  );
}

export default function HeroScene({ active, onFail }: SceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        alpha: true,
        /* No MSAA: the fragment shader already rounds each point via
           discard - antialias here only burns GPU during scroll. */
        antialias: false,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      failRef.current();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    renderer.setPixelRatio(dpr);
    renderer.setClearAlpha(0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.pointerEvents = 'none';

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
    camera.position.z = 2;

    const uniforms = {
      uTime: { value: 0 },
      uMouse: { value: new Vector2(9, 9) },
      uLife: { value: 0 },
      uDpr: { value: dpr },
      uColor: { value: readInk() },
    };

    const geometry = new BufferGeometry();
    let aspect = 1;
    const buildGrid = () => {
      const step = 0.05;
      const positions: number[] = [];
      for (let x = -aspect; x <= aspect; x += step)
        for (let y = -1; y <= 1; y += step) positions.push(x, y, 0);
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    };

    const material = new ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new Points(geometry, material));

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h);
      aspect = w / h;
      camera.left = -aspect;
      camera.right = aspect;
      camera.updateProjectionMatrix();
      buildGrid();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* --- life: ignition from cursor + scroll, decay when idle --- */
    let life = 0;
    let target = 0;
    let lastWake = 0;
    const wake = () => {
      target = 1;
      lastWake = performance.now();
    };
    const onMove = (event: PointerEvent) => {
      wake();
      const rect = host.getBoundingClientRect();
      uniforms.uMouse.value.set(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 * aspect - aspect,
        -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1),
      );
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', wake, { passive: true });

    /* theme flips re-read the ink tone */
    const themeObserver = new MutationObserver(() => {
      uniforms.uColor.value.copy(readInk());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    /* render loop with fps floor: degrade dpr, then bail to the poster */
    const fps = { frames: 0, elapsed: 0, strikes: 0, degraded: false };
    let last = performance.now();
    let raf = 0;
    let beat = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!activeRef.current) return; // paused: off-screen or hidden tab

      beat += delta;
      if (beat > 0.5) {
        beat = 0;
        const mount = host.closest<HTMLElement>('#hero-webgl-mount');
        if (mount) {
          mount.dataset.t = uniforms.uTime.value.toFixed(1);
          mount.dataset.life = life.toFixed(2);
        }
      }

      if (now - lastWake > IDLE_DECAY_MS) target = 0; // back to "dead"

      /* Fully dormant → render one settled frame, then stop burning GPU
         until the next wake. The dead state is, correctly, dead. */
      if (target === 0 && life < 0.004) {
        if (life !== 0) {
          life = 0;
          uniforms.uLife.value = 0;
          renderer.render(scene, camera);
        }
        return;
      }

      uniforms.uTime.value += delta;
      life += (target - life) * Math.min(1, delta * 3.6);
      uniforms.uLife.value = life;
      renderer.render(scene, camera);

      fps.frames += 1;
      fps.elapsed += delta;
      if (fps.elapsed >= 2) {
        const rate = fps.frames / fps.elapsed;
        fps.frames = 0;
        fps.elapsed = 0;
        if (rate < 30) {
          fps.strikes += 1;
          if (!fps.degraded) {
            fps.degraded = true;
            renderer.setPixelRatio(1);
            uniforms.uDpr.value = 1;
            resize();
          } else if (fps.strikes >= 3) {
            failRef.current();
          }
        } else {
          fps.strikes = 0;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    const show = requestAnimationFrame(() => setVisible(true));

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(show);
      ro.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', wake);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        opacity: visible ? 1 : 0,
        transition: 'opacity 900ms ease',
        pointerEvents: 'none',
      }}
    />
  );
}
