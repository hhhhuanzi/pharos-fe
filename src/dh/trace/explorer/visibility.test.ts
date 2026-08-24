import { RELEASE_FLAGS } from '@/dh/releaseFlags';

import { isSpanFlamegraphSwitchVisible } from './visibility';

describe('isSpanFlamegraphSwitchVisible', () => {
  it('hides the Span 火焰图 switch while the 1.2.0 flag is off', () => {
    expect(RELEASE_FLAGS.spanFlamegraph).toBe(false);
    expect(isSpanFlamegraphSwitchVisible()).toBe(false);
  });
});
