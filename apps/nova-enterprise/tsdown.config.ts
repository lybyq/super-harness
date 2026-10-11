import { clientBundle } from '../../packages/client/tsdown.client.ts'

const id = '@deepseek-ai/dsh-nova-enterprise'
/** 官方 Host 编译产物与 Client 工厂分别打包；生产包不依赖 TS Loader 或源码目录。 */
export default clientBundle(id, ['lib/types/host/index.js'], { hostPhase: true, lib: { sourcemap: true } })
