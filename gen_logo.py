from PIL import Image, ImageDraw, ImageFont
import os

W, H = 128, 128
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Rounded rectangle background
def rounded_rect(draw, xy, radius, fill):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)

rounded_rect(draw, [0, 0, W-1, H-1], radius=22, fill=(13, 17, 23, 255))

# Blue top accent bar
draw.rounded_rectangle([0, 0, W, 5], radius=3, fill=(88, 166, 255, 255))

# Try to use a bold font, fallback to default
try:
    font_large = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 72)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 14)
except:
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 72)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
    except:
        font_large = ImageFont.load_default()
        font_small = font_large

# Draw "D" in white
draw.text((14, 8), "D", font=font_large, fill=(255, 255, 255, 255))

# Draw "C" in blue
draw.text((60, 8), "C", font=font_large, fill=(88, 166, 255, 255))

# Diagonal cut slash between D and C
draw.line([(59, 10), (51, 98)], fill=(88, 166, 255, 200), width=4)

# Bottom status bar hint
draw.rounded_rectangle([16, 103, 112, 110], radius=3, fill=(33, 38, 45, 255))
draw.rounded_rectangle([16, 103, 56,  110], radius=3, fill=(88, 166, 255, 180))

# Border
draw.rounded_rectangle([0, 0, W-1, H-1], radius=22, outline=(33, 38, 45, 255), width=2)

out = os.path.join(os.path.dirname(__file__), "logo.png")
img.save(out, "PNG")
print(f"Saved: {out}")
