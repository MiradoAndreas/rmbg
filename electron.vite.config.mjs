import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    root: resolve('static'),
    base: '/static/',
    plugins: [{
      name: 'clearcut-html',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const html = bundle['index.html']
        if (html?.type === 'asset') {
          html.source = String(html.source).replaceAll('="./assets/', '="/static/assets/')
        }
      },
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html
          .replace('href="/static/style.css"', 'href="./style.css"')
          .replace('src="/static/script.js" defer', 'type="module" src="./script.js"')
      }
    }],
    build: { rollupOptions: { input: resolve('static/index.html') } }
  }
})
