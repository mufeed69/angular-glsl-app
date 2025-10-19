import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThreeCanvasComponent } from './three-canvas/three-canvas';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ThreeCanvasComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('3d-angular-app');
}
