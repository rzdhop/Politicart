// The sound sink the game server installs (DEC-014). Without a sink, sounds
// play locally (and silently here: there is no AudioContext in node).
import { afterEach, describe, expect, it } from 'vitest';

import { setSfxSink, sfx, sfxFor } from './audio.js';

afterEach(() => setSfxSink(null));

describe('sound routing', () => {
  it('sends race-wide sounds to the sink with no recipient', () => {
    const heard = []; setSfxSink((name, k) => heard.push([name, k]));
    sfx('go');
    expect(heard).toEqual([['go', null]]);
  });

  it('sends a driver sound with its kart, and drops it for AI karts', () => {
    const heard = []; setSfxSink((name, k) => heard.push([name, k]));
    const human = { isAI: false }, bot = { isAI: true };
    sfxFor(human, 'lap'); sfxFor(bot, 'lap');
    expect(heard).toEqual([['lap', human]]);
  });

  it('plays nothing and throws nothing without a sink or an audio context', () => {
    expect(() => { sfx('boost'); sfxFor({ isAI: false }, 'hit'); }).not.toThrow();
  });
});
