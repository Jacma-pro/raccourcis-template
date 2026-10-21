"""API du carnet : les fichiers Markdown sont la seule source de données."""
import re
import unicodedata
from pathlib import Path

import frontmatter
from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException
from yaml import YAMLError

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 256 * 1024
CONTENT_DIR = Path(__file__).resolve().parent.parent / "content"
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LIMITS = {"title": 120, "description": 300, "keys": 120, "category": 60}


class InvalidShortcut(ValueError):
    """Une fiche externe ne respecte pas le contrat attendu."""


def validate_metadata(data):
    if not isinstance(data, dict):
        raise InvalidShortcut("Les métadonnées doivent être un objet.")
    result = {}
    for field, maximum in LIMITS.items():
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            raise InvalidShortcut(f"Le champ {field} est obligatoire et doit être un texte.")
        if len(value.strip()) > maximum:
            raise InvalidShortcut(f"Le champ {field} dépasse {maximum} caractères.")
        result[field] = value.strip()
    return result


def shortcut_path(slug):
    if not SLUG_PATTERN.fullmatch(slug):
        return None
    path = CONTENT_DIR / f"{slug}.md"
    # Ne pas suivre un lien symbolique placé dans le dossier partagé.
    if path.is_symlink():
        return None
    return path


def read_shortcut(path):
    try:
        post = frontmatter.loads(path.read_text(encoding="utf-8"))
        metadata = validate_metadata(post.metadata)
    except (UnicodeError, YAMLError, ValueError, TypeError) as error:
        raise InvalidShortcut(f"Fiche {path.name} : {error}") from error
    return {"slug": path.stem, **metadata, "content": post.content}


@app.errorhandler(InvalidShortcut)
def invalid_shortcut(error):
    return jsonify(error=str(error)), 422


@app.errorhandler(HTTPException)
def http_error(error):
    return jsonify(error=error.description), error.code


@app.errorhandler(OSError)
def storage_error(error):
    app.logger.error("Erreur de stockage : %s", type(error).__name__)
    return jsonify(error="Impossible de lire ou écrire les fichiers Markdown."), 500


@app.get("/api/shortcuts")
def list_shortcuts():
    shortcuts = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        if shortcut_path(path.stem) is None:
            raise InvalidShortcut(f"Nom de fichier non autorisé : {path.name}")
        shortcut = read_shortcut(path)
        shortcuts.append({key: value for key, value in shortcut.items() if key != "content"})
    shortcuts.sort(key=lambda shortcut: shortcut["title"].casefold())
    return jsonify(shortcuts)


@app.get("/api/shortcuts/<slug>")
def get_shortcut(slug):
    path = shortcut_path(slug)
    if path is None or not path.is_file():
        return jsonify(error="Raccourci introuvable."), 404
    return jsonify(read_shortcut(path))


@app.post("/api/shortcuts")
def create_shortcut():
    data = request.get_json()
    metadata = validate_metadata(data)
    content = data.get("content")
    if not isinstance(content, str) or not content.strip():
        raise InvalidShortcut("Le contenu Markdown est obligatoire.")
    title_ascii = unicodedata.normalize("NFKD", metadata["title"]).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", title_ascii.lower()).strip("-")
    if not slug:
        raise InvalidShortcut("Le titre doit contenir au moins une lettre latine ou un chiffre.")
    path = shortcut_path(slug)
    if path is None:
        return jsonify(error="Ce nom de fichier est indisponible."), 409
    post = frontmatter.Post(content.strip(), **metadata)
    # Le mode x empêche d'écraser une fiche, y compris en cas de créations simultanées.
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(frontmatter.dumps(post) + "\n")
    except FileExistsError:
        return jsonify(error="Une fiche porte déjà ce titre. Choisissez un autre titre."), 409
    return jsonify({"slug": slug, **metadata, "content": content.strip()}), 201
