export interface Write {
  predecessorId: string;
  key: string;
  value: unknown;
  blockHeight: number;
  blockTimestamp: string; // nanoseconds; strings retain u64 precision
  receiptId: string;
  actionIndex: number;
  sourceOrdinal?: number; // position in newest-first FastData history scan
}
export interface Post {
  key: string;
  author: string;
  id: string;
  text: string;
  createdAt: string;
  editedAt: string;
  replyTo?: string;
  quote?: string;
  topics: string[];
}
export interface Edge { from: string; to: string; }
export interface EpochDataset {
  schema: 'yap-epoch/1';
  network: 'mainnet' | 'testnet';
  fromMs: number;
  toMs: number;
  epoch: number;
  readOnly: boolean;
  writes: Write[];
  posts: Post[];
  likes: Edge[];
  reposts: Edge[];
  follows: Edge[];
  firstWrites: Record<string, string>;
  dataHash: string;
}
export type Labels = Record<string, 0 | 1 | 2 | 3>;
export type Stakes = Record<string, string>; // raw 18-decimal YAP units
export interface ArenaConfig { id: number; topic: string; minTier: number; amount: string; }
export interface ScoreParams {
  smartPct?: number;
  minFollowers?: number;
  maxPosts?: number;
  yapperAllocation?: string;
  arenas?: ArenaConfig[];
  trailingScores?: Record<string, string[]>;
}
export interface Yapper {
  account: string;
  score: string; // scaled by 1e6
  amount: string; // raw YAP units
  tier: number;
  smartFollowers: number;
  rankNorm: string;
  posts: { key: string; score: string; q: number }[];
  proof: string[];
}
export interface ArenaResult { id: number; topic: string; root: string; yappers: {account: string; score: string; amount: string; proof: string[]}[]; }
export interface ScoreResult {
  attention: string;
  yappersRoot: string;
  yappers: Yapper[];
  arenas: Record<string, ArenaResult>;
  mindshare: {topic: string; score: string; share: string}[];
  smartAccounts: string[];
}
