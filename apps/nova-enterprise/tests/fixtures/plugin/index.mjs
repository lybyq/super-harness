/** 测试原生 Host Plugin 参数注入与撤销；不注册模型工具或接触用户文件。 */
export const name = 'harness-test-plugin';
export function apply(ctx, config) { ctx.provide('harnessFixtureValue', config.value); }
