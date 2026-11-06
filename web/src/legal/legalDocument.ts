/** Typed form of a canonical legal document from the repository `legal/` directory. */
export type LegalInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'placeholder'; name: string };

export type LegalListItem = {
  content: LegalInline[];
  children: LegalInline[][];
};

export type LegalBlock =
  | { kind: 'heading'; id: string; content: LegalInline[] }
  | { kind: 'paragraph'; content: LegalInline[] }
  | { kind: 'list'; ordered: boolean; items: LegalListItem[] };

export type LegalDocument = {
  document: string;
  locale: string;
  version: string;
  status: string;
  title: string;
  placeholders: string[];
  blocks: LegalBlock[];
};
