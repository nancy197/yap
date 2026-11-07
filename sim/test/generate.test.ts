import {expect,it} from 'vitest';
import {SocialWorld} from '../src/generate.js';

it('replays reproducible social writes and stops the dead-meme activity at epoch 20',()=>{
  const a=new SocialWorld('dead-meme'),b=new SocialWorld('dead-meme');
  for(let epoch=0;epoch<=20;epoch++) {
    const left=a.epoch(epoch),right=b.epoch(epoch);
    expect(left.dataset.dataHash).toBe(right.dataset.dataHash);
    expect(left.labels).toEqual(right.labels);
    if(epoch===0) {
      expect(left.dataset.posts.some(p=>p.replyTo)).toBe(true);
      expect(left.dataset.posts.some(p=>p.quote)).toBe(true);
      expect(left.dataset.likes.length).toBeGreaterThan(0);
      expect(left.dataset.reposts.length).toBeGreaterThan(0);
      expect(left.dataset.follows.length).toBeGreaterThan(0);
    }
    if(epoch===20) expect(left.dataset.posts).toHaveLength(0);
  }
});
