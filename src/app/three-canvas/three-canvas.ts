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

@Component({
  selector: 'app-three-canvas',
  templateUrl: './three-canvas.html',
  standalone: true,
  styleUrls: ['./three-canvas.css'],
  encapsulation: ViewEncapsulation.None
})
export class ThreeCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private stars!: THREE.Points;
  private frameId: number | null = null;
  private startTime = performance.now();

  // UI variables
  public speed = 2.0;
  public density = 2000;

  // Star uniforms
  private uniforms!: { uTime: { value: number }, uSpeed: { value: number } };

  constructor(private ngZone: NgZone) {}

  ngOnInit(): void {
    this.initScene();
    this.ngZone.runOutsideAngular(() => this.animate());
    window.addEventListener('resize', this.onResize);
  }

  private initScene() {
    const el = this.container.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.setClearColor(0x000000, 1); // black background

    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 1000);
    this.camera.position.z = 50;

    // Create star geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.density * 3);
    for (let i = 0; i < this.density; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 2] = -Math.random() * 500; // z
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.uniforms = {
      uTime: { value: 0 },
      uSpeed: { value: this.speed }
    };

    // Star material using shader for glowing stars
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms as any,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.stars = new THREE.Points(geometry, material);
    this.scene.add(this.stars);
  }

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    const now = performance.now();
    this.uniforms.uTime.value = (now - this.startTime) * 0.001;

    // Move stars forward
    const positions = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      positions.setZ(i, positions.getZ(i) + this.speed * 0.1);
      if (positions.getZ(i) > 5) positions.setZ(i, -500 + Math.random() * 10);
    }
    positions.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    const el = this.container.nativeElement;
    this.camera.aspect = el.clientWidth / el.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(el.clientWidth, el.clientHeight);
  };

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.frameId != null) cancelAnimationFrame(this.frameId);
    this.renderer.dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.ShaderMaterial).dispose();
  }

  public updateSpeed(v: number) { this.speed = v; this.uniforms.uSpeed.value = v; }
  public updateDensity(v: number) {
  this.density = v;

  // Remove old stars
  this.scene.remove(this.stars);
  (this.stars.geometry as THREE.BufferGeometry).dispose();
  (this.stars.material as THREE.ShaderMaterial).dispose();

  // Create new geometry
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(this.density * 3);
  for (let i = 0; i < this.density; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200; // x
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200; // y
    positions[i * 3 + 2] = -Math.random() * 500; // z
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Reuse the same material
  this.stars = new THREE.Points(geometry, this.stars.material);
  this.scene.add(this.stars);
}

}

// ---------------- GLSL Shaders ----------------
const VERTEX_SHADER = `
precision highp float;
uniform float uTime;
uniform float uSpeed;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = 2.0 + (50.0 / abs(mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
precision highp float;
void main() {
  float dist = distance(gl_PointCoord, vec2(0.5));
  if (dist > 0.5) discard;
  gl_FragColor = vec4(vec3(1.0), 1.0);
}
`;
