export declare function readFrontmatter(raw: string): {
  data: Record<string, string | string[]>;
  body: string;
};
export declare function wikilinksToMarkdown(
  body: string,
  slugByName: Map<string, string>,
): string;
export declare function mdPathForPage(pagePath: string): string;
export declare function pagePathForMd(mdPath: string): string;
export declare function mdParamForPage(pagePath: string): string;
export declare function link(label: string, href: string): string;
export declare function joinBlocks(blocks: (string | null | undefined)[]): string;
export declare function slugify(basename: string): string;
