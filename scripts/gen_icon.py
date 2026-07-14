from PIL import Image, ImageDraw

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

pad = 40
radius = 190
draw.rounded_rectangle((pad, pad, SIZE - pad, SIZE - pad), radius=radius, fill=(10, 10, 12, 255))

WHITE = (255, 255, 255, 255)
stroke_w = 40


def scale(x, y):
    cx, cy = SIZE / 2, SIZE / 2
    s = 27.5
    ox, oy = 12, 12.2
    return (cx + (x - ox) * s, cy + (y - oy) * s)


def thick_line(points, closed=False):
    pts = points + [points[0]] if closed else points
    draw.line(pts, fill=WHITE, width=stroke_w, joint="curve")
    r = stroke_w / 2
    for p in pts:
        draw.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=WHITE)


# Top diamond (outline, matches "M12 3l8.5 4.5L12 12 3.5 7.5z")
diamond = [scale(12, 3), scale(20.5, 7.5), scale(12, 12), scale(3.5, 7.5)]
thick_line(diamond, closed=True)

# Two chevrons below (matches the two open V-shaped paths)
thick_line([scale(3.5, 12), scale(12, 16.5), scale(20.5, 12)])
thick_line([scale(3.5, 16.5), scale(12, 21), scale(20.5, 16.5)])

img.save(r"C:\Users\johannes.hehl\Documents\Projekte\CodeNest V2\scripts\icon-source.png")
print("done")
