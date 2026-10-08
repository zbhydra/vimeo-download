/**
 * 应用入口
 *
 * 初始化 Vue 3 + Pinia + Router + i18n + Naive UI
 */
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/global.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import i18n from "./i18n";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.mount("#app");
