// 画面の切り替え（design.md §7.5）。ハッシュの経路に応じてトップかローカル対戦を出す。
import { useEffect, useState } from 'react';
import { ArtDefs } from './assets/art.tsx';
import { LocalGame } from './LocalGame.tsx';
import { OnlineRoom } from './OnlineRoom.tsx';
import { Top } from './Top.tsx';
import { localHash, parseRoute, randomSeed } from './route.ts';

const readRoute = () => parseRoute(window.location.hash, window.location.search);

export const App = () => {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // シードの指定がなければ作り、URL に書き込む。再読み込みしても同じ配置から始まる（D-17）。
  useEffect(() => {
    if (route.name === 'local' && route.seed === null) {
      const seed = randomSeed();
      window.history.replaceState(null, '', localHash(route.players, seed));
      setRoute({ ...route, seed });
    }
  }, [route]);

  // 駒の絵の定義（ArtDefs）はどの画面でも 1 回だけ置く。
  let screen = <Top />;
  if (route.name === 'local') {
    screen = route.seed === null ? <></> : <LocalGame key={`${route.players}:${route.seed}`} players={route.players} seed={route.seed} />;
  } else if (route.name === 'room') {
    screen = <OnlineRoom key={route.code} code={route.code} />;
  }
  return (
    <>
      <ArtDefs />
      {screen}
    </>
  );
};
