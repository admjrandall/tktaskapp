import { NullAdapter } from '../../../packages/adapter-null/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import { init } from '../../../packages/core/src/main.js'

// TODO: swap NullAdapter for RxDBAdapter once packages/adapter-rxdb is implemented
setAdapter(new NullAdapter())
void init()
