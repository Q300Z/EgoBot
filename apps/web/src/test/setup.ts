import { config } from "@vue/test-utils";
import { vi } from "vitest";

// Polyfill ResizeObserver for Vuetify 3 in JSDOM
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as any;

// Mock window.scrollTo
if (typeof window !== "undefined") {
  window.scrollTo = vi.fn();
}

// Mock EventSource
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = MockEventSource.OPEN;
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

global.EventSource = MockEventSource as any;
