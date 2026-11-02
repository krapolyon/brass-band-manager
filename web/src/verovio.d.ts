// Verovio ships no types. Only what the Live mode calls is described here.
declare module 'verovio/wasm' {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(options: Record<string, string | number | boolean>): void;
    /** False when the score could not be read. */
    loadData(data: string): boolean;
    getPageCount(): number;
    renderToSVG(page: number): string;
    /** When each note and rest starts, in quarter notes, and each measure. */
    renderToTimemap(options: Record<string, boolean>): {
      qstamp: number;
      on?: string[];
      restsOn?: string[];
      measureOn?: string;
    }[];
    destroy(): void;
  }
}
