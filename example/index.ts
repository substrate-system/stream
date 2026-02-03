import { S } from '../src/index.js'
const IMG_URL = 'https://raw.githubusercontent.com/substrate-system/stream/main/example/coffee.jpg'

document.body.innerHTML += `
    <img alt="test image" />
`

const image = await fetch(IMG_URL)
if (image.body) {
    const buffer = await S(image.body).collect()
    const blob = new Blob([buffer], { type: 'image/jpeg' })
    const objectUrl = URL.createObjectURL(blob)
    document.querySelector('img')!.src = objectUrl
}
