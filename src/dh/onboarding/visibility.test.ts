import { RELEASE_FLAGS } from '@/dh/releaseFlags';

import { isUpstreamOnboardingVisible } from './visibility';

describe('isUpstreamOnboardingVisible', () => {
  it('hides the upstream onboarding entries while the flag is off', () => {
    expect(RELEASE_FLAGS.upstreamOnboarding).toBe(false);
    expect(isUpstreamOnboardingVisible()).toBe(false);
  });
});
