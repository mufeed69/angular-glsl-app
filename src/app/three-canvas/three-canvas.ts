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

  private trailPlaneGeo?: THREE.PlaneGeometry;
  private meteorBaseMaterial?: THREE.ShaderMaterial;
  private lastFrameTimeMs = performance.now();

  private meteors: Array<{
    group: THREE.Object3D;      
    birth: number;             
    lifetime: number;          
  }> = [];

  private lastMeteorSpawn = 0;   
  private nextMeteorDelay = 0.35;

  public spawnDelay = 0.3;

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
  }

  private randRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  public updateSpawnDelay(v: number | string) {
    this.spawnDelay = typeof v === 'string' ? parseFloat(v) : v;
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

  private createMeteor(timeSec: number) {
    const headRadius = this.randRange(3, 6);         
    const speed = this.randRange(50, 90);            
    const lifetime = this.randRange(1.5, 2.5);        
    const trailLen = speed * 0.3 + this.randRange(30, 60);

    const spawnDistance = this.randRange(160, 320);
    const angle = this.randRange(0, Math.PI * 2);
    const startX = Math.cos(angle) * spawnDistance;
    const startY = this.randRange(30, 160);
    const startZ = Math.sin(angle) * spawnDistance - 40;

    const targetX = this.randRange(-10, 10);
    const targetY = this.randRange(-10, 10);
    const targetZ = this.randRange(-30, 30);
    const dir = new THREE.Vector3(targetX - startX, targetY - startY, targetZ - startZ).normalize();
    const velocity = dir.clone().multiplyScalar(speed);

    if (!this.trailPlaneGeo) {
      this.trailPlaneGeo = new THREE.PlaneGeometry(1.0, 1.0, 1, 1);
      const pos = this.trailPlaneGeo.getAttribute('position');
      const uv = this.trailPlaneGeo.getAttribute('uv');
      if (pos) this.trailPlaneGeo.setAttribute('aPosition', pos.clone());
      if (uv) this.trailPlaneGeo.setAttribute('aUv', uv.clone());
    }

    if (!this.meteorBaseMaterial) {
      this.meteorBaseMaterial = new THREE.ShaderMaterial({
        vertexShader: METEOR_VERTEX_SHADER,
        fragmentShader: METEOR_FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false, 
        uniforms: {
          uTime: { value: 0.0 },
          uBirth: { value: 0.0 },
          uLifetime: { value: 1.0 },
          uHeadSize: { value: 1.0 },
          uTrailLength: { value: 10.0 },
          uColor: { value: new THREE.Color(0xff5a00) },
          uOpacity: { value: 1.0 }
        },
        side: THREE.DoubleSide
      });
    }


    // clone material for per-meteor uniforms (safe for small numbers)
    const mat = this.meteorBaseMaterial!.clone();
    // clone uniform objects so each meteor can own its own values
    mat.uniforms = THREE.UniformsUtils.clone(this.meteorBaseMaterial!.uniforms);

    // set only uniforms that actually exist on the material
    if (mat.uniforms['uTime']) mat.uniforms['uTime'].value = timeSec;
    if (mat.uniforms['uBirth']) mat.uniforms['uBirth'].value = timeSec;
    if (mat.uniforms['uLifetime']) mat.uniforms['uLifetime'].value = lifetime;
    if (mat.uniforms['uHeadSize']) mat.uniforms['uHeadSize'].value = headRadius;
    if (mat.uniforms['uTrailLength']) mat.uniforms['uTrailLength'].value = trailLen;
    if (mat.uniforms['uColor']) mat.uniforms['uColor'].value = new THREE.Color(0xff4a00);
    if (mat.uniforms['uOpacity']) mat.uniforms['uOpacity'].value = 1.0;


    const mesh = new THREE.Mesh(this.trailPlaneGeo, mat);
    // set position at head location
    mesh.position.set(startX, startY, startZ);

    mesh.frustumCulled = false;  // crucial: shader offsets vertices; avoid CPU culling
    mesh.renderOrder = 999;      // draw after other objects

    const velDir = velocity.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), velDir);
    mesh.quaternion.copy(q);

    mesh.scale.set(1, 1, 1);

    (mesh as any).__meteor = {
      velocity,
      birth: timeSec,
      lifetime,
      headRadius,
      trailLen,
      mat
    };

    this.scene.add(mesh);
    this.meteors.push({ group: mesh, birth: timeSec, lifetime });
  }

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const effectiveTime = this.paused ? this.pausedTime : (now - this.startTime) * 0.001;

    if (this.paused) {
      this.pausedTime = effectiveTime;
    }

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

    const nowMs = performance.now();
    let deltaSeconds = 0;
    if (!this.paused) {
      deltaSeconds = Math.min(0.1, (nowMs - this.lastFrameTimeMs) / 1000);
      this.lastFrameTimeMs = nowMs;
    } else {
      this.lastFrameTimeMs = nowMs;
    }

    const timeSec = effectiveTime;

    if (timeSec - this.lastMeteorSpawn > this.nextMeteorDelay) {
      this.createMeteor(timeSec);
      this.lastMeteorSpawn = timeSec;
      this.nextMeteorDelay = this.spawnDelay * this.randRange(0.8, 1.2);
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      const mesh = m.group as THREE.Mesh;
      const meta = (mesh as any).__meteor;
      if (!meta) continue;

      if (!this.paused) {
        mesh.position.addScaledVector(meta.velocity, deltaSeconds);
      }

      if (meta.mat && meta.mat.uniforms) {
        if (meta.mat.uniforms.uTime) meta.mat.uniforms.uTime.value = timeSec;
        if (meta.mat.uniforms.uOpacity) {
          const age = timeSec - meta.birth;
          const t = age / meta.lifetime;
          const fade = 1.0 - Math.min(1, t);
          meta.mat.uniforms.uOpacity.value = fade;
        }
      }

      const age = timeSec - meta.birth;
      if (age > meta.lifetime) {
        mesh.traverse((o) => {
          if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
          if ((o as any).material) {
            const mat = (o as any).material;
            if (Array.isArray(mat)) mat.forEach((mm: THREE.Material) => mm.dispose());
            else mat.dispose();
          }
        });
        this.scene.remove(mesh);
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

    if (this.paused) {
      this.pausedTime = (performance.now() - this.startTime) * 0.001;
      this.lastFrameTimeMs = performance.now();
    } else {
      this.startTime = performance.now() - this.pausedTime * 1000;
      this.lastFrameTimeMs = performance.now();
    }
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


const METEOR_VERTEX_SHADER = `
precision highp float;

attribute vec3 aPosition;
attribute vec2 aUv;

uniform float uTime;        // seconds
uniform float uBirth;       // meteor birth time (seconds)
uniform float uLifetime;    // meteor lifetime (seconds)
uniform float uHeadSize;    // head radius (local units)
uniform float uTrailLength; // trail length (local units)

varying float vAge;
varying float vHeadFactor;
varying float vAlong;
varying vec2 vUV;

void main() {
  float age = max(0.0, uTime - uBirth);
  vAge = age;
  vUV = aUv;

  // aPosition.x is -0.5..+0.5 -> convert to 0..1 along trail
  float along = (aPosition.x + 0.5);
  vAlong = along;

  // head factor: 1 near head (along == 0), 0 near tail
  vHeadFactor = smoothstep(0.0, 0.2, 1.0 - along);

  // local offsets: head at local origin, tail at -uTrailLength along local +X
  float xOff = -along * uTrailLength;
  float yOff = aPosition.y * uHeadSize;

  vec3 localPos = vec3(xOff, yOff, 0.0);

  vec4 mvPos = modelViewMatrix * vec4(localPos, 1.0);
  gl_Position = projectionMatrix * mvPos;
}
`;

const METEOR_FRAGMENT_SHADER = `
precision highp float;

varying float vAge;
varying float vHeadFactor;
varying float vAlong;
varying vec2 vUV;

uniform float uLifetime;
uniform vec3 uColor;
uniform float uOpacity;

void main() {
  float y = vUV.y - 0.5;
  float widthFall = smoothstep(0.6, 0.0, abs(y) * 2.0);

  float tailFall = smoothstep(0.0, 1.0, vAlong);

  float headBoost = pow(vHeadFactor, 1.4);

  float lifeT = clamp(vAge / max(0.0001, uLifetime), 0.0, 1.0);
  float lifeFade = 1.0 - lifeT;

  vec3 col = uColor * (0.6 + 0.8 * headBoost) * mix(1.0, 0.6, tailFall);
  float alpha = widthFall * (0.9 * headBoost + 0.4 * (1.0 - vHeadFactor)) * lifeFade * uOpacity;

  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

