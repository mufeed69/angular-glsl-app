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

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls?: OrbitControls;

  private stars?: THREE.Points;
  private starMaterial!: THREE.ShaderMaterial;

  private earth?: THREE.Mesh;
  private moon?: THREE.Mesh;
  private torus?: THREE.Mesh;

  private ambientLight?: THREE.AmbientLight;
  private pointLight?: THREE.PointLight;

  private frameId: number | null = null;
  private startTime = performance.now();
  private pausedTime = 0;

  public speed = 2.0;
  public density = 2000;
  public paused = false;
  public isFocused = false;

  private uniforms!: { uTime: { value: number }; uSpeed: { value: number } };

  // add these fields to the class
  private meteors: Array<{
    group: THREE.Object3D;      // contains head (and trail if you add one later)
    birth: number;              // time (s) when spawned
    lifetime: number;           // seconds
  }> = [];

  private lastMeteorSpawn = 0;   // seconds
  private nextMeteorDelay = 0.35; // seconds (randomized between 0.3 and 0.5)
  private meteorSpriteTex?: THREE.Texture;
  private lastFrameTimeMs = performance.now();


  constructor(private ngZone: NgZone) {}

  ngOnInit(): void {
    this.initScene();
    this.ngZone.runOutsideAngular(() => this.animate());
    window.addEventListener('resize', this.onResize);
  }

  private initScene() {
    const el = this.container.nativeElement;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.domElement.style.display = 'block';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(el.clientWidth, el.clientHeight, false);
    this.renderer.setClearColor(0x000000, 0.0);
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 2000);
    this.camera.position.set(0, 0, 60);

    this.uniforms = { uTime: { value: 0 }, uSpeed: { value: this.speed } };

    this.createStarMaterial();
    this.createStars(this.density);
    this.createEarth();
    this.createMoon();

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
    this.scene.add(this.ambientLight);

    this.pointLight = new THREE.PointLight(0xffffff, 1.0, 200);
    this.pointLight.position.set(30, 20, 40);
    this.scene.add(this.pointLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 500;
    this.controls.minDistance = 20;

    // in initScene after renderer created:
    this.meteorSpriteTex = this.makeRadialTexture(128);
  }

  private makeRadialTexture(size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    grad.addColorStop(0, 'rgba(255,200,120,1)');
    grad.addColorStop(0.25, 'rgba(255,120,60,0.9)');
    grad.addColorStop(0.6, 'rgba(255,80,30,0.5)');
    grad.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
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
    const safeCount = Math.max(0, Math.min(20000, Math.floor(count)));

    if (this.stars) {
      const old = this.stars;
      this.scene.remove(old);
      old.geometry.dispose();
      this.stars = undefined;
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(safeCount * 3);
    const seed = new Float32Array(safeCount);

    for (let i = 0; i < safeCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 100 + Math.random() * 400;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
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
    const loader = new THREE.TextureLoader();
    const mat = new THREE.MeshStandardMaterial({
      map: loader.load('/earth/earth_daymap.jpg'),
      normalMap: loader.load('/earth/earth_normal_map.jpg'),
      roughnessMap: loader.load('/earth/earth_specular_map.jpg'),
      displacementMap: loader.load('/earth/earth_displacment.jpg'),
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
    const loader = new THREE.TextureLoader();
    const mat = new THREE.MeshStandardMaterial({
      map: loader.load('/moon/moon.jpg'),
      displacementMap: loader.load('/moon/displacement.jpg'),
      displacementScale: 1.5,
      roughness: 1,
      side: THREE.FrontSide
    });
    this.moon = new THREE.Mesh(geo, mat);
    this.moon.position.set(50, 0, 0);
    this.scene.add(this.moon);
  }

  private randRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  private createMeteor(nowSec: number) {
    // meteor parameters
    const headRadius = this.randRange(0.6, 1.6);
    const speed = this.randRange(60, 140); // world units per second
    const lifetime = this.randRange(0.9, 1.6); // seconds

    // spawn start position: somewhere tall/left/right in the sky relative to camera
    // pick a ring around origin at some distance and angle, then aim roughly toward origin
    const spawnDistance = this.randRange(180, 320);
    const angle = this.randRange(0, Math.PI * 2);
    const startX = Math.cos(angle) * spawnDistance;
    const startY = this.randRange(30, 150); // spawn above plane
    const startZ = Math.sin(angle) * spawnDistance - 40; // slightly behind plane like stars

    // direction roughly toward center plus some variation
    const targetX = this.randRange(-10, 10);
    const targetY = this.randRange(-10, 10);
    const targetZ = this.randRange(-30, 30);
    const dir = new THREE.Vector3(targetX - startX, targetY - startY, targetZ - startZ).normalize();

    // head (bright, additive, slightly emissive look)
    const headGeo = new THREE.SphereGeometry(headRadius, 12, 8);
    const headMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const head = new THREE.Mesh(headGeo, headMat);

    // light/glow sprite (optional cheap glow)
    const spriteMat = new THREE.SpriteMaterial({
      map: this.meteorSpriteTex,
      color: 0xff7744,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const glow = new THREE.Sprite(spriteMat);
    glow.scale.set(headRadius * 6, headRadius * 6, 1.0);
    glow.position.set(0, 0, 0);

    // group to hold head + glow, easier to rotate/orient
    const group = new THREE.Object3D();
    group.position.set(startX, startY, startZ);
    head.position.set(0, 0, 0);
    group.add(head);
    group.add(glow);

    // attach extra custom properties on group for update step
    (group as any).__meteor = {
      velocity: dir.multiplyScalar(speed),
      headMat,
      glowMat: spriteMat
    };

    this.scene.add(group);
    this.meteors.push({ group, birth: nowSec, lifetime });
  }


  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const effectiveTime = this.paused ? this.pausedTime : (now - this.startTime) * 0.001;

    if (this.paused) this.pausedTime = effectiveTime;

    this.uniforms.uTime.value = effectiveTime;
    this.uniforms.uSpeed.value = this.speed;

    if (!this.paused) {
      if (this.stars) {
        const positionsAttr = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = positionsAttr.array as Float32Array;
        const rotSpeed = this.speed * 0.0002;
        for (let i = 0; i < arr.length; i += 3) {
          const x = arr[i];
          const z = arr[i + 2];
          const cos = Math.cos(rotSpeed);
          const sin = Math.sin(rotSpeed);
          arr[i] = x * cos - z * sin;
          arr[i + 2] = x * sin + z * cos;
        }
        positionsAttr.needsUpdate = true;
      }

      if (this.earth) {
        this.earth.rotation.x += 0.004 * (1 + this.speed * 0.05);
        this.earth.rotation.y += 0.01 * (1 + this.speed * 0.04);
        this.earth.position.y = Math.sin(effectiveTime * 0.7) * 1.2;
      }

      if (this.moon) {
        this.moon.rotation.y += 0.006 * (1 + this.speed * 0.03);
        const t = effectiveTime * 0.3;
        this.moon.position.set(Math.cos(t) * 50, Math.sin(t * 0.6) * 6, Math.sin(t) * 10);
      }

      if (this.torus) {
        this.torus.rotation.x += 0.004 * (1 + this.speed * 0.05);
        this.torus.rotation.y += 0.01 * (1 + this.speed * 0.04);
        this.torus.position.y = Math.sin(effectiveTime * 0.7) * 1.2;
      }
    }

    // get delta in seconds (frame-stable)
    const nowMs = performance.now();
    const deltaSeconds = Math.min(0.1, (nowMs - this.lastFrameTimeMs) / 1000); // clamp to avoid big jumps
    this.lastFrameTimeMs = nowMs;

    // Use effectiveTime (seconds) for spawn & age calculations
    const timeSec = effectiveTime;

    // spawn if enough time passed (both in seconds)
    if (timeSec - this.lastMeteorSpawn > this.nextMeteorDelay) {
      this.createMeteor(timeSec); // pass seconds, not ms
      this.lastMeteorSpawn = timeSec;
      this.nextMeteorDelay = this.randRange(0.3, 0.5);
    }

    // update meteors: move, fade, remove
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      const age = timeSec - m.birth; // seconds
      const t = age / m.lifetime;

      const meta = (m.group as any).__meteor;
      if (!meta) continue;

      // integrate with real delta
      m.group.position.addScaledVector(meta.velocity, deltaSeconds);

      // fade out
      const headMat: THREE.MeshBasicMaterial = meta.headMat;
      const glowMat: THREE.SpriteMaterial = meta.glowMat;
      const fade = 1.0 - Math.min(1, t);
      headMat.opacity = fade;
      glowMat.opacity = 0.6 * fade;

      // orient along velocity
      const velDir = meta.velocity.clone().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, velDir);
      m.group.quaternion.copy(q);

      // remove expired
      if (age > m.lifetime) {
        m.group.traverse((o) => {
          if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
          if ((o as any).material) {
            const mat = (o as any).material;
            if (Array.isArray(mat)) mat.forEach((mm: THREE.Material) => mm.dispose());
            else mat.dispose();
          }
        });
        this.scene.remove(m.group);
        this.meteors.splice(i, 1);
      }
    }

    this.controls?.update();
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
    if (!this.paused) this.startTime = performance.now() - this.pausedTime * 1000;
  }

  public toggleFocus() {
    this.isFocused = !this.isFocused;
    const startZ = this.camera.position.z;
    const targetZ = 30;
    const duration = 600;
    const t0 = performance.now();

    const tick = () => {
      const elapsed = performance.now() - t0;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.z = startZ + (targetZ - startZ) * eased;

      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.frameId != null) cancelAnimationFrame(this.frameId);

    [this.stars, this.torus, this.earth, this.moon].forEach(obj => {
      if (!obj) return;
      obj.geometry.dispose();
      if (Array.isArray((obj.material as any))) {
        (obj.material as any).forEach((m: THREE.Material) => m.dispose());
      } else {
        (obj.material as THREE.Material).dispose();
      }
      this.scene.remove(obj);
    });

    this.stars = this.torus = this.earth = this.moon = undefined;

    this.starMaterial?.dispose();

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas?.parentElement?.removeChild(canvas);
      try { (this.renderer as any).forceContextLoss(); } catch {}
      this.renderer.dispose();
    }
  }
}

const VERTEX_SHADER = `
precision highp float;
uniform float uTime;
uniform float uSpeed;
attribute float aSeed;

void main() {
  vec3 pos = position;
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
