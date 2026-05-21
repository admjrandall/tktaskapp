import { NullAdapter } from '@adapter-null/index.js'
import { setAdapter } from '@core/storage/db.js'
import { setDeploymentPolicy } from '@core/deployment-policy.js'
import { init } from '@core/main.js'
import { OFFLINE_NO_AI_PROFILE } from '@config/build-profiles/offline-no-ai.profile.js'
import { toPolicy } from '@config/build-profiles/to-policy.js'

setDeploymentPolicy(toPolicy(OFFLINE_NO_AI_PROFILE))
setAdapter(new NullAdapter())
void init()
