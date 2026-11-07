// Verify: recompute an epoch in this browser. Rebuild the score and Merkle root from the published dataset +
// labels with the same open scoring code, and compare against the report the scorers put on chain.
import { useState } from 'react';
import { score, datasetHash, canonical, sha256Hex } from '@yap/scoring';
import { epochIndex, epochFile, view, sc } from '../lib/data';
import { useAsync, Loading } from '../ui/kit';

type Check = { name: string; ok: boolean; detail: string };

export default function Verify({ epoch }: { epoch?: string }) {
  const { data: idx } = useAsync(() => epochIndex(), []);
  const ids = Object.keys(idx?.epochs ?? {}).map(Number).sort((a, b) => b - a);
  const e = epoch != null ? Number(epoch) : ids[0];
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: labels } = useAsync(() => (e != null ? epochFile(e, 'labels').catch(() => null) : Promise.resolve(null)), [e]);
  const run = async () => {
    if (e == null) return;
    setBusy(true);
    setChecks(null);
    const out: Check[] = [];
    try {
      const [d, l, s, chain] = await Promise.all([epochFile(e, 'dataset'), epochFile(e, 'labels'), epochFile(e, 'scores'), view<any>('get_epoch', { e }).catch(() => null)]);
      const t0 = performance.now();
      const dh = datasetHash(d as any);
      out.push({ name: 'Dataset hash matches its content', ok: dh === (d as any).dataHash, detail: dh });
      const lh = sha256Hex(canonical((l as any).labels));
      const rep = chain?.report;
      out.push({ name: 'On-chain report exists', ok: !!rep, detail: chain ? `status ${chain.status}, ${chain.signers?.length ?? 0} scorer signatures` : 'not reported yet' });
      if (rep) {
        out.push({ name: 'data_hash on chain = recomputed', ok: rep.data_hash === dh, detail: rep.data_hash });
        out.push({ name: 'labels_hash on chain = recomputed', ok: rep.labels_hash === lh, detail: rep.labels_hash });
      }
      const r = score(d as any, (l as any).labels, (s as any).stakes ?? {}, { yapperAllocation: (s as any).predictedYapperPool ?? '0', arenas: (s as any).arenas ?? [], trailingScores: (s as any).trailing ?? undefined });
      const ms = (performance.now() - t0).toFixed(0);
      out.push({ name: `Recomputed scores in this browser (${ms} ms)`, ok: true, detail: `${r.yappers.length} yappers, attention ${sc(r.attention).toFixed(3)}` });
      out.push({ name: 'Attention = published', ok: r.attention === (s as any).result.attention, detail: `${r.attention} vs ${(s as any).result.attention}` });
      out.push({ name: 'Yappers root = published', ok: r.yappersRoot === (s as any).result.yappersRoot, detail: r.yappersRoot });
      if (rep) {
        out.push({ name: 'Yappers root = on chain', ok: r.yappersRoot === rep.yappers_root, detail: rep.yappers_root });
        out.push({ name: 'Attention = on chain', ok: r.attention === rep.attention, detail: rep.attention });
      }
    } catch (err) {
      out.push({ name: 'Error', ok: false, detail: String((err as Error).message ?? err) });
    }
    setChecks(out);
    setBusy(false);
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Verify an epoch</h1>
          <p>Don't trust the scorers. Download the epoch's near.social data and the AI labels, rerun the open scoring code here in your browser, and check that the Merkle root matches what is on chain. The AI labels are the only non-deterministic input: their hash, the prompt hash and the TEE attestation hash are in the on-chain report. If anything is off, anyone can challenge the epoch and the community DAO decides.</p>
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <select className="in" style={{ maxWidth: 200 }} value={e ?? ''} onChange={(ev) => { location.hash = `#/verify/${ev.target.value}`; setChecks(null); }}>
          {ids.map((i) => <option key={i} value={i}>Epoch #{i}</option>)}
        </select>
        <button className="btn primary" disabled={busy || e == null} onClick={run}>{busy ? 'Recomputing…' : 'Recompute & compare'}</button>
        {e != null && <><a className="btn ghost" href={`./epochs/testnet/${e}/dataset.json`} target="_blank">dataset.json</a><a className="btn ghost" href={`./epochs/testnet/${e}/labels.json`} target="_blank">labels.json</a><a className="btn ghost" href={`./epochs/testnet/${e}/scores.json`} target="_blank">scores.json</a></>}
      </div>
      {!idx ? <Loading /> : !ids.length ? <div className="empty">No epochs published yet.</div> : (
        <div className="grid g-main">
          <div className="card pad0">
            {!checks ? <div className="empty">Press “Recompute & compare”.</div> : checks.map((c) => (
              <div key={c.name} className="log-row" style={{ gridTemplateColumns: '28px 1fr' }}>
                <span style={{ color: c.ok ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>{c.ok ? '✓' : '✕'}</span>
                <div style={{ minWidth: 0 }}><div>{c.name}</div><div className="mono faint ellip" style={{ fontSize: 11 }}>{c.detail}</div></div>
              </div>
            ))}
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 10 }}>Labeler</h2>
            {!labels ? <Loading /> : (
              <dl className="kv">
                <dt>Model</dt><dd>{labels.model}</dd>
                <dt>Simulated</dt><dd>{labels.simulated ? 'yes (heuristic)' : 'no'}</dd>
                <dt>Prompt sha256</dt><dd>{labels.promptHash?.slice(0, 16)}…</dd>
                <dt>Posts labelled</dt><dd>{labels.details?.length}</dd>
                <dt>TEE attestation</dt><dd>{labels.attestation ? (labels.attestation.verified ? '✓ verified' : '✕ failed') : 'cached labels only'}</dd>
                <dt>Cost</dt><dd>${(labels.usage?.usd ?? 0).toFixed(4)}</dd>
              </dl>
            )}
            {labels?.attestation && (
              <details style={{ marginTop: 10 }}>
                <summary className="link">{labels.attestation.checks.length} attestation checks</summary>
                {labels.attestation.checks.map((c: any) => <div key={c.name} className="note">{c.passed ? '✓' : '✕'} {c.name}</div>)}
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
