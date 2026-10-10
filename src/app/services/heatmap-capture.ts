import { Injectable } from '@angular/core';

export interface HeatmapCaptureRequest {
  readonly width: number;
  readonly height: number;
}

export interface HeatmapPixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export type HeatmapCapturer = (request: HeatmapCaptureRequest) => Promise<HeatmapPixels>;

@Injectable({ providedIn: 'root' })
export class HeatmapCapture {
  private capturer: HeatmapCapturer | null = null;

  register(capturer: HeatmapCapturer): () => void {
    this.capturer = capturer;
    return () => {
      if (this.capturer === capturer) {
        this.capturer = null;
      }
    };
  }

  capture(request: HeatmapCaptureRequest): Promise<HeatmapPixels | null> {
    return this.capturer === null ? Promise.resolve(null) : this.capturer(request);
  }
}
