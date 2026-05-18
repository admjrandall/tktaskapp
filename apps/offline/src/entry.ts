import { NullAdapter } from '@adapter-null/index.js';
import { setAdapter } from '@core/db.js';
import { OT_ONLY_DEPLOYMENT_POLICY, setDeploymentPolicy } from '@core/deployment-policy.js';
import { init } from '@core/main.js';

setDeploymentPolicy({
  ...OT_ONLY_DEPLOYMENT_POLICY,
  ai: {
    ...OT_ONLY_DEPLOYMENT_POLICY.ai,
    allowedConnectSrc: __OT_AI_CONNECT_SRC__.split(/\s+/).filter(Boolean),
  },
});
setAdapter(new NullAdapter());
init();
