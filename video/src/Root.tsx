import { Composition } from 'remotion';
import { Main } from './Main';
import { FPS, totalFrames, SCENES, sceneFrames } from './timeline';

export const Root = () => (
  <>
    <Composition id="YapDemo" component={Main} durationInFrames={totalFrames()} fps={FPS} width={1920} height={1080} />
    {SCENES.map((s) => (
      <Composition key={s.id} id={`Scene-${s.id}`} component={s.component} durationInFrames={sceneFrames(s.id)} fps={FPS} width={1920} height={1080} />
    ))}
  </>
);
