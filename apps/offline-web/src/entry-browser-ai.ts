import { NullAdapter } from '@adapter-null/index.js'
import { setAdapter } from '@core/storage/db.js'
import { setDeploymentPolicy } from '@core/deployment-policy.js'
import { init } from '@core/main.js'
import { OFFLINE_BROWSER_AI_PROFILE } from '@config/build-profiles/offline-browser-ai.profile.js'
import { toPolicy } from '@config/build-profiles/to-policy.js'

const connectSrc = __OT_AI_CONNECT_SRC__.split(/\s+/).filter(Boolean)
setDeploymentPolicy(toPolicy(OFFLINE_BROWSER_AI_PROFILE, connectSrc))
setAdapter(new NullAdapter())
void init()
