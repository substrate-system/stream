import { type FunctionComponent, render } from 'preact'
import { html } from 'htm/preact'
import { S } from '../src/index.js'

const Example:FunctionComponent<unknown> = function () {
    return html`<div>hello</div>`
}

render(html`<${Example} />`, document.getElementById('root')!)