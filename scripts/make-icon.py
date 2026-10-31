"""生成应用图标（黑胶唱片）——build/icon.png，供 Electron 托盘与 electron-builder 使用"""
import math
import os

from PIL import Image, ImageDraw

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

cx = cy = SIZE // 2
outer = SIZE // 2 - 4

# 外圈红色渐变环（用多层同心圆近似）
for i in range(outer, outer - 60, -1):
    t = (outer - i) / 60
    r = int(255 - 45 * t)
    g = int(92 - 60 * t)
    b = int(92 - 60 * t)
    draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(r, g, b, 255))

# 黑胶盘面
disc = outer - 58
draw.ellipse([cx - disc, cy - disc, cx + disc, cy + disc], fill=(10, 10, 14, 255))

# 唱片纹路
for radius in range(disc - 12, 40, -14):
    shade = 34 if (radius // 14) % 2 == 0 else 26
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=(shade, shade, shade + 4, 255),
        width=2,
    )

# 中心标签
label = int(disc * 0.36)
draw.ellipse([cx - label, cy - label, cx + label, cy + label], fill=(236, 65, 65, 255))
draw.ellipse([cx - label + 10, cy - label + 10, cx + label - 10, cy + label - 10], outline=(255, 255, 255, 46), width=3)

# 中心孔
hole = int(disc * 0.075)
draw.ellipse([cx - hole, cy - hole, cx + hole, cy + hole], fill=(8, 8, 11, 255))

# 一圈柔光高光
for i in range(0, 220):
    angle = math.radians(i * 1.64)
    x = cx + math.cos(angle) * (disc - 22)
    y = cy + math.sin(angle) * (disc - 22)
    draw.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 255, 255, 10))

os.makedirs("build", exist_ok=True)
img.resize((512, 512), Image.LANCZOS).save("build/icon.png")
print("build/icon.png written")
