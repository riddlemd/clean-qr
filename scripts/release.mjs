#!/usr/bin/env node
// Obtaining the signed XPI is AMO's problem (amo/get-signed-xpi.mjs); creating the
// release is GitHub's (github/release.mjs). This just orders the two.

import { VERSION, manifest } from "./amo/client.mjs";
import { getSignedXpi } from "./amo/get-signed-xpi.mjs";
import { assertReleasable, publishRelease } from "./github/release.mjs";

const TAG = `v${VERSION}`;

// Checked first: a taken tag or a missing gh login should not cost a download.
assertReleasable(TAG);

const file = await getSignedXpi();

publishRelease({
  tag: TAG,
  file,
  title: `${manifest.name} ${VERSION}`,
  notes:
    "Install from [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/clean-qr/), " +
    "or download the signed `.xpi` below and open it in Firefox.",
});
