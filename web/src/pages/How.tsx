// The story and the mechanism in one page.
export default function How() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Yap-to-earn that nobody can switch off</h1>
          <p>On 15 Jan 2026 X banned apps that reward posting. The next day Kaito shut down Yaps, the product behind about 70% of its token's use. One API decision ended a whole category. YAP rebuilds it on near.social, where every post, like and follow is a NEAR transaction: public data that no platform can revoke.</p>
        </div>
      </div>
      <div className="steps" style={{ marginBottom: 14 }}>
        <div className="step"><div className="n">01 · POST</div><h3 style={{ margin: '6px 0' }}>Yap on near.social</h3><p className="muted">Posts, replies, quotes, likes, reposts and follows are writes to the account <span className="mono">social</span> via FastData KV. Any near.social client shows them; YAP just reads the chain.</p></div>
        <div className="step"><div className="n">02 · SCORE</div><h3 style={{ margin: '6px 0' }}>Deterministic score + attested AI</h3><p className="muted">At each epoch end an AI model running in a verified TEE (Intel TDX + NVIDIA, NEAR AI Cloud) labels post quality 0–3. Everything else is open, integer-math code: PageRank smart followers, engagement weights, caps. Anyone can rerun it.</p></div>
        <div className="step"><div className="n">03 · REPORT</div><h3 style={{ margin: '6px 0' }}>2-of-3 scorers, challengeable</h3><p className="muted">Bonded scorers submit the same report hash (data hash, labels hash, attestation hash, Merkle root). For a window anyone can challenge it; the token contract opens a Sputnik DAO proposal and the council rules. Wrong scorers lose their bond.</p></div>
        <div className="step"><div className="n">04 · MINT OR BURN</div><h3 style={{ margin: '6px 0' }}>Supply follows attention</h3><p className="muted">Attention ≥ 80% of its moving target: loud epoch, mint up to 3× base emission plus a streak bonus (+5% per loud epoch, cap +50%). Below: quiet, the streak resets and 3% of the Reserve burns. No report at all: dead, 10% burns.</p></div>
        <div className="step"><div className="n">05 · CLAIM</div><h3 style={{ margin: '6px 0' }}>Merkle claims, use it or lose it</h3><p className="muted">80% of each mint goes to yappers by score, 10% to sYAP stakers, 10% to the community DAO. Claim with a proof; anything unclaimed after 14 epochs burns.</p></div>
        <div className="step"><div className="n">06 · ARENAS</div><h3 style={{ margin: '6px 0' }}>Communities pay for attention</h3><p className="muted">A DAO escrows a pool for a topic. Each epoch it pays the top voices on that topic, weighted by score, above a reputation tier. Reputation is earned on chain, not bought.</p></div>
      </div>
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Kaito feature → YAP on NEAR</h2>
          <table className="tbl">
            <tbody>
              {[
                ['Yap points', 'Yap score per epoch, minted as $YAP (NEP-141)'],
                ['Mindshare', 'Share of Yap score, per account and per topic'],
                ['Smart followers', 'PageRank over the near.social follow graph, stake-weighted'],
                ['Yapper leaderboards', 'Global and per-topic, any window'],
                ['Project leaderboards / campaigns', 'Arenas funded by Sputnik DAO proposals'],
                ['Staked token boosts', 'sYAP: weight on your engagement + stakers\' share'],
                ['Anti-slop filters', 'TEE-attested AI quality labels, hashed on chain'],
                ['Closed scoring', 'Open code, published data, verify in your browser'],
                ['Platform can revoke API', 'Data is on chain; nothing to revoke'],
              ].map(([a, b]) => <tr key={a} style={{ cursor: 'default' }}><td className="muted">{a}</td><td>{b}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>NEAR pieces used</h2>
          <ul className="muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
            <li><b>NEP-141</b> token with the mechanic in the contract; no admin key (all full-access keys deleted).</li>
            <li><b>near.social</b> (social-kv/1 on FastData KV) as the data source; writes from the app.</li>
            <li><b>Sputnik DAO v2</b>: treasury, arena funding, court of appeal (works in <b>Trezu</b>).</li>
            <li><b>NEAR AI Cloud</b> private inference with TEE attestation for labels.</li>
            <li><b>Named accounts</b>: reputation tiers are tied to account IDs, every point traceable to posts.</li>
          </ul>
          <h2 style={{ margin: '16px 0 8px' }}>Limits, plainly</h2>
          <ul className="muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
            <li>Sybil resistance makes farming expensive, not impossible: in simulation a 10-account ring still captures ~19% of emission.</li>
            <li>Labels come from one model; their hash is on chain but a different model would label differently.</li>
            <li>The testnet community is simulated (24 personas, clearly marked). Mainnet near.social is shown read-only.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
