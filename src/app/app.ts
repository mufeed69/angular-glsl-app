import { Component, signal } from '@angular/core';
import { ThreeCanvasComponent } from './three-canvas/three-canvas';

@Component({
  selector: 'app-root',
  imports: [ThreeCanvasComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('3d-angular-app');
}
