import { mount, type VueWrapper } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createWebHistory } from 'vue-router'

interface MountOptions {
  withPinia?: boolean
  withRouter?: boolean
  [key: string]: any
}

export function mountComponent(
  component: any,
  options: MountOptions = {}
): VueWrapper {
  const { withPinia, withRouter, ...otherOptions } = options
  
  const globalOptions: any = {
    ...otherOptions,
    global: {
      ...otherOptions.global,
      plugins: []
    }
  }

  // 如果需要 Pinia
  if (withPinia) {
    globalOptions.global.plugins.push(
      createTestingPinia({
        createSpy: vi.fn
      })
    )
  }

  // 如果需要 Router
  if (withRouter) {
    const router = createRouter({
      history: createWebHistory(),
      routes: []
    })
    globalOptions.global.plugins.push(router)
  }

  return mount(component, globalOptions)
}