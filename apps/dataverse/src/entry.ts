import { DataverseAdapter } from '../../../packages/adapter-dataverse/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import { init } from '../../../packages/core/src/main.js'

// TODO: pass Dataverse config (org URL, table prefix) once adapter-dataverse is implemented
setAdapter(new DataverseAdapter())
void init()
