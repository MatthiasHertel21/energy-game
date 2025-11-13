export function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportSVG(svgEl, filename = 'chart.svg') {
  if (!svgEl) return
  const clone = svgEl.cloneNode(true)
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(clone)
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  download(filename, blob)
}

export function exportPNG(svgEl, filename = 'chart.png', scale = 2) {
  if (!svgEl) return
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svgEl)
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  const img = new Image()
  const width = svgEl.viewBox.baseVal.width || svgEl.getBoundingClientRect().width || svgEl.width.baseVal.value
  const height = svgEl.viewBox.baseVal.height || svgEl.getBoundingClientRect().height || svgEl.height.baseVal.value
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  img.onload = function () {
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => download(filename, blob), 'image/png')
  }
  img.src = url
}