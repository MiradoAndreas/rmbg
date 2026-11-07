import asyncio
from contextlib import asynccontextmanager
from io import BytesIO
from ipaddress import ip_address
from pathlib import Path
from socket import getaddrinfo
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, HttpUrl
from rembg import new_session, remove
from starlette.concurrency import run_in_threadpool

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


MAX_UPLOAD_SIZE = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# Une session réutilisable évite de recharger le modèle à chaque requête.
session = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global session
    session = await run_in_threadpool(new_session, "u2net")
    yield
    session = None


app = FastAPI(title="Background Remover", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class URLRequest(BaseModel):
    url: HttpUrl


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


def validate_image(data: bytes) -> None:
    if not data:
        raise HTTPException(400, "Le fichier est vide.")

    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, "Image trop volumineuse (10 Mo maximum).")

    try:
        with Image.open(BytesIO(data)) as img:
            if img.format not in ALLOWED_FORMATS:
                raise HTTPException(
                    415, "Format non accepté. Utilisez JPG, PNG ou WEBP."
                )

            width, height = img.size
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(413, "Résolution trop élevée.")

            img.verify()

    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(400, "Le fichier reçu n'est pas une image valide.")


def process_image(data: bytes) -> bytes:
    validate_image(data)
    result = remove(data, session=session)
    return result


def check_public_url(url: str) -> None:
    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(400, "Seules les URL HTTP/HTTPS sont acceptées.")

    if not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(400, "URL invalide.")

    if parsed.port not in (None, 80, 443):
        raise HTTPException(400, "Port non autorisé.")

    try:
        addresses = getaddrinfo(
            parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)
        )
        if not addresses:
            raise ValueError("Aucune adresse IP.")

        for entry in addresses:
            ip = ip_address(entry[4][0])
            if not ip.is_global:
                raise HTTPException(
                    400, "Les adresses IP privées ou non publiques sont interdites."
                )
    except HTTPException:
        raise
    except (OSError, ValueError):
        raise HTTPException(400, "Impossible de vérifier l'adresse de cette URL.")


async def fetch_image(url: str) -> bytes:
    timeout = httpx.Timeout(15.0, connect=5.0)
    headers = {"User-Agent": "BackgroundRemover/1.0"}

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=False,
        trust_env=False,
    ) as client:
        current_url = url

        for _ in range(4):
            check_public_url(current_url)

            try:
                async with client.stream(
                    "GET", current_url, headers=headers
                ) as response:
                    if response.status_code in (301, 302, 303, 307, 308):
                        location = response.headers.get("location")
                        if not location:
                            raise HTTPException(400, "Redirection invalide.")
                        current_url = urljoin(current_url, location)
                        continue

                    if response.status_code != 200:
                        raise HTTPException(
                            400, "Impossible de télécharger cette image."
                        )

                    content_type = (
                        response.headers.get("content-type", "").split(";")[0].lower()
                    )

                    if not content_type.startswith("image/"):
                        raise HTTPException(415, "L'URL ne renvoie pas un type image.")

                    length = response.headers.get("content-length")
                    if length and int(length) > MAX_UPLOAD_SIZE:
                        raise HTTPException(413, "Image trop volumineuse.")

                    chunks = []
                    total = 0

                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > MAX_UPLOAD_SIZE:
                            raise HTTPException(
                                413, "Image trop volumineuse (10 Mo maximum)."
                            )
                        chunks.append(chunk)

                    return b"".join(chunks)

            except httpx.HTTPError:
                raise HTTPException(
                    400, "Erreur réseau lors du téléchargement de l'image."
                )

        raise HTTPException(400, "Trop de redirections.")


@app.post("/api/remove-bg")
async def remove_bg(file: UploadFile = File(...)):
    data = await file.read(MAX_UPLOAD_SIZE + 1)

    try:
        result = await run_in_threadpool(process_image, data)
    finally:
        await file.close()

    return Response(
        content=result,
        media_type="image/png",
        headers={"Content-Disposition": 'inline; filename="output.png"'},
    )


@app.post("/api/remove-bg-from-url")
async def remove_bg_from_url(body: URLRequest):
    data = await fetch_image(str(body.url))
    result = await run_in_threadpool(process_image, data)

    return Response(
        content=result,
        media_type="image/png",
        headers={"Content-Disposition": 'inline; filename="output.png"'},
    )
