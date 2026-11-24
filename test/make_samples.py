"""Generate sample files for testing Folio (text, CJK encodings, forms, images, encrypted)."""
import io, os, subprocess, sys, random
from reportlab.lib.pagesizes import A4, letter, landscape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.colors import HexColor, black, white
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "samples"
os.makedirs(OUT, exist_ok=True)
P = lambda n: os.path.join(OUT, n)


def report():
    c = canvas.Canvas(P("report.pdf"), pagesize=A4)
    c.setTitle("Quarterly Field Report")
    c.setAuthor("Sample Author")
    c.setSubject("Test document for Folio")
    w, h = A4
    chapters = ["Introduction", "Methods", "Results", "Appendix"]
    page = 0
    for ci, ch in enumerate(chapters):
        for k in range(3):
            page += 1
            if page == 5:
                c.setPageSize(landscape(A4))
            elif page == 6:
                c.setPageSize(letter)
            else:
                c.setPageSize(A4)
            pw, ph = c._pagesize
            if k == 0:
                c.bookmarkPage(f"ch{ci}")
                c.addOutlineEntry(ch, f"ch{ci}", level=0)
            c.setFillColor(HexColor("#1240e0"))
            c.rect(0, ph - 70, pw, 70, fill=1, stroke=0)
            c.setFillColor(white)
            c.setFont("Helvetica-Bold", 22)
            c.drawString(40, ph - 45, f"{ch} — part {k + 1}")
            c.setFillColor(black)
            c.setFont("Times-Roman", 12)
            y = ph - 110
            for line in range(28):
                c.drawString(60, y, f"Line {line + 1}: The quick brown fox jumps over the lazy dog. café naïve résumé €")
                y -= 20
            c.setFont("Helvetica", 9)
            c.drawCentredString(pw / 2, 30, f"Page {page}")
            if page == 8:
                c.setPageRotation(90)
            c.showPage()
    c.save()


def encodings():
    from reportlab.pdfbase import _cidfontdata
    _cidfontdata.defaultUnicodeEncodings['MSung-Light'] = ('cht', 'UniCNS-UCS2-H')  # reportlab ships the wrong CMap here
    c = canvas.Canvas(P("encodings.pdf"), pagesize=A4)
    c.setTitle("Encodings sampler")
    fonts = [
        ("HeiseiMin-W3", "日本語のテキスト：こんにちは世界。漢字とかな。"),
        ("HeiseiKakuGo-W5", "ゴシック体：東京都・大阪府・京都府"),
        ("STSong-Light", "简体中文：你好，世界。数据编码测试。"),
        ("MSung-Light", "繁體中文：你好，世界。資料編碼測試。"),
        ("HYSMyeongJo-Medium", "한국어 텍스트: 안녕하세요 세계"),
    ]
    for f, _ in fonts:
        pdfmetrics.registerFont(UnicodeCIDFont(f))
    c.setFont("Helvetica-Bold", 18)
    c.drawString(40, 800, "Encodings sampler (non-embedded CID fonts + CMaps)")
    y = 760
    for f, txt in fonts:
        c.setFont("Helvetica", 10)
        c.drawString(40, y + 16, f)
        c.setFont(f, 16)
        c.drawString(40, y - 4, txt)
        y -= 60
    c.setFont("Courier", 12)
    c.drawString(40, y - 30, "WinAnsi: ÀÉÎÕÜ ß æ ø … – — “quotes” ‰ €")
    c.showPage()
    c.save()


def form():
    c = canvas.Canvas(P("form.pdf"), pagesize=letter)
    c.setTitle("Membership form")
    f = c.acroForm
    c.setFont("Helvetica-Bold", 20)
    c.drawString(50, 740, "Membership application")
    c.setFont("Helvetica", 11)
    c.drawString(50, 700, "Full name")
    f.textfield(name="full_name", tooltip="Full name", x=150, y=690, width=300, height=22, borderWidth=1)
    c.drawString(50, 660, "Email")
    f.textfield(name="email", tooltip="Email address", x=150, y=650, width=300, height=22, borderWidth=1)
    c.drawString(50, 620, "Notes")
    f.textfield(name="notes", tooltip="Notes", x=150, y=560, width=300, height=70, fieldFlags="multiline", borderWidth=1)
    c.drawString(50, 520, "Subscribe to newsletter")
    f.checkbox(name="newsletter", tooltip="Newsletter", x=220, y=515, size=16, buttonStyle="check")
    c.drawString(50, 480, "Plan")
    for i, v in enumerate(["basic", "plus", "pro"]):
        c.drawString(170 + i * 90, 480, v.title())
        f.radio(name="plan", tooltip="Plan", value=v, selected=(v == "basic"), x=150 + i * 90, y=476, size=16, buttonStyle="circle")
    c.drawString(50, 440, "Country")
    f.choice(name="country", tooltip="Country", value="Canada", options=["Canada", "United States", "Mexico", "Other"], x=150, y=432, width=200, height=22)
    c.drawString(50, 400, "Interests")
    f.listbox(name="interests", tooltip="Interests", value="Hiking", options=["Hiking", "Reading", "Cooking", "Music"], x=150, y=330, width=200, height=80, fieldFlags="multiSelect")
    c.showPage()
    c.drawString(50, 740, "Page 2 — signature area")
    f.textfield(name="date", tooltip="Date", x=150, y=690, width=150, height=22, borderWidth=1)
    c.showPage()
    c.save()


def photos():
    random.seed(4)
    imgs = []
    for i, (w, h) in enumerate([(3000, 2000), (2400, 3200), (1600, 1600)]):
        im = Image.new("RGB", (w, h))
        d = ImageDraw.Draw(im)
        for y in range(0, h, 4):
            r = int(80 + 120 * y / h)
            d.line([(0, y), (w, y)], fill=(r, 120 + i * 30, 200 - r // 2))
        for _ in range(250):
            x0, y0 = random.randrange(w), random.randrange(h)
            rad = random.randrange(20, 200)
            d.ellipse([x0, y0, x0 + rad, y0 + rad], fill=tuple(random.randrange(256) for _ in range(3)))
        im = im.filter(ImageFilter.GaussianBlur(1.2))
        path = P(f"photo{i + 1}.jpg")
        im.save(path, quality=95)
        imgs.append(path)
    logo = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    d = ImageDraw.Draw(logo)
    d.ellipse([40, 40, 560, 560], fill=(18, 64, 224, 255))
    d.rectangle([200, 150, 400, 450], fill=(255, 255, 255, 230))
    logo.save(P("logo.png"))
    Image.open(imgs[2]).resize((800, 800)).save(P("small.webp"), quality=80)
    # A heavy PDF: large JPEGs + an uncompressed-ish PNG drawn on pages
    c = canvas.Canvas(P("photos.pdf"), pagesize=A4)
    for p in imgs:
        c.drawImage(p, 40, 120, width=515, height=640, preserveAspectRatio=True)
        c.setFont("Helvetica", 14)
        c.drawString(40, 80, os.path.basename(p))
        c.showPage()
    c.drawImage(P("logo.png"), 150, 300, width=300, height=300, mask="auto")
    c.drawString(40, 80, "PNG with transparency")
    c.showPage()
    c.save()


def scan_like():
    # a "scanned" page with whitespace margins for auto-crop
    im = Image.new("RGB", (1240, 1754), "white")
    d = ImageDraw.Draw(im)
    d.rectangle([260, 300, 980, 1400], outline="black", width=6)
    for i in range(18):
        d.line([(300, 360 + i * 56), (940, 360 + i * 56)], fill=(40, 40, 40), width=8)
    im.save(P("scan.png"))
    c = canvas.Canvas(P("scan.pdf"), pagesize=A4)
    c.drawImage(P("scan.png"), 0, 0, width=A4[0], height=A4[1])
    c.showPage()
    c.save()


def big_pages():
    """200 A4 text pages with bookmarks every 25 — page-count / DOM stress."""
    c = canvas.Canvas(P("big-pages.pdf"), pagesize=A4)
    c.setTitle("Big pages stress")
    c.setAuthor("Folio test")
    w, h = A4
    for page in range(1, 201):
        if (page - 1) % 25 == 0:
            key = f"sec{(page - 1) // 25}"
            c.bookmarkPage(key)
            c.addOutlineEntry(f"Section {(page - 1) // 25 + 1}", key, level=0)
        c.setFillColor(HexColor("#1240e0"))
        c.rect(0, h - 56, w, 56, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(40, h - 36, f"Stress page {page} of 200")
        c.setFillColor(black)
        c.setFont("Helvetica", 11)
        y = h - 90
        for line in range(38):
            c.drawString(50, y, f"Page {page} line {line + 1}: The quick brown fox jumps over the lazy dog.")
            y -= 18
        c.setFont("Helvetica", 9)
        c.drawCentredString(w / 2, 28, f"Page {page}")
        c.showPage()
    c.save()


def big_images():
    """40 unique ~1200×1600 JPEG pages — memory / compress stress (~15–40 MB)."""
    c = canvas.Canvas(P("big-images.pdf"), pagesize=A4)
    c.setTitle("Big images stress")
    tiles = []
    for i in range(40):
        random.seed(1000 + i)
        im = Image.new("RGB", (1200, 1600))
        d = ImageDraw.Draw(im)
        for y in range(0, 1600, 2):
            r = int(40 + 180 * y / 1600)
            g = (r + i * 3) % 256
            d.line([(0, y), (1200, y)], fill=(r, g, 220 - r // 2))
        for _ in range(120):
            x0, y0 = random.randrange(1200), random.randrange(1600)
            rad = random.randrange(20, 220)
            d.ellipse([x0, y0, x0 + rad, y0 + rad], fill=tuple(random.randrange(256) for _ in range(3)))
        d.text((40, 40), f"IMG {i + 1}", fill=(255, 255, 255))
        tile = P(f"_big_tile_{i}.jpg")
        im.save(tile, quality=93)
        tiles.append(tile)
        c.drawImage(tile, 40, 80, width=515, height=700, preserveAspectRatio=True)
        c.setFont("Helvetica", 12)
        c.drawString(40, 50, f"Image page {i + 1} of 40")
        c.showPage()
    c.save()
    for tile in tiles:
        try:
            os.remove(tile)
        except OSError:
            pass


def signing_cert():
    """Self-signed PKCS#12 for digital-sign e2e (password: testpass)."""
    key = P("_test.key")
    crt = P("_test.crt")
    p12 = P("signer.p12")
    subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", crt,
         "-days", "365", "-nodes", "-subj", "/CN=Folio Test Signer/O=Test/C=US"],
        check=True, capture_output=True)
    subprocess.run(
        ["openssl", "pkcs12", "-export", "-out", p12, "-inkey", key, "-in", crt,
         "-passout", "pass:testpass", "-name", "Folio Test"],
        check=True, capture_output=True)
    for tmp in (key, crt):
        try:
            os.remove(tmp)
        except OSError:
            pass


report(); encodings(); form(); photos(); scan_like(); big_pages(); big_images()
subprocess.run(["qpdf", "--encrypt", "secret", "owner-pw", "256", "--", P("report.pdf"), P("locked.pdf")], check=True)
subprocess.run(["qpdf", "--encrypt", "", "owner-only", "128", "--use-aes=y", "--", P("form.pdf"), P("owner-locked.pdf")], check=True)
signing_cert()
print("\n".join(sorted(os.listdir(OUT))))
