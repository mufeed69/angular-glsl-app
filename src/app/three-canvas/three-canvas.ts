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
  // standalone: true,
  encapsulation: ViewEncapsulation.None
})
export class ThreeCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  // Three.js essentials
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Orbit controls
  private controls!: OrbitControls;

  // star points
  private stars!: THREE.Points;
  private starMaterial!: THREE.ShaderMaterial;

  // other 3D object
  private torus!: THREE.Mesh;
  private ambientLight!: THREE.AmbientLight;
  private pointLight!: THREE.PointLight;

  private frameId: number | null = null;
  private startTime = performance.now();

  // UI variables
  public speed = 2.0;
  public density = 2000;
  public paused = false;

  // uniforms (shared between materials that need time)
  private uniforms!: { uTime: { value: number }; uSpeed: { value: number } };

  constructor(private ngZone: NgZone) {}

  ngOnInit(): void {
    this.initScene();
    // run animation outside angular to avoid change detection thrash
    this.ngZone.runOutsideAngular(() => this.animate());
    window.addEventListener('resize', this.onResize);
  }

  private initScene() {
    const el = this.container.nativeElement;
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.setClearColor(0x000000, 0.0);

    el.appendChild(this.renderer.domElement);

    // Scene / Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 2000);
    this.camera.position.set(0, 0, 60);

    // Uniforms
    this.uniforms = { uTime: { value: 0 }, uSpeed: { value: this.speed } };

    // Create stars (shader material defined once and reused)
    this.createStarMaterial();
    this.createStars(this.density);

    // Add a rotating torus
    // this.createTorus();

    // Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this.ambientLight);

    this.pointLight = new THREE.PointLight(0xffffff, 1.0, 200);
    this.pointLight.position.set(30, 20, 40);
    this.scene.add(this.pointLight);

    // Controls
    // this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // this.controls.enableDamping = true;       // smooth rotation
    // this.controls.dampingFactor = 0.05;
    // this.controls.enablePan = true;           // allow panning
    // this.controls.enableZoom = true;          // allow zooming
    // this.controls.autoRotate = false;         // optional: set true for slow rotation
    // this.controls.autoRotateSpeed = 1.0;
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
    // Dispose old stars safely
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      // keep material (this.starMaterial) - do not dispose because we reuse it
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const seed = new Float32Array(count); // per-star seed for subtle variation

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 240; // x
      positions[i * 3 + 1] = (Math.random() - 0.5) * 160; // y
      positions[i * 3 + 2] = -Math.random() * 800; // z further out for depth
      seed[i] = Math.random();
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.scene.add(this.stars);
  }

  private createTorus() {
    const geo = new THREE.TorusKnotGeometry(6, 1.8, 160, 32);
    const mat = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.2, color: new THREE.Color(0x66ccff) });
    this.torus = new THREE.Mesh(geo, mat);
    this.torus.position.set(0, 0, 0);
    this.scene.add(this.torus);
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

    // Fast CPU-side star movement using typed array (z is every 3rd value)
    if (this.stars) {
      const positionsAttr = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = positionsAttr.array as Float32Array;
      const len = arr.length;
      const step = 3;
      const delta = this.speed * 0.12; // tweak movement scale
      for (let i = 2; i < len; i += step) {
        arr[i] += delta;
        if (arr[i] > 40) arr[i] = -800 + Math.random() * 20;
      }
      positionsAttr.needsUpdate = true;
    }

    // Rotate torus + subtle bobbing
    if (this.torus) {
      this.torus.rotation.x += 0.004 * (1 + this.speed * 0.05);
      this.torus.rotation.y += 0.01 * (1 + this.speed * 0.04);
      this.torus.position.y = Math.sin(this.uniforms.uTime.value * 0.7) * 1.2;
    }

    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    const el = this.container.nativeElement;
    if (!el) return;
    this.camera.aspect = el.clientWidth / el.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(el.clientWidth, el.clientHeight);
  };

  public updateSpeed(v: number | string) {
    this.speed = typeof v === 'string' ? parseFloat(v) : v;
    this.uniforms.uSpeed.value = this.speed;
  }

  public updateDensity(v: number | string) {
    this.density = typeof v === 'string' ? parseInt(v, 10) : v;
    // recreate stars (safe and fast enough for interactive density changes)
    this.createStars(this.density);
  }

  public togglePause() {
    this.paused = !this.paused;
  }

  // quick camera focus animation (very simple)
  public focusObject() {
    // run a tiny focus animation on the camera by adjusting z over frames
    const targetZ = 30;
    const startZ = this.camera.position.z;
    const duration = 600; // ms
    const t0 = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.z = startZ + (targetZ - startZ) * eased;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.frameId != null) cancelAnimationFrame(this.frameId);

    if (this.stars) {
      this.stars.geometry.dispose();
      if (this.starMaterial) this.starMaterial.dispose();
      this.scene.remove(this.stars);
    }

    if (this.torus) {
      (this.torus.geometry as THREE.BufferGeometry).dispose();
      (this.torus.material as THREE.Material).dispose();
      this.scene.remove(this.torus);
    }

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);
      try { (this.renderer as any).forceContextLoss(); } catch (e) {}
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
  // position is the built-in attribute
  vec3 pos = position;

  // small GPU-only twinkle offset (seed makes each star unique)
  float tw = sin(uTime * (0.5 + aSeed * 2.0) * (0.3 + aSeed)) * 0.15 * aSeed;
  pos.z += tw * 10.0;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  // dynamic size: nearer points bigger, also modulate by aSeed
  float size = 1.5 + (120.0 / max(1.0, abs(mvPosition.z))) * (0.6 + aSeed * 0.8);
  gl_PointSize = clamp(size, 1.0, 60.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
precision highp float;
void main() {
  // gl_PointCoord goes from 0..1 across the sprite
  vec2 c = gl_PointCoord - vec2(0.5);
  float dist = length(c);
  // soft circular falloff
  float alpha = smoothstep(0.5, 0.0, dist);
  // subtle rim brightness
  float rim = smoothstep(0.45, 0.25, dist) * 0.8;
  vec3 color = vec3(1.0);
  gl_FragColor = vec4(color * (0.6 + rim), alpha);
  if (gl_FragColor.a < 0.01) discard;
}
`;
