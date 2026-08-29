export interface AcceptEntry {
  type: string;
  q: number;
  specificity: 0 | 1 | 2;
  index: number;
}

export declare const PRODUCES: string[];
export declare function parseAccept(header: string): AcceptEntry[];
export declare function selectRepresentation(
  header: string | null | undefined,
  produces?: string[],
): string | null;
export declare function prefersMarkdown(header: string | null | undefined): boolean;
export declare function varyAccept(existing: string | null | undefined): string;
export declare function notAcceptableBody(
  header: string | null | undefined,
  produces?: string[],
): string;
