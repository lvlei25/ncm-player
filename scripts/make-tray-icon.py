"""生成系统托盘用的单色黑胶符号图标（明/暗两套，含 @2x）。

状态栏图标应与系统单色符号一致：透明底、无彩色方块底座。
用纯色 + alpha 蒙版绘制，避免缩放时 RGB 被插值成杂色。
Electron 的 nativeImage 会自动把 `<name>@2x.png` 合成高 DPI 表示。
"""
import os

from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "build")
SIZE = 22
SS = 12
S = SIZE * SS
CX = CY = S // 2

# 浅色顶栏用深灰符号；深色顶栏用近白色符号
VARIANTS = {
    "tray-dark.png": (44, 44, 48, 255),
    "tray-light.png": (245, 245, 248, 255),
}


def draw_mask() -> Image.Image:
    mask = Image.new("L", (S, S), 0)
    draw = ImageDraw.Draw(mask)
    outer = int(S * 0.40)
    line = max(2, int(S * 0.085))

    # 外圈：唱片轮廓
    draw.ellipse([CX - outer, CY - outer, CX + outer, CY + outer], outline=255, width=line)
    # 内侧纹路（较低不透明度，避免 22px 下糊成一团）
    inner = int(S * 0.27)
    draw.ellipse([CX - inner, CY - inner, CX + inner, CY + inner], outline=150, width=max(1, int(S * 0.035)))
    # 中心标签
    label = int(S * 0.085)
    draw.ellipse([CX - label, CY - label, CX + label, CY + label], fill=255)
    return mask


def save_variant(name: str, color, mask: Image.Image) -> None:
    small = mask.resize((SIZE, SIZE), Image.LANCZOS)
    big = mask.resize((SIZE * 2, SIZE * 2), Image.LANCZOS)
    for alpha, out_name in ((small, name), (big, name.replace(".png", "@2x.png"))):
        img = Image.new("RGBA", alpha.size, color)
        img.putalpha(alpha)
        img.save(os.path.join(OUT_DIR, out_name))
    print("wrote", name, "and @2x")


mask = draw_mask()
for name, color in VARIANTS.items():
    save_variant(name, color, mask)
