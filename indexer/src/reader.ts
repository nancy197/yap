import type { Write } from '@yap/scoring';

export type Network = 'mainnet' | 'testnet';
const bases: Record<Network,string> = {mainnet:'https://kv.main.fastnear.com',testnet:'https://kv.test.fastnear.com'};
interface RawEntry { predecessor_id: string; current_account_id: string; key: string; value: unknown; block_height: number; block_timestamp: string; receipt_id?: string; action_index?: number; }
interface Page {entries: RawEntry[]; page_token?: string;}
export async function* history(network: Network, onPage?: (pages:number,rows:number)=>void, fetcher: typeof fetch = fetch): AsyncGenerator<Write> {
  let pageToken: string | undefined, pages=0, rows=0;
  const seen = new Set<string>();
  do {
    const body: Record<string,unknown> = {limit:200,asc:false,include_metadata:true};
    if (pageToken) body.page_token = pageToken;
    let response: Response | undefined;
    for (let attempt=0;attempt<5;attempt++) {
      try {
        response = await fetcher(`${bases[network]}/v0/history/social`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
        if (response.ok) break;
        if (![429,500,502,503,504].includes(response.status)) throw new Error(`FastData HTTP ${response.status}: ${await response.text()}`);
      } catch (error) { if (attempt===4) throw error; }
      if (attempt===4) throw new Error(`FastData HTTP ${response?.status}`);
      await new Promise(resolve=>setTimeout(resolve,500*2**attempt));
    }
    if (!response?.ok) throw new Error('FastData unavailable');
    // The API emits u64 nanoseconds as JSON numbers; quote them before JSON.parse.
    const text = (await response.text()).replace(/("block_timestamp"\s*:\s*)(\d+)/g,'$1"$2"');
    const page = JSON.parse(text) as Page;
    if (!Array.isArray(page.entries)) throw new Error('invalid FastData page');
    for (const raw of page.entries) {
      if (raw.current_account_id!=='social') continue;
      rows++;
      yield {predecessorId:raw.predecessor_id,key:raw.key,value:raw.value,blockHeight:raw.block_height,blockTimestamp:String(raw.block_timestamp),receiptId:raw.receipt_id ?? '',actionIndex:raw.action_index ?? 0,sourceOrdinal:rows};
    }
    pages++; onPage?.(pages,rows);
    pageToken = page.page_token;
    if (pageToken) { if (seen.has(pageToken)) throw new Error('repeated FastData page_token'); seen.add(pageToken); }
  } while(pageToken);
}
