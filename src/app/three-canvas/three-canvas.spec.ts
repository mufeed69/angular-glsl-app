import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThreeCanvas } from './three-canvas';

describe('ThreeCanvas', () => {
  let component: ThreeCanvas;
  let fixture: ComponentFixture<ThreeCanvas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThreeCanvas]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ThreeCanvas);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
