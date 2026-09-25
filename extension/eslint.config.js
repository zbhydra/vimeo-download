import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import prettierConfig from '@vue/eslint-config-prettier'

export default [
  // =============================================================================
  // 基础配置
  // =============================================================================
  js.configs.recommended,

  // =============================================================================
  // Vue 配置
  // =============================================================================
  ...pluginVue.configs['flat/recommended'],

  // =============================================================================
  // Vue TypeScript 配置
  // =============================================================================
  ...vueTsEslintConfig(),

  // =============================================================================
  // Prettier 集成（必须放在最后，禁用所有格式规则）
  // =============================================================================
  prettierConfig,

  // =============================================================================
  // 全局配置
  // =============================================================================
  {
    name: 'global-settings',
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Chrome Extension API
        chrome: 'readonly',
        browser: 'readonly',
        // Vite 全局常量
        __API_BASE_URL__: 'readonly',
        __DEV__: 'readonly',
        __WEBSITE_BASE_URL__: 'readonly',
        __ALI_SLS_MARK_CONFIG__: 'readonly'
      }
    }
  },

  // =============================================================================
  // 通用规则覆盖
  // =============================================================================
  {
    name: 'common-rules',
    rules: {
      // 代码质量
      'no-console': ['warn', { allow: ['warn', 'error', 'debug', 'info'] }],
      'no-debugger': 'warn',
      'no-alert': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      // Chrome 扩展需要禁止的全局变量
      'no-restricted-globals': [
        'error',
        {
          name: 'name',
          message: 'Use window.name or a local variable instead.'
        },
        {
          name: 'length',
          message: 'Use a local variable instead.'
        },
        {
          name: 'event',
          message: 'Use a local variable instead.'
        }
      ]
    }
  },

  // =============================================================================
  // Vue 规则覆盖
  // =============================================================================
  {
    name: 'vue-rules',
    files: ['**/*.vue'],
    rules: {
      // 多属性换行由 Prettier 处理
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      // 组件命名 - 允许单词组件名（如 Icon）
      'vue/multi-word-component-names': 'off',
      'vue/component-definition-name-casing': ['error', 'PascalCase'],
      'vue/component-name-in-template-casing': [
        'error',
        'PascalCase',
        {
          registeredComponentsOnly: false,
          ignores: ['/^[a-z][a-z0-9]*$/']
        }
      ],
      // Props 命名
      'vue/prop-name-casing': ['error', 'camelCase'],
      // 允许 v-for 使用索引
      'vue/no-v-html': 'off',
      'vue/require-default-prop': 'off',
      'vue/require-prop-types': 'off',
      // 自闭合标签
      'vue/html-self-closing': [
        'error',
        {
          html: {
            void: 'always',
            normal: 'never',
            component: 'always'
          },
          svg: 'always',
          math: 'always'
        }
      ]
    }
  },

  // =============================================================================
  // 特定文件类型规则覆盖
  // =============================================================================
  {
    name: 'background',
    files: ['**/background/**/*.ts'],
    rules: {
      // background 中允许 case 块中的词法声明（已用大括号包裹）
      'no-case-declarations': 'off'
    }
  },

  // =============================================================================
  // TypeScript 规则覆盖
  // =============================================================================
  {
    name: 'typescript-rules',
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // 返回类型仅在推断失败时要求
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      // 允许空接口和类型（用于扩展第三方类型）
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // 允许动态 key 访问
      '@typescript-eslint/no-dynamic-delete': 'off',
      // 项目中使用了非 Promise 的 async 函数（如某些初始化函数）
      '@typescript-eslint/require-await': 'off'
    }
  },

  // =============================================================================
  // 特定文件类型规则覆盖
  // =============================================================================
  {
    name: 'type-definition-files',
    files: ['**/*.d.ts', '**/vite-env.d.ts', '**/global.d.ts'],
    rules: {
      // 类型定义文件允许使用 any
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },

  {
    name: 'rpc-types',
    files: ['**/rpc/*Types.ts'],
    rules: {
      // RPC 类型定义需要 any 类型用于序列化
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },

  {
    name: 'rpc-files',
    files: ['**/rpc/InjectedRpc*.ts'],
    rules: {
      // RPC 客户端/服务端需要 any 类型用于序列化
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },

  {
    name: 'config-files',
    files: ['*.config.ts', '*.config.js', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts'],
    rules: {
      // 配置文件允许 any
      '@typescript-eslint/no-explicit-any': 'off',
      // 配置文件允许 console
      'no-console': 'off'
    }
  },

  {
    name: 'storage-files',
    files: ['**/storage/**/*.ts'],
    rules: {
      // 存储相关文件允许 any（用于序列化/反序列化）
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },


  {
    name: 'auth-store',
    files: ['**/stores/authStore.ts'],
    rules: {
      // authStore 中需要捕获错误但不使用
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },

  {
    name: 'popup-resource-store',
    files: ['**/stores/resourceStore.ts'],
    rules: {
      // resourceStore 中 any 类型需要警告
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },

  {
    name: 'http-client',
    files: ['**/api/client/HttpClient.ts'],
    rules: {
      // HttpClient 中 parseError 未使用变量
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },

  // =============================================================================
  // 忽略模式
  // =============================================================================
  {
    name: 'ignore-patterns',
    ignores: [
      'dist/**',
      'dist-ssr/**',
      'node_modules/**',
      'tests/**',
      'scripts/**',
      '.claude/**'
    ]
  }
]
