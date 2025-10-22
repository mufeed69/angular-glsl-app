import {
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

@Component({
  selector: 'app-three-canvas',
  templateUrl: './three-canvas.html',
  styleUrls: ['./three-canvas.css'],
  encapsulation: ViewEncapsulation.None
})
export class ThreeCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  // Three essentials
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Optional controls
  private controls?: OrbitControls;

  // stars
  private stars?: THREE.Points;
  private starMaterial!: THREE.ShaderMaterial;

  // objects
  private earth?: THREE.Mesh;
  private moon?: THREE.Mesh;
  private torus?: THREE.Mesh;

  private ambientLight?: THREE.AmbientLight;
  private pointLight?: THREE.PointLight;

  private frameId: number | null = null;
  private startTime = performance.now();

  // UI
  public speed = 2.0;
  public density = 2000;
  public paused = false;
  public isFocused = false;
  public isAnimating = false;

  // uniforms shared with star shader
  private uniforms!: { uTime: { value: number }; uSpeed: { value: number } };

  constructor(private ngZone: NgZone) {}

  ngOnInit(): void {
    this.initScene();
    // run animation outside angular to avoid change-detection thrash
    this.ngZone.runOutsideAngular(() => this.animate());
    window.addEventListener('resize', this.onResize);
  }

  private initScene() {
    const el = this.container.nativeElement;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // ensure the canvas covers container
    this.renderer.domElement.style.display = 'block';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(el.clientWidth, el.clientHeight, false);
    this.renderer.setClearColor(0x000000, 0.0);
    el.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 2000);
    this.camera.position.set(0, 0, 60);

    // Uniforms
    this.uniforms = { uTime: { value: 0 }, uSpeed: { value: this.speed } };

    // Star material and stars
    this.createStarMaterial();
    this.createStars(this.density);

    // Earth, moon, torus
    this.createEarth();
    this.createMoon();
    // this.createTorus(); // enable if needed

    // Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
    this.scene.add(this.ambientLight);

    this.pointLight = new THREE.PointLight(0xffffff, 1.0, 200);
    this.pointLight.position.set(30, 20, 40);
    this.scene.add(this.pointLight);

    // Optional controls (commented by default)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 100;
    this.controls.minDistance = 20;
  }

  private createStarMaterial() {
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms as any,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }

  private createStars(count: number) {
    // clamp to reasonable bounds
    const safeCount = Math.max(0, Math.min(20000, Math.floor(count)));

    // dispose previous geometry (keep material for reuse)
    if (this.stars) {
      const old = this.stars;
      this.scene.remove(old);
      if (old.geometry) old.geometry.dispose();
      // don't dispose starMaterial here because we reuse it
      this.stars = undefined;
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(safeCount * 3);
    const seed = new Float32Array(safeCount);

    // produce an oval distribution (wider in X than Y)
    for (let i = 0; i < safeCount; i++) {
      const rx = (Math.random() - 0.5) * 240; // x range
      const ry = (Math.random() - 0.5) * 120; // y smaller -> oval
      const rz = -Math.random() * 800; // z further out
      positions[i * 3] = rx;
      positions[i * 3 + 1] = ry;
      positions[i * 3 + 2] = rz;
      seed[i] = Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.scene.add(this.stars);
  }

  private createTorus() {
    const geo = new THREE.TorusKnotGeometry(6, 1.8, 160, 32);
    const mat = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.2, color: 0x66ccff });
    this.torus = new THREE.Mesh(geo, mat);
    this.torus.position.set(0, 0, 0);
    this.scene.add(this.torus);
  }

  private createEarth() {
    const geo = new THREE.SphereGeometry(10, 64, 64);
    const textureLoader = new THREE.TextureLoader();
    const mat = new THREE.MeshStandardMaterial({
      map: textureLoader.load('/earth/earth_daymap.jpg'),
      normalMap: textureLoader.load('/earth/earth_normal_map.jpg'),
      roughnessMap: textureLoader.load('/earth/earth_specular_map.jpg'),
      displacementMap: textureLoader.load('/earth/earth_displacment.jpg'),
      displacementScale: 1.5,
      roughness: 1,
      side: THREE.FrontSide
    });
    this.earth = new THREE.Mesh(geo, mat);
    this.earth.position.set(0, 0, 0);
    this.scene.add(this.earth);
  }

  private createMoon() {
    const geo = new THREE.SphereGeometry(6, 64, 64);
    const textureLoader = new THREE.TextureLoader();
    const mat = new THREE.MeshStandardMaterial({
      map: textureLoader.load('/moon/moon.jpg'),
      displacementMap: textureLoader.load('/moon/displacement.jpg'),
      displacementScale: 1.5,
      roughness: 1,
      side: THREE.FrontSide
    });
    this.moon = new THREE.Mesh(geo, mat);
    this.moon.position.set(50, 0, 0);
    this.scene.add(this.moon);
  }

  private animate = () => {
    if (this.paused) {
      this.frameId = requestAnimationFrame(this.animate);
      return;
    }

    this.frameId = requestAnimationFrame(this.animate);
    const now = performance.now();
    this.uniforms.uTime.value = (now - this.startTime) * 0.001;
    this.uniforms.uSpeed.value = this.speed;

    // CPU-side star movement (z every 3rd element)
    if (this.stars) {
      const positionsAttr = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = positionsAttr.array as Float32Array;
      const len = arr.length;
      const delta = this.speed * 0.12;
      for (let i = 2; i < len; i += 3) {
        arr[i] += delta;
        if (arr[i] > 40) arr[i] = -800 + Math.random() * 20;
      }
      positionsAttr.needsUpdate = true;
    }

    // torus animation
    if (this.torus) {
      this.torus.rotation.x += 0.004 * (1 + this.speed * 0.05);
      this.torus.rotation.y += 0.01 * (1 + this.speed * 0.04);
      this.torus.position.y = Math.sin(this.uniforms.uTime.value * 0.7) * 1.2;
    }

    if (this.earth) {
      this.earth.rotation.x += 0.004 * (1 + this.speed * 0.05);
      this.earth.rotation.y += 0.01 * (1 + this.speed * 0.04);
      this.earth.position.y = Math.sin(this.uniforms.uTime.value * 0.7) * 1.2;
    }

    if (this.moon) {
      this.moon.rotation.y += 0.006 * (1 + this.speed * 0.03);
      // basic orbit
      const t = this.uniforms.uTime.value * 0.3;
      this.moon.position.set(Math.cos(t) * 50, Math.sin(t * 0.6) * 6, Math.sin(t) * 10);
    }

    // update controls if enabled
    if (this.controls) this.controls.update();

    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    const el = this.container?.nativeElement;
    if (!el || !this.camera || !this.renderer) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
  };

  public updateSpeed(v: number | string) {
    this.speed = typeof v === 'string' ? parseFloat(v) : v;
    this.uniforms.uSpeed.value = this.speed;
  }

  public updateDensity(v: number | string) {
    const nv = typeof v === 'string' ? parseInt(v, 10) : v;
    this.density = Math.max(0, Math.min(20000, nv));
    this.createStars(this.density);
  }

  public togglePause() {
    this.paused = !this.paused;
  }

  public toggleFocus() {
    // avoid starting another animation while one is running
    if (this.isAnimating) return;

    // desired focus state after this click
    const nextFocus = !this.isFocused;

    // immediately update state so button label changes right away
    this.isFocused = nextFocus;
    this.isAnimating = true;

    const startZ = this.camera.position.z;
    const targetZ = nextFocus ? 30 : 60; // zoom in if focusing, zoom out if unfocusing
    const duration = 600;
    const t0 = performance.now();

    const tick = () => {
      const t = Math.min(2, (performance.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.z = startZ + (targetZ - startZ) * eased;

      console.log('t >>', t)
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        console.log('i am here')
        // animation finished
        // tell Angular to detect this change
        this.ngZone.run(() => {
          this.isAnimating = false;
        });
      }
    };

    requestAnimationFrame(tick);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.frameId != null) cancelAnimationFrame(this.frameId);

    // dispose stars and geometry (keep starMaterial disposed below)
    if (this.stars) {
      if (this.stars.geometry) this.stars.geometry.dispose();
      this.scene.remove(this.stars);
      this.stars = undefined;
    }

    // dispose torus
    if (this.torus) {
      if (this.torus.geometry) this.torus.geometry.dispose();
      if (Array.isArray((this.torus.material as any))) {
        (this.torus.material as any).forEach((m: THREE.Material) => m.dispose());
      } else {
        (this.torus.material as THREE.Material).dispose();
      }
      this.scene.remove(this.torus);
      this.torus = undefined;
    }

    // earth
    if (this.earth) {
      if (this.earth.geometry) this.earth.geometry.dispose();
      if (Array.isArray((this.earth.material as any))) {
        (this.earth.material as any).forEach((m: THREE.Material) => m.dispose());
      } else {
        (this.earth.material as THREE.Material).dispose();
      }
      this.scene.remove(this.earth);
      this.earth = undefined;
    }

    // moon
    if (this.moon) {
      if (this.moon.geometry) this.moon.geometry.dispose();
      if (Array.isArray((this.moon.material as any))) {
        (this.moon.material as any).forEach((m: THREE.Material) => m.dispose());
      } else {
        (this.moon.material as THREE.Material).dispose();
      }
      this.scene.remove(this.moon);
      this.moon = undefined;
    }

    // dispose star material
    if (this.starMaterial) this.starMaterial.dispose();

    // renderer cleanup
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);
      try {
        (this.renderer as any).forceContextLoss();
      } catch (e) {/* ignore */}
      this.renderer.dispose();
    }
  }
}

// ---------------- GLSL Shaders ----------------
const VERTEX_SHADER = `
precision highp float;
uniform float uTime;
uniform float uSpeed;
attribute float aSeed;

void main() {
  vec3 pos = position;
  // subtle twinkle using seed
  float tw = sin(uTime * (0.5 + aSeed * 2.0) * (0.3 + aSeed)) * 0.15 * aSeed;
  pos.z += tw * 10.0;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float size = 1.5 + (120.0 / max(1.0, abs(mvPosition.z))) * (0.6 + aSeed * 0.8);
  gl_PointSize = clamp(size, 1.0, 60.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
precision highp float;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float dist = length(c);
  float alpha = smoothstep(0.5, 0.0, dist);
  float rim = smoothstep(0.45, 0.25, dist) * 0.8;
  vec3 color = vec3(1.0);
  gl_FragColor = vec4(color * (0.6 + rim), alpha);
  if (gl_FragColor.a < 0.01) discard;
}
`;
