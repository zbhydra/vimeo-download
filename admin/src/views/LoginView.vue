<!--
  登录页面

  流程：
  1. 页面加载 → 请求验证码（captcha_id + base64 图片）
  2. 用户填写 用户名 + 密码 + 验证码
  3. 点击登录 → 调用 login API
  4. 成功 → 存储 Token → 跳转首页
  5. 失败 → 自动刷新验证码 → 显示错误信息
-->
<template>
  <div class="login-wrapper">
    <NCard class="login-card" :title="t('login.title')">
      <NForm ref="formRef" :model="form" :rules="rules" label-placement="left">
        <NFormItem :label="t('login.username')" path="username">
          <NInput
            v-model:value="form.username"
            :placeholder="t('login.username')"
            @keyup.enter="handleLogin"
          />
        </NFormItem>

        <NFormItem :label="t('login.password')" path="password">
          <NInput
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            :placeholder="t('login.password')"
            @keyup.enter="handleLogin"
          />
        </NFormItem>

        <NFormItem :label="t('login.captcha')" path="captcha_code">
          <div class="captcha-row">
            <NInput
              v-model:value="form.captcha_code"
              :placeholder="t('login.captchaPlaceholder')"
              @keyup.enter="handleLogin"
            />
            <div
              class="captcha-img"
              :title="t('login.clickToRefresh')"
              @click="loadCaptcha"
            >
              <img
                v-if="captchaImg"
                :src="captchaImg"
                alt="captcha"
              />
              <NSpin v-else size="small" />
            </div>
          </div>
        </NFormItem>

        <NButton
          type="primary"
          block
          :loading="loading"
          @click="handleLogin"
        >
          {{ t("login.submit") }}
        </NButton>
      </NForm>
    </NCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NSpin,
  useMessage,
  type FormInst,
  type FormRules,
} from "naive-ui";
import { getCaptcha, login, type LoginParams } from "@/api/auth";
import { useAuthStore } from "@/stores/auth";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const message = useMessage();
const auth = useAuthStore();

const formRef = ref<FormInst | null>(null);
const loading = ref(false);
const captchaImg = ref("");

const form = ref({
  username: "",
  password: "",
  captcha_id: "",
  captcha_code: "",
});

const rules: FormRules = {
  username: { required: true, message: t("login.username"), trigger: "blur" },
  password: { required: true, message: t("login.password"), trigger: "blur" },
  captcha_code: { required: true, message: t("login.captcha"), trigger: "blur" },
};

/** 加载验证码 */
async function loadCaptcha() {
  try {
    const data = await getCaptcha();
    form.value.captcha_id = data.captcha_id;
    captchaImg.value = `data:image/png;base64,${data.image_base64}`;
  } catch (err) {
    message.error(`${err}`);
  }
}

/** 提交登录 */
async function handleLogin() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  loading.value = true;
  try {
    const params: LoginParams = {
      username: form.value.username,
      password: form.value.password,
      captcha_id: form.value.captcha_id,
      captcha_code: form.value.captcha_code,
    };

    const data = await login(params);
    auth.setTokens(data.access_token, data.refresh_token);
    message.success(t("login.success"));

    const redirect = (route.query.redirect as string) || "/";
    await router.push(redirect);
  } catch (err) {
    message.error(`${err}`);
    loadCaptcha();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadCaptcha();
});
</script>

<style scoped>
.login-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  /* 移动端浏览器地址栏收展不引起高度跳变；不支持时回退 100vh */
  min-height: 100dvh;
  padding: 16px;
  box-sizing: border-box;
  background: #f0f2f5;
}

.login-card {
  /* 小屏收窄到视口内，避免 400px 固定宽度溢出 */
  width: min(400px, 100%);
}

.captcha-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.captcha-img {
  flex-shrink: 0;
  width: 120px;
  height: 40px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ddd;
  border-radius: 3px;
  overflow: hidden;
}

.captcha-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
