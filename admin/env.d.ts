/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端业务 API 根地址（deploy.sh build 时注入 VITE_API_BASE_URL）；开发不注入，走 vite proxy。 */
  readonly VITE_API_BASE_URL?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
