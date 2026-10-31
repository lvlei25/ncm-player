"""生成应用图标（黑胶 · 玻璃拟态），输出 build/icon.png 与 build/icons/ 多尺寸 PNG。

设计要点：
- 圆角方形底座（现代桌面图标比例），深色渐层 + 底部红色柔光
- 黑胶盘面用径向渐层 + 细密纹路 + 左上高光弧，产生转动中的反射感
- 中心标签用红色径向渐层 + 内环高光，避免扁平
- 4 倍超采样后 LANCZOS 缩放，保证 16px 下边缘依然干净
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

BASE = 1024          # 目标尺寸
SS = 3               # 超采样倍数
S = BASE * SS        # 绘制画布
CX = CY = S // 2

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


# ---------- 1. 底座：竖向渐层 ----------
bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw_bg = ImageDraw.Draw(bg)
for y in range(S):
    t = y / (S - 1)
    # 品牌红渐层：#FF5C5C → #B31E1E，与黑色黑胶形成强对比
    r = int(255 - 76 * t)
    g = int(92 - 62 * t)
    b = int(92 - 62 * t)
    draw_bg.line([(0, y), (S, y)], fill=(r, g, b, 255))

# 顶部一点点提亮，模拟环境光
top_glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dg = ImageDraw.Draw(top_glow)
for i in range(140):
    alpha = int(16 * (1 - i / 140))
    dg.ellipse([CX - S * 0.62 + i, -S * 0.55 + i, CX + S * 0.62 - i, S * 0.5 - i], fill=(255, 255, 255, alpha))
bg = Image.alpha_composite(bg, top_glow)

# 左上角高光，让红色底座有体积感
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dgl = ImageDraw.Draw(glow)
for i in range(70):
    t = i / 70
    alpha = int(22 * (1 - t) ** 2)
    radius = int(S * 0.46 * (1 - t) + S * 0.06)
    dgl.ellipse([CX - radius, int(S * 0.1) - radius, CX + radius, int(S * 0.1) + radius], fill=(255, 255, 255, alpha))
glow = glow.filter(ImageFilter.GaussianBlur(S * 0.04))
bg = Image.alpha_composite(bg, glow)

# 圆角裁切 + 极细描边
mask = rounded_mask(S, int(S * 0.225))
img.paste(bg, (0, 0), mask)

edge = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(edge).rounded_rectangle(
    [2, 2, S - 3, S - 3], radius=int(S * 0.225), outline=(255, 255, 255, 22), width=3
)
img = Image.alpha_composite(img, edge)

# ---------- 2. 盘面阴影 ----------
disc_r = int(S * 0.345)
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).ellipse(
    [CX - disc_r, CY - disc_r + int(S * 0.03), CX + disc_r, CY + disc_r + int(S * 0.03)],
    fill=(0, 0, 0, 170),
)
shadow = shadow.filter(ImageFilter.GaussianBlur(S * 0.022))
img = Image.alpha_composite(img, shadow)

# ---------- 3. 黑胶盘面（径向渐层） ----------
disc = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dd = ImageDraw.Draw(disc)
steps = 220
for i in range(steps, 0, -1):
    t = i / steps
    radius = int(disc_r * t)
    shade = int(8 + 30 * (1 - t) ** 1.4)
    dd.ellipse([CX - radius, CY - radius, CX + radius, CY + radius],
               fill=(shade, shade, min(255, shade + 6), 255))

# 纹路
for ring in range(disc_r - int(S * 0.012), int(disc_r * 0.42), -int(S * 0.0075)):
    dd.ellipse([CX - ring, CY - ring, CX + ring, CY + ring], outline=(255, 255, 255, 20), width=2)

# 盘面外缘细亮边：小尺寸下也能看清唱片轮廓
dd.ellipse(
    [CX - disc_r + 2, CY - disc_r + 2, CX + disc_r - 2, CY + disc_r - 2],
    outline=(255, 255, 255, 30),
    width=3,
)

disc.putalpha(Image.composite(disc.getchannel("A"), Image.new("L", (S, S), 0), disc.getchannel("A")))
img = Image.alpha_composite(img, disc)

# ---------- 4. 高光弧 ----------
spec = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ds = ImageDraw.Draw(spec)
for r, alpha, width in ((disc_r - int(S * 0.02), 58, 7), (disc_r - int(S * 0.075), 30, 5)):
    ds.arc([CX - r, CY - r, CX + r, CY + r], start=196, end=286, fill=(255, 255, 255, alpha), width=width)
spec = spec.filter(ImageFilter.GaussianBlur(2))
img = Image.alpha_composite(img, spec)

# 盘面下缘的红色边缘光，让唱片从深色底上「浮」起来
rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(rim).arc(
    [CX - disc_r + 3, CY - disc_r + 3, CX + disc_r - 3, CY + disc_r - 3],
    start=18,
    end=162,
    fill=(255, 116, 116, 64),
    width=6,
)
rim = rim.filter(ImageFilter.GaussianBlur(S * 0.004))
img = Image.alpha_composite(img, rim)

# ---------- 5. 中心标签 ----------
label_r = int(disc_r * 0.40)
label = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dl = ImageDraw.Draw(label)
for i in range(120, 0, -1):
    t = i / 120
    radius = int(label_r * t)
    r = int(236 + 19 * (1 - t))
    g = int(65 + 27 * (1 - t))
    b = int(65 + 27 * (1 - t))
    dl.ellipse([CX - radius, CY - radius, CX + radius, CY + radius], fill=(min(r, 255), min(g, 255), min(b, 255), 255))
# 标签内环高光
dl.ellipse(
    [CX - label_r + int(S * 0.008), CY - label_r + int(S * 0.008), CX + label_r - int(S * 0.008), CY + label_r - int(S * 0.008)],
    outline=(255, 255, 255, 40),
    width=3,
)
img = Image.alpha_composite(img, label)

# 标签顶部柔光
sheet = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(sheet).ellipse(
    [CX - label_r, CY - label_r, CX + label_r, CY + label_r], fill=(255, 255, 255, 26)
)
sheet = sheet.filter(ImageFilter.GaussianBlur(S * 0.012))
img = Image.alpha_composite(img, sheet)

# ---------- 6. 中心孔 ----------
hole_r = int(disc_r * 0.085)
dh = ImageDraw.Draw(img)
dh.ellipse([CX - hole_r, CY - hole_r, CX + hole_r, CY + hole_r], fill=(7, 7, 10, 255))
dh.ellipse([CX - hole_r, CY - hole_r, CX + hole_r, CY + hole_r], outline=(255, 255, 255, 34), width=3)

# ---------- 7. 导出 ----------
os.makedirs("build/icons", exist_ok=True)
master = img.resize((BASE, BASE), Image.LANCZOS)
master.save("build/icon.png")

for size in (16, 24, 32, 48, 64, 128, 256, 512):
    master.resize((size, size), Image.LANCZOS).save(f"build/icons/{size}x{size}.png")

print("build/icon.png + build/icons/*.png 已生成")
