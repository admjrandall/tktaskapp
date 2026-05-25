import { NullAdapter } from '@adapter-null/index.js'
import { setAdapter } from '@core/storage/db.js'
import { init } from '@core/main.js'

setAdapter(new NullAdapter())
void init()
