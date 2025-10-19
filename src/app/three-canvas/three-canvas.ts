import {
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';

interface UniformEntry<T = any> { value: T; }
interface Uniforms {
  uTime: UniformEntry<number>;
  uColor: UniformEntry<THREE.Color>;
  uIntensity: UniformEntry<number>;
  uPulse: UniformEntry<number>;
}

@Component({
  selector: 'app-three-canvas',
  templateUrl: './three-canvas.html',
  styleUrls: ['./three-canvas.css']
})
export class ThreeCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private frameId: number | null = null;
  private startTime = performance.now();

  private uniforms!: Uniforms;
  private sphere!: THREE.Mesh;

  // UI bound variables
  public orbColor = '#6b8cff';
  public intensity = 0.5;
  public pulse = 1.0;

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
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 100);
    this.camera.position.set(0, 0, 3);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const point = new THREE.PointLight(0xffffff, 1);
    point.position.set(5, 5, 5);
    this.scene.add(point);

    // uniforms for shader
    this.uniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(this.orbColor) },
      uIntensity: { value: this.intensity },
      uPulse: { value: this.pulse }
    };

    // create sphere geometry
    const geometry = new THREE.SphereGeometry(1, 128, 128);
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms as unknown as { [k: string]: { value: any } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.DoubleSide,
      transparent: true
    });

    this.sphere = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphere);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
  }

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    const now = performance.now();
    this.uniforms.uTime.value = (now - this.startTime) * 0.001;
    this.controls.update();
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
    this.sphere.geometry.dispose();
    (this.sphere.material as THREE.ShaderMaterial).dispose();
  }

  // UI callbacks
  public updateColor(hex: string) {
    this.uniforms.uColor.value.set(hex);
  }
  public updateIntensity(v: number) {
    this.uniforms.uIntensity.value = v;
  }
  public updatePulse(v: number) {
    this.uniforms.uPulse.value = v;
  }
}

// ----------------- GLSL Shaders -----------------
const VERTEX_SHADER = `
precision highp float;
varying vec3 vPos;
varying vec3 vNormal;
void main() {
  vPos = position;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform float uTime;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uPulse;
varying vec3 vPos;
varying vec3 vNormal;

// Simple 3D noise function
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453);
}
float noise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                    mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                    mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  return n;
}

void main(){
  float n = noise(vPos * 3.0 + uTime * uPulse);
  float intensity = smoothstep(0.2, 0.8, n) * uIntensity;
  vec3 col = uColor * intensity;
  gl_FragColor = vec4(col, 1.0);
}
`;
