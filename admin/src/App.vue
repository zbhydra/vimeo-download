<!--
  根组件：Naive UI Provider 包裹
  NConfigProvider → NMessageProvider → NDialogProvider → RouterView
-->
<template>
  <NConfigProvider>
    <NMessageProvider>
      <NDialogProvider>
        <RouterView />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NDialogProvider } from "naive-ui";
</script>
